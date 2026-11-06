/* Mi Tienda POS - Licencia temporal con revocación online.
 * La autorización vigente se guarda localmente. Cuando hay red, el JSON manda.
 * La revocación se aplica cuando la consulta online obtiene una respuesta válida.
 * NOTA: el registro local no está firmado; este control no es resistente a manipulación.
 */
(() => {
  'use strict';
  const STORAGE_KEY = 'mitienda_licencia_fullv_v2';
  const GUARD_VERSION = 'revocacion-diagnostico-v3';
  const DEBUG = new URLSearchParams(location.search).has('diagnostico');
  const CHECK_INTERVAL_MS = 15 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 6500;
  const MAX_CLOCK_REGRESSION_MS = 5 * 60 * 1000;
  const HOME = 'index.html';
  const AUTH_URL = 'autorizados.json';
  let active = false;
  let checking = false;
  let lastFingerprint = '';
  let status = {version: GUARD_VERSION, fingerprint:'', fuente:'pendiente', coincidencia:'', revocado:null, vencimiento:'', resultado:'iniciando'};
  function displayStatus(){
    if (!DEBUG) return;
    const render = () => {
      let el = document.getElementById('mitiendaDiagnosticoLicencia');
      if (!el) {
        el=document.createElement('pre');el.id='mitiendaDiagnosticoLicencia';
        el.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#12243b;color:#fff;padding:12px;font:13px/1.45 monospace;white-space:pre-wrap;max-height:42vh;overflow:auto;margin:0;visibility:visible';
        document.body.appendChild(el);
      }
      el.textContent='DIAGNÓSTICO DE LICENCIA (solo pruebas)\n'+JSON.stringify(status,null,2);
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
  }
  function report(fields){status={...status,...fields};displayStatus();}

  function dateToEnd(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const time = Date.parse(value + 'T23:59:59.999');
    return Number.isFinite(time) ? time : NaN;
  }
  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!value || value.version !== 2 || !value.id || !Number.isFinite(dateToEnd(value.vencimiento))) return null;
      return value;
    } catch (_) { return null; }
  }
  function deleteSaved() { try { localStorage.removeItem(STORAGE_KEY); } catch (_) {} }
  function isValid(saved) {
    const now = Date.now();
    return !!saved && dateToEnd(saved.vencimiento) >= now &&
      !(typeof saved.ultimoUso === 'number' && now + MAX_CLOCK_REGRESSION_MS < saved.ultimoUso);
  }
  function saveLicense(record, previous) {
    const next = { version: 2, id: record.id, user: record.user || 'admin',
      vencimiento: record.vencimiento, ultimoUso: Math.max(Date.now(), previous?.ultimoUso || 0),
      ultimaRevisionOnline: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }
  function touchLicense(lic) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...lic, ultimoUso: Math.max(Date.now(), lic.ultimoUso || 0) })); } catch (_) {}
  }
  async function getFingerprint() {
    if (typeof FingerprintJS === 'undefined') return '';
    try { return (await (await FingerprintJS.load()).get()).visitorId || ''; }
    catch (e) { console.warn('Fingerprint no disponible:', e); return ''; }
  }
  async function remoteList() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const sep = AUTH_URL.includes('?') ? '&' : '?';
      const res = await fetch(AUTH_URL + sep + 'v=' + Date.now(), {
        cache: 'no-store', signal: controller.signal, credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json || !Array.isArray(json.autorizados)) throw new Error('JSON inválido');
      return json.autorizados;
    } finally { clearTimeout(timeout); }
  }
  function showApp() {
    active = true;
    report({resultado:'ACCESO PERMITIDO'});
    document.documentElement.classList.remove('licencia-pendiente', 'licencia-rechazada');
    document.getElementById('guardFullvAviso')?.remove();
  }
  function showDenied(reason) {
    active = false;
    report({resultado:'BLOQUEADO: '+reason});
    deleteSaved();
    document.documentElement.classList.remove('licencia-pendiente');
    document.documentElement.classList.add('licencia-rechazada');
    const render = () => {
      if (document.getElementById('guardFullvAviso')) return;
      const overlay = document.createElement('div');
      overlay.id = 'guardFullvAviso';
      overlay.style.cssText = 'visibility:visible;position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.8);display:flex;justify-content:center;align-items:center;padding:16px;box-sizing:border-box';
      const card = document.createElement('section');
      card.setAttribute('role','alertdialog'); card.setAttribute('aria-modal','true');
      card.style.cssText = 'background:white;color:#222;border-radius:14px;padding:22px;max-width:460px;width:100%;font:15px Arial,sans-serif;text-align:center';
      const title = document.createElement('h2'); title.textContent = 'Modo Admin no disponible';
      const msg = document.createElement('p'); msg.textContent = reason;
      const help = document.createElement('p'); help.textContent = 'La versión gratuita de Mi Tienda sigue disponible con su límite de 50 artículos.';
      const fp = document.createElement('p'); fp.style.cssText = 'font-size:12px;overflow-wrap:anywhere';
      fp.textContent = lastFingerprint ? 'Fingerprint: ' + lastFingerprint : 'Fingerprint no disponible. Revisa la conexión si necesitas activar.';
      const back = document.createElement('button'); back.type='button'; back.textContent='Continuar en versión gratuita';
      back.style.cssText = 'padding:12px;border:0;border-radius:8px;background:#f5e131;font-weight:bold;cursor:pointer';
      back.addEventListener('click', () => location.replace(HOME));
      card.append(title,msg,help,fp,back); overlay.append(card); document.body.append(overlay);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, {once:true}); else render();
  }
  async function verify({startup=false}={}) {
    if (checking) return;
    checking = true;
    try {
      const saved = readSaved();
      if (startup) lastFingerprint = await getFingerprint();
      report({fingerprint:lastFingerprint||'(no disponible)',fuente:'comprobando...'});
      // Si el fingerprint está disponible, debe concordar con la licencia guardada.
      if (saved && lastFingerprint && saved.id !== lastFingerprint) {
        deleteSaved();
      }
      const matchingSaved = saved && (!lastFingerprint || saved.id === lastFingerprint) ? saved : null;
      let records = null;
      try { records = await remoteList(); report({fuente:'autorizados.json consultado por red'}); }
      catch (e) { report({fuente:'NO se pudo consultar JSON: '+e.message});console.warn('Sin consulta online de licencias:', e.message); }

      if (records !== null) {
        const identity = lastFingerprint || matchingSaved?.id || '';
        const entry = records.find(x => x && x.id === identity);
        report({coincidencia: entry ? (entry.cliente||entry.id) : 'NINGUNA para '+identity, revocado: entry ? entry.revocado === true : null, vencimiento: entry?.vencimiento || ''});
        // La eliminación del JSON, revocado:true o vencimiento pasado cancelan la licencia.
        if (!entry || entry.revocado === true || entry.activo === false ||
            !Number.isFinite(dateToEnd(entry.vencimiento)) || dateToEnd(entry.vencimiento) < Date.now()) {
          showDenied('La licencia no está autorizada, fue revocada o llegó a su vencimiento. Contacta a soporte para renovarla.');
          return;
        }
        try { saveLicense(entry, matchingSaved); }
        catch (e) { console.warn('No se pudo guardar licencia local:', e); }
        if (!active) showApp();
        return;
      }
      // Sin conexión: solamente aceptar un registro anterior, vigente y del mismo origen.
      report({coincidencia: matchingSaved ? 'licencia local para '+matchingSaved.id : 'sin licencia local',revocado:null,vencimiento:matchingSaved?.vencimiento||''});
      if (isValid(matchingSaved)) {
        touchLicense(matchingSaved);
        if (!active) showApp();
      } else {
        showDenied('No hay una licencia local vigente. Conéctate a internet para comprobar la autorización.');
      }
    } finally { checking = false; }
  }
  // Iniciar siempre una consulta silenciosa; no se muestra alerta de acceso exitoso.
  verify({startup:true}).catch(e => {
    console.error('Error en licencia:', e);
    showDenied('No se pudo comprobar la licencia.');
  });
  setInterval(() => {
    if (active) verify().catch(e => console.warn('Revisión de licencia:', e));
  }, CHECK_INTERVAL_MS);
  window.addEventListener('online', () => {
    if (active) verify().catch(e => console.warn('Revisión de licencia:', e));
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && active) verify().catch(e => console.warn('Revisión de licencia:', e));
  });
})();
