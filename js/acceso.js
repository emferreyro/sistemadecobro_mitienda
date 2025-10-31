// acceso.js - Validación de login con usuario + contraseña + fingerprint + vencimiento
async function handleLoginConfirm(e){
  if(e && e.preventDefault) e.preventDefault();
  const u=document.getElementById('loginUser').value.trim();
  const p=document.getElementById('loginPass').value.trim();
  if(!u||!p){alert('Ingresa usuario y contraseña');return;}
  try{
    if(typeof FingerprintJS==='undefined'){
      await new Promise((r,j)=>{
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@4/dist/fp.min.js';
        s.onload=r; s.onerror=j; document.head.appendChild(s);
      });
    }
    const fp=await FingerprintJS.load();
    const r=await fp.get();
    const f=r.visitorId;
    const res=await fetch('autorizados.json?_='+Date.now());
    if(!res.ok) throw new Error('NO_JSON');
    const d=await res.json();
    const l=Array.isArray(d.autorizados)?d.autorizados:[];
    const usr=l.find(x=>x.user===u&&x.pass===p&&(x.id===f||x.fingerprint===f));
    if(!usr){alert('❌ Usuario o dispositivo no autorizado.');return;}
    const h=new Date(),v=new Date(usr.vencimiento);
    if(h>v){alert('⚠️ Acceso vencido. Contacta al administrador.');return;}
    alert('✅ Bienvenido '+usr.user);
    window.location.href='fullv.html';
  }catch(err){
    console.error(err);
    alert('Error al verificar autorización o archivo "autorizados.json".');
  }
}