
// Un solo diálogo de rechazo: mantiene al usuario aquí hasta pulsar Aceptar.
function mostrarRechazoConFingerprint() {
  return new Promise(resolve => {
    const crear = () => {
      if (document.getElementById('guardFullvAviso')) return resolve();
      const overlay = document.createElement('div');
      overlay.id = 'guardFullvAviso';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
      overlay.innerHTML = `
        <section role="alertdialog" aria-modal="true" aria-labelledby="guardTitulo" style="box-sizing:border-box;background:#fff;color:#222;width:100%;max-width:440px;border-radius:16px;padding:24px;text-align:center;font:15px Arial,sans-serif;box-shadow:0 12px 32px #0006">
          <div style="font-size:28px">⚠️</div>
          <h2 id="guardTitulo" style="font-size:20px;margin:10px 0">Dispositivo no autorizado</h2>
          <p style="line-height:1.5">Este dispositivo no está registrado para utilizar la versión completa. Obtén el fingerprint y comunícate con soporte.</p>
          <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:18px">
            <button type="button" id="guardVerFingerprint" style="border:0;border-radius:9px;background:#f5e131;color:#222;font-weight:bold;padding:12px 16px;cursor:pointer">🔐 Obtener fingerprint</button>
            <button type="button" id="guardVolverInicio" style="border:1px solid #bbb;border-radius:9px;background:#f2f2f2;color:#222;padding:12px 16px;cursor:pointer">Aceptar</button>
          </div>
        </section>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#guardVolverInicio').addEventListener('click', () => {
        window.location.href = 'index.html';
        resolve();
      });
      overlay.querySelector('#guardVerFingerprint').addEventListener('click', () => {
        if (document.getElementById('guardFingerPanel')) return;
        const popup = document.createElement('div');
        popup.id = 'guardFingerPanel';
        popup.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
        popup.innerHTML = `
          <div role="dialog" aria-modal="true" aria-label="Fingerprint del dispositivo" style="display:flex;flex-direction:column;box-sizing:border-box;background:#fff;border-radius:14px;width:100%;max-width:620px;height:85vh;max-height:660px;overflow:hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;background:#f5e131;color:#222;font:700 16px Arial,sans-serif">
              <span>Fingerprint del dispositivo</span>
              <button type="button" id="guardCerrarFinger" style="border:0;border-radius:8px;background:#fff;color:#222;padding:10px;cursor:pointer;font-weight:bold">✕ Cerrar</button>
            </div>
            <iframe src="finger.html" title="Fingerprint" style="border:0;width:100%;flex:1;min-height:0" ></iframe>
          </div>`;
        document.body.appendChild(popup);
        popup.querySelector('#guardCerrarFinger').addEventListener('click', () => popup.remove());
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', crear, { once:true });
    else crear();
  });
}

/* =========================================================
   guardFullv.js — Protección de acceso (versión optimizada)
   ========================================================= */
(async () => {
  console.log("🟡 Iniciando verificación de acceso (guardFullv.js)");

  try {
    if (typeof FingerprintJS === "undefined") {
      throw new Error("FingerprintJS no está cargado.");
    }

    const fp = await FingerprintJS.load();
    const result = await fp.get();
    const fingerprint = result.visitorId || "";
    if (!fingerprint) throw new Error("No se pudo obtener el fingerprint");

    console.log("🔍 Fingerprint detectado:", fingerprint);

    const url = "autorizados.json?" + Date.now();
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`No se pudo leer ${url} (HTTP ${resp.status})`);

    const data = await resp.json();
    if (!data || !Array.isArray(data.autorizados)) {
      throw new Error("Formato inválido en autorizados.json");
    }

    // Buscar registro exacto por ID
    const autorizado = data.autorizados.find(a => a.id === fingerprint);

    if (!autorizado) {
      console.error("❌ Dispositivo NO autorizado:", fingerprint);
      await mostrarRechazoConFingerprint();
      return;
    }

    // Verificar vencimiento si existe
    if (autorizado.vencimiento) {
      const hoy = new Date();
      const vence = new Date(autorizado.vencimiento);
      if (!isNaN(+vence) && vence < hoy) {
        alert(`⚠️ Licencia expirada (${autorizado.vencimiento}). Contacta soporte.`);
        window.location.href = "https://sistemadecobro-mitienda.vercel.app/";
        return;
      }
    }

    console.log(`✅ Acceso autorizado: ${autorizado.user}`);
    alert(`✅ Dispositivo autorizado. Bienvenido ${autorizado.user}.`);

  } catch (err) {
    console.error("🚨 Error al verificar autorización:", err);
    alert("Error al verificar autorización. Revisa el archivo autorizados.json o la conexión al servidor.");
    window.location.href = "https://sistemadecobro-mitienda.vercel.app/";
  }
})();
