// <kudoken-wallet> web component. One script tag, no trackers, viem only.
import { createClient, http, formatUnits, parseUnits, erc20Abi, isAddress, parseAbiItem, toHex } from 'viem';
import { getBalance, readContract, getLogs, getBlockNumber, waitForTransactionReceipt } from 'viem/actions';
import { getNet } from '../lib/chains.js';
import { memoData } from '../lib/memo.js';

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const providers = new Map();
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => providers.set(e.detail.info.rdns, e.detail));
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}
const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const fmt = (v, d = 2) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: d });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
:host{--sand:#f1e8d8;--shell:#fbf7ef;--ink:#10293a;--muted:#5b6670;--fire:#b8381f;--air:#2f8fa3;--earth:#55703f;--comet:#7fd0f2;
display:block;font-family:var(--kdu-font,"Hanken Grotesk",system-ui,sans-serif);color:var(--ink);max-width:420px}
.card{background:var(--shell);border:1px solid #e7dbc4;border-radius:22px;padding:20px 20px 18px;box-shadow:0 10px 30px -18px rgba(16,41,58,.45);position:relative;overflow:hidden}
.card:before{content:"";position:absolute;inset:auto -40px -60px auto;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(127,208,242,.35),transparent 70%);pointer-events:none}
h3{font-family:var(--kdu-display,"Big Shoulders Stencil","Hanken Grotesk",sans-serif);font-size:26px;line-height:1.05;margin:0 0 4px;font-weight:800}
p.sub{margin:0 0 14px;color:var(--muted);font-size:14px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.bal{display:flex;gap:14px;margin:6px 0 14px}.bal div{background:var(--sand);border-radius:14px;padding:10px 12px;flex:1}
.bal b{display:block;font-size:22px}.bal span{font-size:13px;color:var(--muted)}
button{font:inherit;font-weight:700;border:0;border-radius:999px;padding:10px 16px;cursor:pointer;background:var(--ink);color:var(--shell)}
button.alt{background:var(--sand);color:var(--ink)}button.warm{background:var(--fire)}button.leaf{background:var(--earth)}
button:disabled{opacity:.5;cursor:wait}
input{font:inherit;border:1px solid #d9ccb3;background:#fff;border-radius:12px;padding:10px 12px;width:100%;box-sizing:border-box;margin-bottom:8px}
.note{font-size:13px;margin-top:10px;color:var(--muted);word-break:break-all}.note a{color:var(--air)}
.err{color:var(--fire)}.ok{color:var(--earth)}
ul{list-style:none;padding:0;margin:8px 0 0;font-size:14px}li{display:flex;justify-content:space-between;padding:8px 0;border-top:1px dashed #e0d3bb}
.order{background:var(--sand);border-radius:14px;padding:12px;margin-bottom:12px;font-size:14px}.order b{font-size:20px}
.addr{font-size:13px;color:var(--muted)}`;

class KudokenWallet extends HTMLElement {
  static get observedAttributes() { return ['mode', 'amount', 'order', 'merchant', 'to', 'chain', 'rpc', 'token', 'treasury']; }
  constructor() { super(); this.root = this.attachShadow({ mode: 'open' }); this.state = { msg: '' }; }
  get cfg() {
    const a = (k, d) => this.getAttribute(k) ?? d;
    return { chain: a('chain', 'base-sepolia'), token: a('token', ''), mode: a('mode', 'wallet'), to: a('to', ''), presets: a('presets', '1,5,20').split(',').map(Number),
      merchant: a('merchant', ''), amount: a('amount', ''), order: a('order', ''), label: a('label', ''), treasury: a('treasury', ''), rpc: a('rpc', ''), lookback: Number(a('lookback', 50000)) };
  }
  setup() {
    const net = getNet(this.cfg.chain);
    this.net = net;
    const c = createClient({ chain: net.chain, transport: http(this.cfg.rpc || net.rpc) });
    this.pub = { getBalance: (a) => getBalance(c, a), readContract: (a) => readContract(c, a), getLogs: (a) => getLogs(c, a), getBlockNumber: () => getBlockNumber(c), waitForTransactionReceipt: (a) => waitForTransactionReceipt(c, a) };
  }
  connectedCallback() {
    this.setup();
    this.render();
    const eth = this.pickProvider(true);
    if (eth) eth.request({ method: 'eth_accounts' }).then((a) => a[0] && this.connect(true)).catch(() => {});
  }
  attributeChangedCallback(n, o, v) {
    if (!this.net || o === v) return;
    if (['chain', 'rpc', 'token', 'treasury'].includes(n)) { this.setup(); clearTimeout(this.t); this.t = setTimeout(() => this.refresh(), 50); } else this.render();
  }
  pickProvider(silent, rdns) {
    const list = [...providers.values()];
    const hit = rdns ? list.find((p) => p.info.rdns.includes(rdns)) : list[0];
    return hit?.provider || (!rdns || rdns === 'metamask' ? window.ethereum : null) || (silent ? null : null);
  }
  async connect(silent, rdns) {
    const eth = this.pickProvider(silent, rdns);
    if (!eth) {
      if (silent) return;
      if (rdns === 'coinbase') { location.href = 'https://go.cb-w.com/dapp?cb_url=' + encodeURIComponent(location.href); return; }
      return this.say('No wallet found here. Open this page in MetaMask or Coinbase Wallet', true);
    }
    try {
      const [account] = await eth.request({ method: silent ? 'eth_accounts' : 'eth_requestAccounts' });
      if (!account) return;
      this.eth = eth; this.account = account;
      this.wallet = true;
      eth.on?.('accountsChanged', (a) => { this.account = a[0]; this.wallet = !!a[0]; this.refresh(); });
      await this.ensureChain();
      this.refresh();
    } catch (e) { this.say(e.shortMessage || e.message, true); }
  }
  async ensureChain() {
    const c = this.net.chain, hex = toHex(c.id);
    const cur = await this.eth.request({ method: 'eth_chainId' });
    if (cur === hex) return;
    try { await this.eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }); }
    catch (e) {
      if (e.code !== 4902 && e?.data?.originalError?.code !== 4902) throw e;
      await this.eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName: c.name, nativeCurrency: c.nativeCurrency,
        rpcUrls: [this.net.walletRpc], blockExplorerUrls: [this.net.explorer] }] });
    }
  }
  async refresh() {
    if (!this.account) return this.render();
    const { token } = this.cfg;
    try {
      const [eth, kdu] = await Promise.all([this.pub.getBalance({ address: this.account }),
        isAddress(token) ? this.pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [this.account] }) : 0n]);
      this.state.eth = eth; this.state.kdu = kdu;
    } catch (e) { this.say('Could not read balances: ' + (e.shortMessage || e.message), true); }
    this.render();
    if (this.cfg.mode === 'winnings' || this.cfg.mode === 'wallet') this.loadHistory();
  }
  async loadHistory() {
    const { token, treasury, lookback } = this.cfg;
    if (!isAddress(token)) return;
    try {
      const head = await this.pub.getBlockNumber();
      const out = []; const step = 10000n;
      for (let to = head; to > head - BigInt(lookback) && to > 0n; to -= step) {
        const from = to - step + 1n > 0n ? to - step + 1n : 0n;
        const logs = await this.pub.getLogs({ address: token, event: TRANSFER, args: { to: this.account, ...(isAddress(treasury) && this.cfg.mode === 'winnings' ? { from: treasury } : {}) }, fromBlock: from, toBlock: to }).catch(() => []);
        out.push(...logs.reverse());
        if (out.length >= 8) break;
      }
      this.state.history = out.slice(0, 8);
      this.state.won = out.reduce((s, l) => s + l.args.value, 0n);
      this.render();
    } catch (e) { this.state.history = []; this.render(); }
  }
  say(msg, err) { this.state.msg = msg; this.state.err = !!err; this.render(); }
  // Public API: el.pay({to, amount, memo}) -> Promise<txHash>. Any site can call this.
  async pay({ to, amount, memo }) {
    if (!this.wallet) await this.connect(false);
    if (!this.wallet) throw new Error('wallet not connected');
    if (!isAddress(to)) throw new Error('That address does not look right');
    if (!isAddress(this.cfg.token)) throw new Error('token address missing in config');
    const value = parseUnits(String(amount), 18);
    await this.ensureChain();
    this.busy = true; this.say('Waiting for your wallet…');
    try {
      const hash = await this.eth.request({ method: 'eth_sendTransaction', params: [{ from: this.account, to: this.cfg.token, data: memoData(to, value, memo) }] });
      this.say(`Sent. <a target="_blank" rel="noopener" href="${this.net.explorer}/tx/${hash}">View on Basescan</a>`);
      this.dispatchEvent(new CustomEvent('kudoken:sent', { detail: { hash, to, amount: String(amount), memo }, bubbles: true, composed: true }));
      this.pub.waitForTransactionReceipt({ hash }).then((r) => {
        this.dispatchEvent(new CustomEvent('kudoken:confirmed', { detail: { hash, status: r.status, memo }, bubbles: true, composed: true }));
        this.refresh();
      });
      return hash;
    } catch (e) { this.say(e.shortMessage || e.message, true); throw e; } finally { this.busy = false; this.render(); }
  }
  balances() {
    const s = this.state;
    return `<div class="bal"><div><b>${s.kdu != null ? fmt(s.kdu) : '…'}</b><span>KDU</span></div><div><b>${s.eth != null ? fmt(s.eth, 5) : '…'}</b><span>ETH for gas</span></div></div>`;
  }
  connectButtons() {
    return `<div class="row"><button data-act="mm">MetaMask or browser wallet</button><button class="alt" data-act="cb">Coinbase Wallet</button></div>`;
  }
  body() {
    const c = this.cfg, s = this.state;
    const conn = !!this.account;
    const head = (t, sub) => `<h3>${t}</h3><p class="sub">${sub}</p>`;
    if (c.mode === 'tip') {
      return head(c.label || 'Leave a little aloha', `Tip ${short(c.to)} in KDU`) + (conn ? '' : '') +
        `<div class="row">${c.presets.map((p) => `<button class="warm" data-tip="${p}">${p} KDU</button>`).join('')}</div>` +
        (conn ? `<p class="note">From ${short(this.account)} · ${s.kdu != null ? fmt(s.kdu) : '…'} KDU</p>` : `<p class="note">Your wallet opens when you tap a tip</p>`);
    }
    if (c.mode === 'checkout') {
      return head(c.label || 'Pay at the Outlet Mall', 'Settle up in KDU on Base') +
        `<div class="order">Order ${esc(c.order || 'n/a')}<br><b>${esc(c.amount || '0')} KDU</b><div class="addr">to ${short(c.merchant)}</div></div>` +
        (conn ? this.balances() + `<button class="leaf" data-act="pay">Pay ${esc(c.amount)} KDU</button>` : this.connectButtons());
    }
    if (c.mode === 'winnings') {
      return head(c.label || 'Your Monkey Jockey winnings', 'Race prizes land right here') +
        (conn ? this.balances() + `<p class="sub">Won recently: <b>${s.won != null ? fmt(s.won) : '…'} KDU</b></p>` + this.historyList() : this.connectButtons());
    }
    return head(c.label || 'Your Kudoken wallet', conn ? short(this.account) : 'Connect to see your KDU on Base') +
      (conn ? this.balances() + `<input data-f="to" placeholder="Send to 0x…" value="${esc(c.to)}"><input data-f="amt" placeholder="Amount of KDU" inputmode="decimal"><button data-act="send">Send KDU</button>` + this.historyList() : this.connectButtons());
  }
  historyList() {
    const h = this.state.history;
    if (!h) return '';
    if (!h.length) return `<p class="note">Nothing incoming yet</p>`;
    return `<ul>${h.map((l) => `<li><a class="note" target="_blank" rel="noopener" href="${this.net.explorer}/tx/${l.transactionHash}">from ${short(l.args.from)}</a><b>+${fmt(l.args.value)}</b></li>`).join('')}</ul>`;
  }
  render() {
    const s = this.state;
    this.root.innerHTML = `<style>${CSS}</style><div class="card">${this.body()}${s.msg ? `<p class="note ${s.err ? 'err' : 'ok'}">${s.msg}</p>` : ''}${this.net && this.net.chain.testnet ? '<p class="note">Base Sepolia test network, play money only</p>' : ''}</div>`;
    this.root.querySelectorAll('button').forEach((b) => { b.disabled = !!this.busy; b.onclick = () => this.onClick(b); });
  }
  async onClick(b) {
    const c = this.cfg, act = b.dataset.act;
    try {
      if (act === 'mm') return this.connect(false, 'metamask');
      if (act === 'cb') return this.connect(false, 'coinbase');
      if (b.dataset.tip) return await this.pay({ to: c.to, amount: b.dataset.tip, memo: 'tip' });
      if (act === 'pay') {
        const hash = await this.pay({ to: c.merchant, amount: c.amount, memo: 'order:' + c.order });
        this.dispatchEvent(new CustomEvent('kudoken:paid', { detail: { hash, order: c.order, amount: c.amount, merchant: c.merchant }, bubbles: true, composed: true }));
      }
      if (act === 'send') {
        const to = this.root.querySelector('[data-f=to]').value.trim(), amt = this.root.querySelector('[data-f=amt]').value.trim();
        await this.pay({ to, amount: amt });
      }
    } catch (e) { /* message already shown */ }
  }
}
if (!customElements.get('kudoken-wallet')) customElements.define('kudoken-wallet', KudokenWallet);
export { KudokenWallet };
