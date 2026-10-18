// Drives the demo page in headless Chromium against the anvil Base Sepolia fork with an injected test wallet.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { chromium } from 'playwright';
const res = JSON.parse(fs.readFileSync('e2e-result-fork.json')); const RPC = 'http://127.0.0.1:8546'; const USER = res.addresses.user;
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')));
Object.assign(process.env, { TREASURY_PK: env.TREASURY_PK, KDU_TOKEN: res.l2Token, RPC_URL: RPC, DEMO_PUBLIC: '1' });
const { default: payout } = await import('../api/payout.js');
await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'anvil_impersonateAccount', params: [USER] }) });
const srv = http.createServer((req, rs) => {
  if (req.url === '/config.js') return rs.end(`window.KDU_DEMO={chain:'base-sepolia',token:'${res.l2Token}',merchant:'${res.addresses.merchant}',treasury:'${res.addresses.treasury}',rpc:'${RPC}'};`);
  if (req.url === '/api/payout') { let b = ''; req.on('data', (c) => b += c); req.on('end', () => { req.body = JSON.parse(b); payout(req, { status(c) { rs.statusCode = c; return this; }, json(o) { rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify(o)); } }); }); return; }
  const f = path.join('public', req.url === '/' ? 'index.html' : req.url); fs.existsSync(f) ? rs.end(fs.readFileSync(f)) : (rs.statusCode = 404, rs.end());
}).listen(5178);
const b = await chromium.launch({ executablePath: '/home/box/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell' });
const shots = '/workspace/kudoken-wallet-shots'; fs.mkdirSync(shots, { recursive: true });
const tx = {};
for (const [name, vp] of [['desktop', { width: 1360, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: name === 'mobile' ? 2 : 1 });
  await ctx.addInitScript(({ RPC, USER }) => {
    let id = 0; const call = (method, params = []) => fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((r) => r.json()).then((j) => { if (j.error) throw j.error; return j.result; });
    window.ethereum = { isMetaMask: true, on() {}, request: ({ method, params }) => (method === 'eth_requestAccounts' || method === 'eth_accounts') ? Promise.resolve([USER]) : method.startsWith('wallet_') ? Promise.resolve(null) : call(method, params) };
  }, { RPC, USER });
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto('http://127.0.0.1:5178/'); await p.waitForTimeout(3500);
  if (name === 'desktop') {
    await p.locator('#tip').locator('button', { hasText: '5 KDU' }).click(); await p.waitForTimeout(2500);
    tx.tip_ui = await p.locator('#tip').evaluate((el) => el.shadowRoot.querySelector('a')?.href);
    await p.locator('#pay').locator('button', { hasText: 'Pay 42' }).click(); await p.waitForTimeout(2500);
    tx.pay_ui = await p.locator('#paidOut').textContent();
    await p.locator('#w').locator('input').first().fill(res.addresses.merchant); await p.locator('#w').locator('input').nth(1).fill('3');
    await p.locator('#w').locator('button', { hasText: 'Send KDU' }).click(); await p.waitForTimeout(2500);
    tx.send_ui = await p.locator('#w').evaluate((el) => el.shadowRoot.querySelector('.ok a')?.href);
    await p.fill('#winner', USER); await p.click('#race'); await p.waitForTimeout(5000);
    tx.payout_ui = await p.locator('#raceOut a').getAttribute('href');
    await p.reload(); await p.waitForTimeout(4000);
  }
  await p.screenshot({ path: `${shots}/demo-${name}.png`, fullPage: true });
  await ctx.close();
}
console.log(tx); await b.close(); srv.close();
