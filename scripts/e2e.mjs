// End-to-end: deploy test KDU on Ethereum Sepolia, create Base Sepolia twin via OptimismMintableERC20Factory,
// bridge via L1StandardBridge, then run send / tip / pay / payout on Base Sepolia.
// LIVE (default): needs Sepolia ETH on DEPLOYER (and some bridged to Base Sepolia for gas).
// FORK=1: runs the same txs against local anvil forks of Sepolia + Base Sepolia (no funds needed).
import fs from 'fs';
import { createPublicClient, createWalletClient, http, parseEther, parseUnits, formatUnits, erc20Abi, parseAbi, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { getNet } from '../lib/chains.js';
import { memoData } from '../lib/memo.js';
import { payWinner } from '../lib/payout.js';

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')));
const FORK = process.env.FORK === '1';
const L1_RPC = process.env.L1_RPC || (FORK ? 'http://127.0.0.1:8545' : 'https://ethereum-sepolia-rpc.publicnode.com');
const L2_RPC = process.env.L2_RPC || (FORK ? 'http://127.0.0.1:8546' : 'https://sepolia.base.org');
const L1_BRIDGE = '0xfd0Bf71F60660E2f608ed56e1659C450eB113120';
const L2_FACTORY = '0x4200000000000000000000000000000000000012';
const L2_BRIDGE = '0x4200000000000000000000000000000000000010';
const net = getNet('base-sepolia');
const acct = (k) => privateKeyToAccount(env[k + '_PK']);
const [D, T, U, M] = ['DEPLOYER', 'TREASURY', 'USER', 'MERCHANT'].map(acct);
const l1 = createPublicClient({ chain: sepolia, transport: http(L1_RPC) });
const l2 = createPublicClient({ chain: net.chain, transport: http(L2_RPC) });
const w1 = (a) => createWalletClient({ account: a, chain: sepolia, transport: http(L1_RPC) });
const w2 = (a) => createWalletClient({ account: a, chain: net.chain, transport: http(L2_RPC) });
const out = { mode: FORK ? 'fork' : 'live', txs: {} };
const rec = async (pub, label, hash) => { const r = await pub.waitForTransactionReceipt({ hash }); console.log(label, r.status, hash); out.txs[label] = hash; if (r.status !== 'success') throw new Error(label + ' reverted'); return r; };
const kdu = (n) => parseUnits(String(n), 18);

if (FORK) for (const [pub, a] of [[l1, D], [l2, D], [l2, T], [l2, U]]) await pub.request({ method: 'anvil_setBalance', params: [a.address, '0x' + parseEther('1').toString(16)] });

// 1. L1 test token
const art = JSON.parse(fs.readFileSync(new URL('../build/KudokenTest.sol/KudokenTest.json', import.meta.url)));
let h = await w1(D).deployContract({ abi: art.abi, bytecode: art.bytecode.object, args: [D.address] });
const l1Token = (await rec(l1, 'l1_deploy', h)).contractAddress; out.l1Token = l1Token;

// 2. L2 twin through the canonical factory
const fAbi = parseAbi(['function createOptimismMintableERC20(address _remoteToken, string _name, string _symbol) returns (address)', 'event OptimismMintableERC20Created(address indexed localToken, address indexed remoteToken, address deployer)']);
h = await w2(D).writeContract({ address: L2_FACTORY, abi: fAbi, functionName: 'createOptimismMintableERC20', args: [l1Token, 'Kudoken (test)', 'KDU'] });
const r2 = await rec(l2, 'l2_factory_create', h);
const ev = r2.logs.map((l) => { try { return decodeEventLog({ abi: fAbi, ...l }); } catch { return null; } }).find((e) => e?.eventName === 'OptimismMintableERC20Created');
const l2Token = ev.args.localToken; out.l2Token = l2Token;

// 3. Bridge 1,000,000 test KDU to Base Sepolia (same calls Gabriel signs on mainnet: approve + depositERC20To)
const amt = kdu(1_000_000);
h = await w1(D).writeContract({ address: l1Token, abi: erc20Abi, functionName: 'approve', args: [L1_BRIDGE, amt] }); await rec(l1, 'l1_approve', h);
const bAbi = parseAbi(['function depositERC20To(address _l1Token, address _l2Token, address _to, uint256 _amount, uint32 _minGasLimit, bytes _extraData)']);
h = await w1(D).writeContract({ address: L1_BRIDGE, abi: bAbi, functionName: 'depositERC20To', args: [l1Token, l2Token, D.address, amt, 200000, '0x'] }); await rec(l1, 'l1_bridge_deposit', h);
const locked = await l1.readContract({ address: l1Token, abi: erc20Abi, functionName: 'balanceOf', args: [L1_BRIDGE] });
console.log('locked in L1StandardBridge', formatUnits(locked, 18));
if (FORK) {
  // anvil forks are not connected by the sequencer; simulate the relay: the L2StandardBridge is the only minter
  await l2.request({ method: 'anvil_impersonateAccount', params: [L2_BRIDGE] });
  await l2.request({ method: 'anvil_setBalance', params: [L2_BRIDGE, '0x' + parseEther('1').toString(16)] });
  const mAbi = parseAbi(['function mint(address,uint256)']);
  h = await createWalletClient({ account: L2_BRIDGE, chain: net.chain, transport: http(L2_RPC) }).writeContract({ address: l2Token, abi: mAbi, functionName: 'mint', args: [D.address, amt] });
  await rec(l2, 'l2_relay_mint_simulated', h);
} else {
  process.stdout.write('waiting for deposit to land on Base Sepolia');
  for (let i = 0; i < 90; i++) { if (await l2.readContract({ address: l2Token, abi: erc20Abi, functionName: 'balanceOf', args: [D.address] }) >= amt) break; process.stdout.write('.'); await new Promise((r) => setTimeout(r, 10000)); }
  console.log();
}
out.l2BalanceAfterBridge = formatUnits(await l2.readContract({ address: l2Token, abi: erc20Abi, functionName: 'balanceOf', args: [D.address] }), 18);

// 4. Seed treasury + user on L2
const gas = FORK ? parseEther('0.01') : parseEther(process.env.SEED_ETH || '0.002');
for (const a of [T, U]) {
  h = await w2(D).sendTransaction({ to: a.address, value: gas }); await rec(l2, 'seed_eth_' + (a === T ? 'treasury' : 'user'), h);
}
h = await w2(D).writeContract({ address: l2Token, abi: erc20Abi, functionName: 'transfer', args: [T.address, kdu(500_000)] }); await rec(l2, 'seed_kdu_treasury', h);
h = await w2(D).writeContract({ address: l2Token, abi: erc20Abi, functionName: 'transfer', args: [U.address, kdu(1000)] }); await rec(l2, 'seed_kdu_user', h);

// 5. Widget flows (same calldata the widget builds)
h = await w2(U).sendTransaction({ to: l2Token, data: memoData(M.address, kdu(25)) }); await rec(l2, 'send', h);
h = await w2(U).sendTransaction({ to: l2Token, data: memoData(M.address, kdu(5), 'tip') }); await rec(l2, 'tip', h);
h = await w2(U).sendTransaction({ to: l2Token, data: memoData(M.address, kdu(42), 'order:FP-1001') }); await rec(l2, 'pay', h);
const p = await payWinner({ to: U.address, amount: 77, memo: 'race:MJ-4242', pk: env.TREASURY_PK, token: l2Token, chainKey: 'base-sepolia', rpc: L2_RPC });
console.log('payout', p.status, p.hash); out.txs.payout = p.hash;
out.balances = {};
for (const [k, a] of Object.entries({ treasury: T, user: U, merchant: M })) out.balances[k] = formatUnits(await l2.readContract({ address: l2Token, abi: erc20Abi, functionName: 'balanceOf', args: [a.address] }), 18);
out.addresses = { deployer: D.address, treasury: T.address, user: U.address, merchant: M.address };
fs.writeFileSync(new URL(`../e2e-result-${out.mode}.json`, import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
