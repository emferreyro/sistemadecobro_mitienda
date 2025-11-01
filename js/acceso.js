// acceso.js - used by sistemadecobro_mitienda.html to optionally validate before linking to fullv.html
async function handleLoginConfirm(){
  try{
    if(typeof FingerprintJS === 'undefined'){
      await new Promise((res, rej)=>{
        const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@4/dist/fp.min.js';
        s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
    }
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    const fingerprint = result.visitorId;

    const res = await fetch('autorizados.json?_=' + Date.now());
    if(!res.ok) throw new Error('NO_JSON');
    const data = await res.json();
    const lista = Array.isArray(data.autorizados) ? data.autorizados : [];

    const usuario = lista.find(u => (typeof u === 'string' && u === fingerprint) || (u && (u.id === fingerprint || u.fingerprint === fingerprint)));
    if(!usuario){
      alert('⚠️ Este dispositivo no está autorizado para la versión completa.');
      return;
    }
    if(typeof usuario === 'object' && usuario.vencimiento){
      const hoy = new Date();
      const fechaVenc = new Date(usuario.vencimiento);
      if(hoy > fechaVenc){ alert('❌ Acceso vencido. Contacta al administrador.'); return; }
    }
    window.location.href = 'fullv.html';
  }catch(err){
    if(String(err).includes('NO_JSON')){
      try{
        if(typeof FingerprintJS === 'undefined'){
          await new Promise((res, rej)=>{
            const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@4/dist/fp.min.js';
            s.onload=res; s.onerror=rej; document.head.appendChild(s);
          });
        }
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const fingerprint = result.visitorId;
        const fechaVenc = new Date(); fechaVenc.setFullYear(fechaVenc.getFullYear() + 1);
        const nuevo = { autorizados: [ { id: fingerprint, user: 'admin', vencimiento: fechaVenc.toISOString().slice(0,10) } ] };
        const blob = new Blob([JSON.stringify(nuevo, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'autorizados.json'; document.body.appendChild(a); a.click(); a.remove();
        alert('✅ Primer dispositivo autorizado. Guarda el archivo autorizados.json junto a la app.');
        return;
      }catch(e){ console.error(e); alert('Error al generar autorizados.json'); return; }
    }
    console.error(err);
    alert('Error al verificar autorización. Revisa autorizados.json');
  }
}