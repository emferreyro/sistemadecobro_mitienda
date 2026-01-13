// api/cobra/auth/status.js
// Cobra-Easy: valida token de sesión y retorna expiración.

const USER_PREFIX = "cobra:user:";
const SESS_PREFIX = "cobra:sess:";

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvFetch(path){
  const r = await fetch(`${KV_URL}${path}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  const data = ct.includes("application/json") ? await r.json() : { result: await r.text() };
  if(!r.ok) throw new Error(data?.error || `KV HTTP ${r.status}`);
  return data;
}
async function kvGet(key){
  const data = await kvFetch(`/get/${encodeURIComponent(key)}`);
  return data?.result ?? null;
}

export default async function handler(req, res){
  try{
    if(!KV_URL || !KV_TOKEN){
      return res.status(500).json({ ok:false, error:"Faltan variables KV_REST_API_URL / KV_REST_API_TOKEN" });
    }

    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if(!token) return res.status(401).json({ ok:false, error:"Sin token" });

    const sessRaw = await kvGet(`${SESS_PREFIX}${token}`);
    if(!sessRaw) return res.status(401).json({ ok:false, error:"Sesión inválida" });

    let sess;
    try{ sess = JSON.parse(sessRaw); }catch{ sess = null; }
    if(!sess?.phone || !sess?.exp) return res.status(401).json({ ok:false, error:"Sesión inválida" });

    const now = new Date();
    const sessExpired = now > new Date(sess.exp);
    if(sessExpired){
      return res.status(401).json({ ok:false, error:"Sesión expirada", sessExpired:true });
    }

    const userRaw = await kvGet(`${USER_PREFIX}${sess.phone}`);
    if(!userRaw) return res.status(401).json({ ok:false, error:"Usuario no encontrado" });

    let user;
    try{ user = JSON.parse(userRaw); }catch{ user = null; }
    if(!user) return res.status(401).json({ ok:false, error:"Usuario inválido" });

    const activeUntil = user.planActiveUntil || user.trialEnd;
    const expired = now > new Date(activeUntil);

    return res.status(200).json({
      ok: true,
      phone: sess.phone,
      sessExp: sess.exp,
      expired,
      activeUntil,
      trialEnd: user.trialEnd,
      planActiveUntil: user.planActiveUntil
    });

  }catch(err){
    return res.status(500).json({ ok:false, error: String(err?.message || err) });
  }
}
