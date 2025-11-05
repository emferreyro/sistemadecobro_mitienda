(async () => {
  try {
    if (typeof FingerprintJS === "undefined") {
      const s = document.createElement('script');
      s.src = "https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js";
      document.head.appendChild(s);
      await new Promise((res, rej) => { s.onload = res; s.onerror = rej; });
    }
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    const fingerprint = result.visitorId;
    console.log("🟢 Fingerprint (página principal):", fingerprint);
  } catch (e) {
    console.warn("acceso.js: no se pudo obtener fingerprint:", e);
  }
})();