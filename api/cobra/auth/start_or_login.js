// api/cobra/auth/start_or_login.js
// Cobra-Easy: Teléfono + PIN (sin dependencias). Usa Vercel KV (Upstash REST) por variables:
// KV_REST_API_URL, KV_REST_API_TOKEN
// Requiere: COBRA_PIN_SALT (secreto)

import crypto from "crypto";

const TRIAL_DAYS = 15;     // prueba gratis
const SESSION_DAYS = 7;    // duración de sesión
const USER_PREFIX = "cobra:user:";
const SESS_PREFIX = "cobra:sess:";

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const PIN_SALT = process.env.COBRA_PIN_SALT;

function normPhone(phone){
  return String(phone || "").replace(/\D/g, "");
}
function normPin(pin){
  return String(pin || "").replace(/\D/g, "");
}
function sha256hex(str){
  return crypto.createHash("sha256").update(str).digest("hex");
}
function hashPin(phone, pin){
  // no uses el PIN en texto: guardamos hash
  return sha256hex(`${PIN_SALT}:${phone}:${pin}`);
}
function addDaysUTC(date, days){
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

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
async function kvSet(key, value){
  // value debe ser string
  await kvFetch(`/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`);
}
async function kvSetEx(key, ttlSeconds, value){
  await kvFetch(`/setex/${encodeURIComponent(key)}/${ttlSeconds}/${encodeURIComponent(value)}`);
}

export default async function handler(req, res){
  try{
    // Solo POST
    if(req.method !== "POST"){
      return res.status(405).json({ ok:false, error:"Método no permitido (usa POST)" });
    }

    if(!KV_URL || !KV_TOKEN){
      return res.status(500).json({ ok:false, error:"Faltan variables KV_REST_API_URL / KV_REST_API_TOKEN" });
    }
    if(!PIN_SALT || PIN_SALT.trim().length < 8){
      return res.status(500).json({ ok:false, error:"Falta COBRA_PIN_SALT (mínimo 8 caracteres) en Vercel → Environment Variables" });
    }

    const { phone, pin } = (req.body || {});
    const p = normPhone(phone);
    const pinN = normPin(pin);

    if(p.length < 10){
      return res.status(400).json({ ok:false, error:"Teléfono inválido" });
    }
    if(pinN.length < 4 || pinN.length > 6){
      return res.status(400).json({ ok:false, error:"PIN inválido (4 a 6 dígitos)" });
    }

    const userKey = `${USER_PREFIX}${p}`;
    const now = new Date();

    let userRaw = await kvGet(userKey);
    let user = null;
    if(userRaw){
      try{ user = JSON.parse(userRaw); }catch{ user = null; }
    }

    // Si no existe el usuario: crear y arrancar prueba
    if(!user){
      const trialStart = now.toISOString();
      const trialEnd = addDaysUTC(now, TRIAL_DAYS).toISOString();

      user = {
        phone: p,
        pinHash: hashPin(p, pinN),
        createdAt: trialStart,
        trialStart,
        trialEnd,
        planActiveUntil: null, // aquí luego puedes meter planes pagados
      };

      await kvSet(userKey, JSON.stringify(user));
    } else {
      // Validar PIN
      const expected = user.pinHash;
      const got = hashPin(p, pinN);
      if(!expected || got !== expected){
        return res.status(401).json({ ok:false, error:"Teléfono o PIN incorrecto" });
      }
    }

    // Determinar vigencia
    const activeUntil = user.planActiveUntil || user.trialEnd;
    const expired = now > new Date(activeUntil);

    // Crear sesión
    const token = crypto.randomBytes(24).toString("hex");
    const sessExp = addDaysUTC(now, SESSION_DAYS).toISOString();
    const sess = { phone: p, exp: sessExp };

    // Guardar sesión con TTL
    await kvSetEx(`${SESS_PREFIX}${token}`, SESSION_DAYS * 24 * 3600, JSON.stringify(sess));

    return res.status(200).json({
      ok: true,
      token,
      sessExp,
      expired,
      activeUntil,
      trialEnd: user.trialEnd,
      planActiveUntil: user.planActiveUntil
    });

  }catch(err){
    return res.status(500).json({ ok:false, error: String(err?.message || err) });
  }
}
