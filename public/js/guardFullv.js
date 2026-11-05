/* Mi Tienda - Licencia local por período. No elimina ni modifica datos de ventas. */
(function () {
  'use strict';
  const KEY = 'mitienda_fullv_licencia_v1';
  const CLOCK_KEY = 'mitienda_fullv_ultimo_reloj_v1';
  const FREE_URL = 'index.html';
  const DAY = 86400000;
  let currentFingerprint = '';
  let verified = false;
  let ending = false;

  function dayEnd(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const [year, month, day] = value.split('-').map(Number);
    const start = new Date(year, month - 1, day);
    if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return NaN;
    return new Date(year, month - 1, day + 1).getTime(); // vigente hasta el final de la fecha indicada, hora local
  }
  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch (_) { return null; }
  }
  function isValid(record, fp) {
    return !!(record && fp && record.id === fp && Number.isFinite(dayEnd(record.vencimiento)) && Date.now() < dayEnd(record.vencimiento));
  }
  function checkClock() {
    try {
      const old = Number(localStorage.getItem(CLOCK_KEY) || 0);
      if (old && Date.now() < old - 5 * 60000) return false;
      if (Date.now() > old) localStorage.setItem(CLOCK_KEY, String(Date.now()));
    } catch (_) {}
    return true;
  }
  function allow() {
    verified = true;
    document.documentElement.classList.remove('mitienda-licencia-pendiente');
  }
  function block(title, message) {
    if (ending) return;
    ending = true;
    verified = false;
    document.documentElement.classList.add('mitienda-licencia-pendiente');
    const show = () => {
      const old = document.getElementById('mitienda-licencia-aviso');
      if (old) old.remove();
      const wrap = document.createElement('div');
      wrap.id = 'mitienda-licencia-aviso';
      wrap.setAttribute('role', 'alertdialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#111d;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:Arial,sans-serif';
      const section = document.createElement('section');
      section.style.cssText = 'background:white;color:#222;max-width:470px;width:100%;border-radius:15px;padding:22px;box-sizing:border-box;text-align:center;box-shadow:0 15px 40px #0005';
      const h = document.createElement('h2'); h.textContent = title;
      const info = document.createElement('p'); info.textContent = message; info.style.lineHeight = '1.5';
      const fp = document.createElement('p');
      fp.style.cssText = 'font-size:12px;overflow-wrap:anywhere;color:#555';
      fp.textContent = currentFingerprint ? 'Fingerprint: ' + currentFingerprint : 'Fingerprint no disponible';
      const buttons = document.createElement('div'); buttons.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center';
      const goBack = document.createElement('button'); goBack.textContent = 'Continuar en versión gratuita';
      const retry = document.createElement('button'); retry.textContent = 'Comprobar renovación';
      for (const b of [goBack, retry]) b.style.cssText = 'padding:12px;border:0;border-radius:8px;cursor:pointer;background:#f5e131;color:#222;font-weight:bold';
      goBack.addEventListener('click', () => location.replace(FREE_URL));
      retry.addEventListener('click', () => location.reload());
      buttons.append(goBack, retry);
      section.append(h, info, fp, buttons);
      wrap.append(section);
      document.body.append(wrap);
    };
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show, {once:true});
  }
  function expiredMessage() {
    block('Licencia de Modo Admin vencida', 'La versión gratuita sigue disponible con el límite de 50 artículos. Tus ventas y artículos no se borrarán. Renueva la licencia y pulsa «Comprobar renovación».');
  }
  function monitor() {
    if (!verified) return;
    const record = read();
    if (!checkClock()) { block('Verifica la fecha del equipo', 'Se detectó un cambio hacia atrás en el reloj. Corrige la fecha y vuelve a verificar la licencia.'); return; }
    if (!isValid(record, currentFingerprint)) expiredMessage();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) monitor(); });
  window.addEventListener('focus', monitor);
  window.setInterval(monitor, 60000);

  (async function init() {
    try {
      if (typeof FingerprintJS === 'undefined') throw new Error('No se pudo cargar FingerprintJS. Comprueba conexión o recursos offline.');
      const agent = await FingerprintJS.load();
      currentFingerprint = String((await agent.get()).visitorId || '');
      if (!currentFingerprint) throw new Error('No fue posible identificar el navegador.');
      if (!checkClock()) {
        block('Verifica la fecha del equipo', 'La fecha u hora del equipo retrocedió. Corrígela para continuar.');
        return;
      }
      const cached = read();
      if (isValid(cached, currentFingerprint)) {
        allow(); // Sin alertas ni fetch: acceso silencioso con licencia local vigente.
        return;
      }
      // La primera activación o la renovación exige consultar la lista actualizada.
      const response = await fetch('autorizados.json?v=' + Date.now(), {cache:'no-store'});
      if (!response.ok) throw new Error('No se pudo consultar la lista de autorizaciones.');
      const json = await response.json();
      if (!json || !Array.isArray(json.autorizados)) throw new Error('La lista de autorizaciones no es válida.');
      const match = json.autorizados.find((item) => item && item.id === currentFingerprint);
      if (!match) {
        block('Dispositivo no autorizado', 'Solicita la autorización de este fingerprint para utilizar Modo Admin. La versión gratuita continúa disponible.');
        return;
      }
      if (!isValid(match, currentFingerprint)) { expiredMessage(); return; }
      const license = {id: currentFingerprint, vencimiento: match.vencimiento, user: String(match.user || ''), cliente: String(match.cliente || ''), activado: new Date().toISOString()};
      localStorage.setItem(KEY, JSON.stringify(license));
      allow();
    } catch (error) {
      console.warn('Mi Tienda: autorización pendiente:', error);
      block('No se pudo verificar Modo Admin', 'Si estás activando o renovando, conecta internet para consultar autorizados.json. Si ya estabas autorizado, comprueba que FingerprintJS esté disponible. La versión gratuita continúa disponible.');
    }
  })();
})();
