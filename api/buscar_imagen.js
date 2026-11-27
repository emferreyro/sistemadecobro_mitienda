const crypto = require('node:crypto');
const cache = new Map(); let calls=0;
module.exports = async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Método no permitido'});
  const key=process.env.SERPER_API_KEY, secret=process.env.CATALOGO_VISUAL_TEST_KEY;
  if(!key||!secret||secret.length<16) return res.status(503).json({error:'Falta configurar la prueba'});
  const hash=x=>crypto.createHash('sha256').update(x).digest();
  if(!crypto.timingSafeEqual(hash(String(req.headers['x-catalogo-test']||'')),hash(secret))) return res.status(401).json({error:'Clave de prueba incorrecta'});
  let b=req.body; if(typeof b==='string'){try{b=JSON.parse(b)}catch{b=null}}
  const code=String(b?.codigo||''); if(!/^(?:\d{8}|\d{12,14})$/.test(code)) return res.status(400).json({error:'Código inválido'});
  if(cache.has(code)){try{return res.status(200).json(await cache.get(code))}catch{return res.status(502).json({error:'Proveedor no disponible'})}}
  if(calls>=100) return res.status(429).json({error:'Límite de prueba de esta instancia'});
  calls++;
  const work=(async()=>{
    const r=await fetch('https://google.serper.dev/images',{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({q:code,gl:'mx',hl:'es',num:10}),signal:AbortSignal.timeout(12000)});
    if(!r.ok) throw Error('Proveedor'); const j=await r.json();
    const safe=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password?x.href:null}catch{return null}};
    return {images:(Array.isArray(j.images)?j.images:[]).slice(0,10).map(x=>({url:safe(x.imageUrl),link:safe(x.link),title:String(x.title||'').slice(0,300),source:String(x.source||x.domain||'').slice(0,100),width:Number(x.imageWidth)||0,height:Number(x.imageHeight)||0})).filter(x=>x.url&&x.link)};
  })(); cache.set(code,work);
  try{return res.status(200).json(await work)}catch{cache.delete(code);return res.status(502).json({error:'Proveedor no disponible'})}
};
