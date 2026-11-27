const crypto = require('node:crypto');
const prefix='mitienda:visual:v6:{shared}:';
const acquire=`local c=redis.call('GET',KEYS[1]); if c and ARGV[1]=='0' then return {'hit',c} end
if redis.call('EXISTS',KEYS[2])==1 then return {'busy'} end
local d=tonumber(redis.call('GET',KEYS[3]) or '0'); local t=tonumber(redis.call('GET',KEYS[4]) or '0');
if d>=tonumber(ARGV[2]) or t>=tonumber(ARGV[3]) then if c then return {'hit',c} end; return {'limit'} end
redis.call('SET',KEYS[2],ARGV[4],'EX',90); redis.call('INCR',KEYS[3]); redis.call('EXPIRE',KEYS[3],172800); redis.call('INCR',KEYS[4]); return {'go',tostring(d+1),tostring(t+1),c or ''}`;
const finish=`if redis.call('GET',KEYS[2])~=ARGV[1] then return 0 end; if ARGV[2]~='' then redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]) end; redis.call('DEL',KEYS[2]); return 1`;
function cap(v,def,max){return /^\d+$/.test(v||'')?Math.min(max,Number(v)):def}
async function redis(...cmd){const pairs=[[process.env.UPSTASH_REDIS_REST_URL,process.env.UPSTASH_REDIS_REST_TOKEN],[process.env.KV_REST_API_URL,process.env.KV_REST_API_TOKEN]];const [url,token]=pairs.find(([u,t])=>u&&t)||[];if(!url||!token||new URL(url).protocol!=='https:')throw Error('Redis');const r=await fetch(url.replace(/\/+$/,'')+'/',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(cmd),signal:AbortSignal.timeout(5000)});const j=await r.json();if(!r.ok||j.error||!Object.hasOwn(j,'result'))throw Error('Redis');return j.result;}
const safe=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password?x.href:null}catch{return null}};
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
 const secret=process.env.CATALOGO_VISUAL_TEST_KEY,key=process.env.SERPER_API_KEY;if(!secret||secret.length<16)return res.status(503).json({error:'Falta configurar la prueba'});
 const hash=x=>crypto.createHash('sha256').update(x).digest();if(!crypto.timingSafeEqual(hash(String(req.headers['x-catalogo-test']||'')),hash(secret)))return res.status(401).json({error:'Clave de prueba incorrecta'});
 let b=req.body;if(typeof b==='string'){try{b=JSON.parse(b)}catch{b=null}}
 const daily=cap(process.env.CATALOGO_VISUAL_DAILY_LIMIT,100,2500),total=cap(process.env.CATALOGO_VISUAL_TOTAL_LIMIT,100,2500), day=new Date().toISOString().slice(0,10), dk=prefix+'day:'+day, tk=prefix+'total';
 if(b?.status===true){try{const probe=prefix+'probe:'+crypto.randomUUID();const ok=await redis('SET',probe,'ok','EX',30);if(ok!=='OK'||await redis('GET',probe)!=='ok')throw Error('Redis');const counts=await redis('MGET',dk,tk);return res.status(200).json({redis:true,serperConfigured:!!key,dailyUsed:Number(counts[0]||0),totalUsed:Number(counts[1]||0),dailyLimit:daily,totalLimit:total});}catch{return res.status(503).json({error:'Redis no disponible o sin permiso de escritura. No se consultó Serper.'})}}
 const code=String(b?.codigo||'');if(!/^(?:\d{8}|\d{12,14})$/.test(code))return res.status(400).json({error:'Código inválido'});
 if(!key)return res.status(503).json({error:'Falta SERPER_API_KEY'});
 const ck=prefix+'code:'+code.padStart(14,'0'),lk=ck+':lock',owner=crypto.randomUUID();let a;
 try{a=await redis('EVAL',acquire,4,ck,lk,dk,tk,b.retry===true?'1':'0',daily,total,owner);}catch{return res.status(503).json({error:'Redis no disponible. No se consultó Serper.'})}
 if(a[0]==='hit'){try{return res.status(200).json({...JSON.parse(a[1]),cached:true,charged:0})}catch{return res.status(503).json({error:'Registro de caché inválido'})}}
 if(a[0]==='busy')return res.status(409).json({error:'Otra caja está consultando este código. Intenta nuevamente.'});
 if(a[0]!=='go')return res.status(429).json({error:'Presupuesto global o diario alcanzado. No se consultó Serper.'});
 try{const r=await fetch('https://google.serper.dev/images',{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({q:code+(b.retry===true?' producto México':''),gl:'mx',hl:'es',num:10}),signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Serper');const j=await r.json();const images=(Array.isArray(j.images)?j.images:[]).slice(0,10).map(x=>({url:safe(x.imageUrl),link:safe(x.link),title:String(x.title||'').slice(0,300),source:String(x.source||x.domain||'').slice(0,100),width:Number(x.imageWidth)||0,height:Number(x.imageHeight)||0})).filter(x=>x.url&&x.link);let old=[];try{old=JSON.parse(a[3]).images||[]}catch{};const payload={images:[...new Map([...images,...old].map(x=>[x.url,x])).values()].slice(0,20)};if(await redis('EVAL',finish,2,ck,lk,owner,JSON.stringify(payload),payload.images.length?2592000:86400)!==1)throw Error('Redis');return res.status(200).json({...payload,cached:false,charged:1,dailyUsed:Number(a[1]),totalUsed:Number(a[2]),dailyLimit:daily,totalLimit:total});}catch{try{await redis('EVAL',finish,2,ck,lk,owner,'',0)}catch{}return res.status(502).json({error:'No se pudo completar la consulta. Se reservó un crédito del presupuesto por precaución.'})}
};
