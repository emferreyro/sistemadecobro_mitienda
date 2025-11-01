(async () => {
  console.log("🟢 Iniciando acceso.js");

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
    console.log("🟢 Fingerprint (página principal):", fingerprint);

    // Ejemplo de integración: podrías enviarlo a un backend o validarlo en localStorage
    // if (fingerprint === 'tu_fingerprint_admin') { ... }

  } catch (e) {
    console.warn("acceso.js: no se pudo obtener fingerprint:", e);
  }
})();
