import { kv } from "@vercel/kv";

export default async function handler(req, res){
  try{
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if(!token) return res.status(401).json({ ok:false, error:"Sin token" });

    const sess = await kv.get(`cobra:sess:${token}`);
    if(!sess) return res.status(401).json({ ok:false, error:"Sesión inválida" });

    const now = new Date();
    if(now > new Date(sess.exp)){
      return res.status(401).json({ ok:false, error:"Sesión expirada" });
    }

    const user = await kv.get(`cobra:user:${sess.phone}`);
    if(!user) return res.status(401).json({ ok:false, error:"Usuario no existe" });

    const trialEnd = new Date(user.trialEnd);
    const planEnd = user.planEnd ? new Date(user.planEnd) : null;
    const activeUntil = (planEnd && planEnd > trialEnd) ? planEnd : trialEnd;
    const expired = now > activeUntil;

    return res.status(200).json({
      ok:true,
      phone: sess.phone,
      expired,
      trialEnd: user.trialEnd,
      planEnd: user.planEnd,
      activeUntil: activeUntil.toISOString(),
      sessExp: sess.exp
    });
  }catch(e){
    return res.status(500).json({ ok:false, error: (e && e.message) || String(e) });
  }
}
