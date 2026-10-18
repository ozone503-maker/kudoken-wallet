import { encodeFunctionData, erc20Abi, toHex, concat } from 'viem';
// ERC-20 transfer with an optional memo appended after the ABI args (ignored by the token, visible in calldata)
export const memoData = (to, amount, memo) => {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amount] });
  return memo ? concat([data, toHex('kdu:' + memo)]) : data;
};
