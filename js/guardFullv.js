// guardFullv.js - protects fullv.html by verifying authorized fingerprints with manual expiration
(function(){
  const HIDE_STYLE_ID = 'fp-guard-style';
  try{
    const s = document.createElement('style'); s.id = HIDE_STYLE_ID; s.textContent = 'html{visibility:hidden !important}';
    document.head && document.head.insertBefore(s, document.head.firstChild);
  }catch(e){}

  async function bloquear(){
    try{ alert('Acceso denegado. Dispositivo no autorizado o vencido.'); }catch(e){}
    window.location.href = 'sistemadecobro_mitienda.html';
  }

  (async function(){
    try{
      if(typeof FingerprintJS === 'undefined'){
        await new Promise((res, rej)=>{
          const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@4/dist/fp.min.js';
          s.onload = res; s.onerror = rej; document.head.appendChild(s);
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
        bloquear(); return;
      }

      if(typeof usuario === 'object' && usuario.vencimiento){
        const hoy = new Date();
        const fechaVenc = new Date(usuario.vencimiento);
        if(hoy > fechaVenc){ bloquear(); return; }
      }

      const st = document.getElementById(HIDE_STYLE_ID); if(st && st.parentNode) st.parentNode.removeChild(st);
      console.log('Access granted for', (usuario && usuario.user) ? usuario.user : fingerprint);
    } catch(err){
      try{
        if(String(err).includes('NO_JSON')){
          if(typeof FingerprintJS === 'undefined') {
            await new Promise((res, rej)=>{
              const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@4/dist/fp.min.js';
              s.onload = res; s.onerror = rej; document.head.appendChild(s);
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
          const st = document.getElementById(HIDE_STYLE_ID); if(st && st.parentNode) st.parentNode.removeChild(st);
          return;
        }
      }catch(e){}
      console.error(err);
      bloquear();
    }
  })();
})();