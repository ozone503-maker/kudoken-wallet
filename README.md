# Kudoken wallet

A tiny, embeddable KDU wallet for every Kudoken spot: the Kudoken site, Fruity Puppy Outlet Mall, Monkey Jockey and Brobots. One script tag, one `<kudoken-wallet>` tag, no trackers, built on viem (about 44 KB gzipped).

Runs on **Base Sepolia** today. Switching to Base mainnet is one attribute: `chain="base"`.

## Drop it in

```html
<script src="https://YOUR-DEPLOY.vercel.app/kudoken-wallet.js" defer></script>

<!-- wallet: balance, gas, send, incoming history -->
<kudoken-wallet chain="base-sepolia" token="0xKDU_ON_BASE"></kudoken-wallet>

<!-- tip jar -->
<kudoken-wallet mode="tip" token="0xKDU_ON_BASE" to="0xARTIST" presets="1,5,20" label="Mahalo the artist"></kudoken-wallet>

<!-- Outlet Mall checkout -->
<kudoken-wallet mode="checkout" token="0xKDU_ON_BASE" merchant="0xSTALL" amount="42" order="FP-1001"></kudoken-wallet>

<!-- Monkey Jockey winnings (incoming KDU from the race treasury) -->
<kudoken-wallet mode="winnings" token="0xKDU_ON_BASE" treasury="0xTREASURY"></kudoken-wallet>
```

| Attribute | Meaning |
| --- | --- |
| `chain` | `base-sepolia` (default) or `base` |
| `token` | KDU token address on that chain |
| `mode` | `wallet`, `tip`, `checkout`, `winnings` |
| `to`, `presets`, `label` | tip target, preset amounts, headline |
| `merchant`, `amount`, `order` | checkout request |
| `treasury`, `lookback` | winnings sender filter, blocks to scan (default 50000) |
| `rpc` | optional read RPC override |

JavaScript API, usable from any page:

```js
const hash = await document.querySelector('kudoken-wallet').pay({ to: '0x…', amount: '12.5', memo: 'order:FP-1002' });
document.addEventListener('kudoken:paid', (e) => console.log(e.detail));   // {hash, order, amount, merchant}
document.addEventListener('kudoken:confirmed', (e) => console.log(e.detail)); // {hash, status, memo}
```

Memos (order ids, `tip`, race ids) ride along as trailing calldata on a normal ERC-20 `transfer` (`kdu:order:FP-1001`). The token ignores them, merchants can read them from the tx input.

Wallets: any injected wallet via EIP-6963 (MetaMask, Coinbase Wallet extension, Rabby, …). Coinbase Wallet mobile is opened via its dapp browser deep link. WalletConnect is skipped because it needs a Reown project id (signup).

## Monkey Jockey payouts

`api/payout.js` is a Vercel function: `POST /api/payout {to, amount, raceId}` signs a KDU transfer from the treasury key.

Env vars: `TREASURY_PK`, `KDU_TOKEN`, `KDU_CHAIN` (`base-sepolia`|`base`), `PAYOUT_SECRET` (sent as `x-payout-secret`), `MAX_PAYOUT` (default 50), optional `RPC_URL`. `DEMO_PUBLIC=1` opens it without a secret, and only works on Base Sepolia.

## Tests

```bash
npm i && forge build --contracts contracts --out build
cp .env.example .env   # or node gen.mjs to create fresh test keys (never commit .env)
FORK=1 npm run e2e     # full flow on local anvil forks of Sepolia + Base Sepolia (start anvil on 8545/8546 first)
npm run e2e            # the same against the real testnets, once DEPLOYER holds Sepolia ETH
node scripts/ui-test.mjs  # drives the demo page in headless Chromium against the fork
```

The e2e script deploys `Kudoken (test)` on Ethereum Sepolia, creates its Base Sepolia twin via `OptimismMintableERC20Factory` (`0x4200…0012`), bridges through the Sepolia `L1StandardBridge` (`0xfd0Bf71F60660E2f608ed56e1659C450eB113120`), then runs send, tip, pay and payout.

## Going to Base mainnet

1. Anyone with a little Base ETH calls `createOptimismMintableERC20(0x09851dD4760a8ed111f850affb38B10f84e80C8A, "Kudoken", "KDU")` on the Base mainnet OptimismMintableERC20Factory. Base docs list it as `0xF10122D428B4bc8A9d050D06a2037259b4c4B83B` (the testnet one is the `0x4200…0012` predeploy). The new address is the official KDU on Base.
2. Gabriel signs two Ethereum mainnet txs from the holding wallet: `approve(L1StandardBridge 0x3154Cf16ccdb4C6d922629664174b904d80F2C35, amount)` on KDU, then `depositERC20(l1Token, l2Token, amount, 200000, 0x)` (or `depositERC20To` for a different Base address). Tokens lock on L1 and mint on Base in a few minutes. Try a small amount first.
3. Set `chain="base"` and `token="<official Base KDU>"` on the widgets, and `KDU_CHAIN=base` + `KDU_TOKEN` on the payout function, with a dedicated low-balance treasury hot wallet.
4. Optional: list KDU in the Superchain token list so bridge UIs recognise it, and gas sponsorship (Coinbase CDP Paymaster needs a CDP account, or simply drip a little Base ETH to users from the treasury).
