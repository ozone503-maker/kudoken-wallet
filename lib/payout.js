// Treasury payout core. Shared by api/payout.js (Vercel) and scripts/payout.mjs (CLI).
import { createWalletClient, createPublicClient, http, parseUnits, erc20Abi, encodeFunctionData, toHex, isAddress, concat } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getNet } from './chains.js';
import { memoData } from './memo.js';


export async function payWinner({ to, amount, memo, pk, token, chainKey, rpc }) {
  if (!isAddress(to)) throw new Error('bad winner address');
  if (!isAddress(token)) throw new Error('bad token address');
  const net = getNet(chainKey);
  const account = privateKeyToAccount(pk);
  const transport = http(rpc || net.rpc);
  const wallet = createWalletClient({ account, chain: net.chain, transport });
  const pub = createPublicClient({ chain: net.chain, transport });
  const value = parseUnits(String(amount), 18);
  const hash = await wallet.sendTransaction({ to: token, data: memoData(to, value, memo) });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status, explorer: `${net.explorer}/tx/${hash}` };
}
