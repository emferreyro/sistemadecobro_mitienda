(async () => {
  console.log("🟡 Iniciando verificación de acceso (guardFullv.js)");

  const FP_KEY = "mitienda_fingerprint_v1";

  async function getStableFingerprint() {
    // Cargar FingerprintJS si no está disponible
    if (typeof FingerprintJS === "undefined") {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js";
      document.head.appendChild(s);
      await new Promise((res, rej) => { s.onload = res; s.onerror = rej; });
    }

    // Reutilizar fingerprint almacenado (estable por dominio)
    const cached = localStorage.getItem(FP_KEY);
    if (cached) return cached;

    const fp = await FingerprintJS.load();
    const { visitorId } = await fp.get();
    localStorage.setItem(FP_KEY, visitorId);
    return visitorId;
  }

  try {
    const fingerprint = await getStableFingerprint();
    console.log("🔍 Fingerprint detectado:", fingerprint);

    // Leer JSON remoto directamente desde GitHub
    const url = "https://raw.githubusercontent.com/emferreyro/sistemadecobro_mitienda/main/autorizados.json?" + Date.now();
    console.log("📂 Leyendo archivo remoto:", url);

    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`Error al leer JSON (${resp.status})`);

    const data = await resp.json();
    console.log("📄 Datos leídos de JSON:", data);

    if (!data.autorizados || !Array.isArray(data.autorizados))
      throw new Error("Formato inválido en autorizados.json");

    const autorizado = data.autorizados.find(a => a.id === fingerprint);
    if (!autorizado) {
      console.warn("❌ Acceso denegado. Dispositivo no autorizado.");
      window.location.href = "sistemadecobro_mitienda.html";
      return;
    }

    const hoy = new Date();
    const vence = new Date(autorizado.vencimiento);
    if (vence < hoy) {
      console.warn(`⚠️ Licencia expirada (${autorizado.vencimiento}).`);
      window.location.href = "sistemadecobro_mitienda.html";
      return;
    }

    // ✅ Autorizado — modo silencioso
    console.log(`✅ Dispositivo autorizado (${autorizado.user}). Modo ADMIN activo.`);

  } catch (err) {
    console.error("🚨 Error al verificar autorización:", err);
    window.location.href = "sistemadecobro_mitienda.html";
  }
})();
