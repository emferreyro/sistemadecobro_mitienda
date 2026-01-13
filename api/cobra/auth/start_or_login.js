import { kv } from "@vercel/kv";
import crypto from "crypto";

const TRIAL_DAYS = 15;
const SESSION_DAYS = 7;
const PIN_SALT = process.env.COBRA_PIN_SALT || "CAMBIA-ESTO";

function normPhone(phone){
  return String(phone || "").replace(/\D/g, "");
}
function hashPin(phone, pin){
  return crypto.createHash("sha256").update(`${PIN_SALT}:${phone}:${pin}`).digest("hex");
}
function addDaysUTC(date, days){
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
function makeToken(){
  return crypto.randomBytes(24).toString("hex");
}

export default async function handler(req, res){
  try{
    if(req.method !== "POST") return res.status(405).json({ ok:false });

    const { phone, pin } = req.body || {};
    const p = normPhone(phone);

    if(p.length < 10) return res.status(400).json({ ok:false, error:"Teléfono inválido" });
    if(!pin || String(pin).trim().length < 4) return res.status(400).json({ ok:false, error:"PIN inválido" });

    const key = `cobra:user:${p}`;
    const now = new Date();
    let user = await kv.get(key);

    if(!user){
      const start = now.toISOString();
      const end = addDaysUTC(now, TRIAL_DAYS).toISOString();
      user = {
        phone: p,
        pinHash: hashPin(p, String(pin).trim()),
        createdAt: start,
        trialStart: start,
        trialEnd: end,
        planEnd: null,
        lastSeen: start
      };
      await kv.set(key, user);
    }else{
      const expected = user.pinHash;
      const got = hashPin(p, String(pin).trim());
      if(got !== expected) return res.status(401).json({ ok:false, error:"PIN incorrecto" });
      user.lastSeen = now.toISOString();
      await kv.set(key, user);
    }

    const trialEnd = new Date(user.trialEnd);
    const planEnd = user.planEnd ? new Date(user.planEnd) : null;
    const activeUntil = (planEnd && planEnd > trialEnd) ? planEnd : trialEnd;
    const expired = now > activeUntil;

    const token = makeToken();
    const sessExp = addDaysUTC(now, SESSION_DAYS).toISOString();
    await kv.set(`cobra:sess:${token}`, { phone: p, exp: sessExp });

    return res.status(200).json({
      ok: true,
      token,
      sessExp,
      phone: p,
      expired,
      trialEnd: user.trialEnd,
      planEnd: user.planEnd,
      activeUntil: activeUntil.toISOString()
    });
  }catch(e){
    return res.status(500).json({ ok:false, error: (e && e.message) || String(e) });
  }
}
