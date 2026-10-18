// Vercel serverless function: POST /api/payout {to, amount, raceId}
// Env: TREASURY_PK (testnet key), KDU_TOKEN, KDU_CHAIN (base-sepolia|base), RPC_URL (optional),
//      PAYOUT_SECRET (required header x-payout-secret unless DEMO_PUBLIC=1), MAX_PAYOUT (default 50)
import { payWinner } from '../lib/payout.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const e = process.env;
  const open = e.DEMO_PUBLIC === '1' && (e.KDU_CHAIN || 'base-sepolia') === 'base-sepolia';
  if (!open && (!e.PAYOUT_SECRET || req.headers['x-payout-secret'] !== e.PAYOUT_SECRET)) return res.status(401).json({ error: 'not allowed' });
  if (!e.TREASURY_PK || !e.KDU_TOKEN) return res.status(503).json({ error: 'treasury not configured yet' });
  const { to, amount, raceId } = req.body || {};
  const max = Number(e.MAX_PAYOUT || 50);
  if (!(Number(amount) > 0 && Number(amount) <= max)) return res.status(400).json({ error: `amount must be 0 to ${max}` });
  try {
    const r = await payWinner({ to, amount, memo: 'race:' + String(raceId || 'demo').slice(0, 40), pk: e.TREASURY_PK, token: e.KDU_TOKEN, chainKey: e.KDU_CHAIN, rpc: e.RPC_URL });
    res.status(200).json(r);
  } catch (err) { res.status(500).json({ error: String(err.shortMessage || err.message) }); }
}
