// One place for network config. Switching to Base mainnet = chain="base" (widget attribute) or KDU_CHAIN=base (server).
// rpc = free keyless read RPC (publicnode allows wide eth_getLogs ranges; the official endpoints cap at 200 blocks).
// Chains are defined by hand (not viem/chains) to keep the widget bundle small.
import { defineChain } from 'viem';
const eth = { name: 'Ether', symbol: 'ETH', decimals: 18 };
export const CHAINS = {
  'base-sepolia': { explorer: 'https://sepolia.basescan.org', rpc: 'https://base-sepolia-rpc.publicnode.com', walletRpc: 'https://sepolia.base.org',
    chain: defineChain({ id: 84532, name: 'Base Sepolia', nativeCurrency: eth, rpcUrls: { default: { http: ['https://sepolia.base.org'] } }, testnet: true }) },
  'base': { explorer: 'https://basescan.org', rpc: 'https://base-rpc.publicnode.com', walletRpc: 'https://mainnet.base.org',
    chain: defineChain({ id: 8453, name: 'Base', nativeCurrency: eth, rpcUrls: { default: { http: ['https://mainnet.base.org'] } } }) },
};
export const getNet = (k) => CHAINS[k] || CHAINS['base-sepolia'];
