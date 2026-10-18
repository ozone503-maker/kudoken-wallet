// Runs only the Base Sepolia part (seed KDU + send/tip/pay/payout) against an existing L2 token. Usage: L2_TOKEN=0x… node scripts/e2e-flows.mjs
import fs from 'fs';
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, erc20Abi, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getNet } from '../lib/chains.js';
import { memoData } from '../lib/memo.js';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')));
const net = getNet('base-sepolia'); const RPC = process.env.L2_RPC || 'https://sepolia.base.org';
const pub = createPublicClient({ chain: net.chain, transport: http(RPC) });
const [D, T, U, M] = ['DEPLOYER', 'TREASURY', 'USER', 'MERCHANT'].map((k) => privateKeyToAccount(env[k + '_PK']));
const token = process.env.L2_TOKEN; const kdu = (n) => parseUnits(String(n), 18); const txs = {};
async function send(label, acct, data) {
  const nonce = await pub.getTransactionCount({ address: acct.address, blockTag: 'pending' });
  const hash = await createWalletClient({ account: acct, chain: net.chain, transport: http(RPC) }).sendTransaction({ to: token, data, nonce });
  const r = await pub.waitForTransactionReceipt({ hash }); console.log(label, r.status, hash); txs[label] = hash;
  if (r.status !== 'success') throw new Error(label); await new Promise((s) => setTimeout(s, 1500));
}
await send('seed_kdu_treasury', D, memoData(T.address, kdu(500000)));
await send('seed_kdu_user', D, memoData(U.address, kdu(1000)));
await send('send', U, memoData(M.address, kdu(25)));
await send('tip', U, memoData(M.address, kdu(5), 'tip'));
await send('pay', U, memoData(M.address, kdu(42), 'order:FP-1001'));
await send('payout', T, memoData(U.address, kdu(77), 'race:MJ-4242'));
const bal = {};
for (const [k, a] of Object.entries({ deployer: D, treasury: T, user: U, merchant: M })) bal[k] = { kdu: formatUnits(await pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [a.address] }), 18), eth: formatEther(await pub.getBalance({ address: a.address })) };
console.log(JSON.stringify({ txs, bal }, null, 2));
fs.writeFileSync('e2e-flows-live.json', JSON.stringify({ token, txs, bal }, null, 2));
