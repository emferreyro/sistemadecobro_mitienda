/* =========================================================
   guardFullv.js — Protección de acceso para versión completa
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

    // 🔧 Ruta corregida
    const url = "autorizados.json?" + Date.now();
    console.log("📂 Leyendo archivo:", url);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`No se pudo leer ${url} (HTTP ${resp.status})`);

    const data = await resp.json();
    console.log("📄 Datos leídos de JSON:", data);
    if (!data || !Array.isArray(data.autorizados)) {
      throw new Error("Formato inválido en autorizados.json");
    }

    const autorizado = data.autorizados.find(a => a && (a.id === fingerprint || a.fingerprint === fingerprint));
    if (!autorizado) {
      alert("❌ Este dispositivo no está autorizado.\n\nContacta al soporte.");
      console.error("❌ Dispositivo NO autorizado:", fingerprint);
      window.location.href = "sistemadecobro_mitienda.html";
      return;
    }

    if (autorizado.vencimiento) {
      const hoy = new Date();
      const vence = new Date(autorizado.vencimiento);
      if (!isNaN(+vence) && vence < hoy) {
        alert(`⚠️ Licencia expirada (${autorizado.vencimiento}). Contacta soporte.`);
        window.location.href = "sistemadecobro_mitienda.html";
        return;
      }
    }

    console.log(`✅ Acceso autorizado: ${autorizado.user}`);
    alert(`✅ Dispositivo autorizado. Bienvenido ${autorizado.user}.`);

  } catch (err) {
    console.error("🚨 Error al verificar autorización:", err);
    alert("Error al verificar autorización. Revisa el archivo autorizados.json o la conexión al servidor.");
    window.location.href = "sistemadecobro_mitienda.html";
  }
})();