/* =========================================================
   guardFullv.js — Protección de acceso para versión completa
   ========================================================= */
(async () => {
  console.log("🟡 Iniciando verificación de acceso (guardFullv.js)");

  try {
    // 🧩 Cargar FingerprintJS si no está disponible
    if (typeof FingerprintJS === "undefined") {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js";
      document.head.appendChild(s);
      await new Promise((res, rej) => {
        s.onload = res;
        s.onerror = rej;
      });
    }

    // 🧬 Obtener fingerprint
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    const fingerprint = result.visitorId;
    console.log("🔍 Fingerprint detectado:", fingerprint);

    // 🌐 Cargar autorizaciones desde GitHub RAW (sin CORS, sin cache)
    const url = "https://raw.githubusercontent.com/emferreyro/sistemadecobro_mitienda/main/autorizados.json?" + Date.now();
    console.log("📂 Leyendo archivo remoto:", url);

    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`Error al leer JSON (${resp.status})`);

    const data = await resp.json();
    console.log("📄 Datos leídos de JSON:", data);

    // 🧠 Validar formato
    if (!data.autorizados || !Array.isArray(data.autorizados))
      throw new Error("Formato inválido en autorizados.json");

    // 🔎 Buscar coincidencia por fingerprint
    const autorizado = data.autorizados.find(a => a.id === fingerprint);

    if (!autorizado) {
      alert("❌ Acceso denegado. Dispositivo no autorizado.");
      window.location.href = "sistemadecobro_mitienda.html";
      return;
    }

    // ⏰ Validar vencimiento
    const hoy = new Date();
    const vence = new Date(autorizado.vencimiento);
    if (vence < hoy) {
      alert(`⚠️ Licencia expirada (${autorizado.vencimiento}).`);
      window.location.href = "sistemadecobro_mitienda.html";
      return;
    }

    // ✅ Acceso concedido
    console.log(`✅ Acceso autorizado: ${autorizado.user}`);
    alert(`✅ Dispositivo autorizado (${autorizado.user}). Modo ADMIN activo.`);

  } catch (err) {
    console.error("🚨 Error al verificar autorización:", err);
    alert("Error al verificar autorización. Revisa el formato del JSON o la conexión.");
    window.location.href = "sistemadecobro_mitienda.html";
  }
})();
