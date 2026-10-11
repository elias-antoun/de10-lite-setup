(function () {
  'use strict';

  var VISITOR_KEY = 'de10-visitor';
  var SESSION_KEY = 'de10-session';
  var OPT_OUT_KEY = 'de10-notrack';
  var PROGRESS_KEY = 'de10lite-guide-v3';
  var SESSION_IDLE_MS = 30 * 60 * 1000;
  var LOAD_WAIT_MS = 10000;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var SOURCE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

  function isValidEndpoint(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') return false;
    if (endpoint.includes('?') || endpoint.includes('#')) return false;
    try {
      var url = new URL(endpoint);
      return (
        url.protocol === 'https:' &&
        url.pathname === '/visit' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch (_) {
      return false;
    }
  }

  // Storage can be missing or throw (private windows, blocked site data); every
  // read and write degrades to "not available" instead of stopping the script.
  function storage() {
    try {
      return typeof localStorage === 'object' && localStorage ? localStorage : null;
    } catch (_) {
      return null;
    }
  }

  function read(key) {
    var store = storage();
    if (!store) return null;
    try { return store.getItem(key); } catch (_) { return null; }
  }

  function write(key, value) {
    var store = storage();
    if (!store) return false;
    try { store.setItem(key, value); return true; } catch (_) { return false; }
  }

  function remove(key) {
    var store = storage();
    if (!store) return;
    try { store.removeItem(key); } catch (_) {}
  }

  function newId() {
    try {
      if (typeof crypto === 'object' && crypto) {
        if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        if (typeof crypto.getRandomValues === 'function') {
          var b = crypto.getRandomValues(new Uint8Array(16));
          b[6] = (b[6] & 0x0f) | 0x40;
          b[8] = (b[8] & 0x3f) | 0x80;
          var h = '';
          for (var i = 0; i < 16; i++) h += (b[i] < 16 ? '0' : '') + b[i].toString(16);
          return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
        }
      }
    } catch (_) {}
    return null;
  }

  function now() {
    return typeof Date === 'function' ? Date.now() : 0;
  }

  var script = typeof document === 'object' && document ? document.currentScript : null;
  var endpoint = script && typeof script.getAttribute === 'function' ? script.getAttribute('data-endpoint') : null;

  if (!isValidEndpoint(endpoint)) {
    return;
  }

  var params = null;
  try {
    params = new URLSearchParams(typeof location === 'object' && location && typeof location.search === 'string' ? location.search : '');
  } catch (_) {}

  // ?notrack opts this browser out, ?track opts it back in. The parameter is then
  // dropped from the address bar so it is not copied into shared links.
  if (params && (params.has('notrack') || params.has('track'))) {
    if (params.has('notrack')) write(OPT_OUT_KEY, '1');
    else remove(OPT_OUT_KEY);
    try {
      params.delete('notrack');
      params.delete('track');
      if (typeof history === 'object' && history && typeof history.replaceState === 'function') {
        var rest = params.toString();
        history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + (location.hash || ''));
      }
    } catch (_) {}
  }

  var optedOut = read(OPT_OUT_KEY) === '1';
  var noticeOn = document.getElementById('visit-notice');
  var noticeOff = document.getElementById('visit-off');
  if (optedOut) {
    if (noticeOff) noticeOff.hidden = false;
    return;
  }
  if (noticeOn) noticeOn.hidden = false;

  var path = '/';
  if (typeof location === 'object' && location && typeof location.pathname === 'string') {
    path = location.pathname.slice(0, 256);
  }

  var language = null;
  try {
    if (typeof navigator === 'object' && navigator && typeof navigator.language === 'string') {
      var lang = navigator.language.trim();
      if (lang.length > 0) {
        language = lang.slice(0, 64);
      }
    }
  } catch (_) {}

  var viewport_width = null;
  if (typeof innerWidth === 'number' && Number.isInteger(innerWidth) && innerWidth > 0 && innerWidth <= 20000) {
    viewport_width = innerWidth;
  }

  var viewport_height = null;
  if (typeof innerHeight === 'number' && Number.isInteger(innerHeight) && innerHeight > 0 && innerHeight <= 20000) {
    viewport_height = innerHeight;
  }

  var referrer = null;
  try {
    if (typeof document === 'object' && document && typeof document.referrer === 'string' && document.referrer.trim() !== '') {
      var refUrl = new URL(document.referrer);
      if ((refUrl.protocol === 'http:' || refUrl.protocol === 'https:') && refUrl.hostname) {
        var host = refUrl.hostname.trim().toLowerCase().slice(0, 253);
        if (host.length > 0) {
          referrer = host;
        }
      }
    }
  } catch (_) {}

  // An anonymous random ID kept in this browser, so returning visits can be told
  // apart from new ones. If storage is unavailable, no ID is sent at all.
  var visitor_id = read(VISITOR_KEY);
  if (!visitor_id || !UUID.test(visitor_id)) {
    var fresh = newId();
    visitor_id = fresh && write(VISITOR_KEY, fresh) ? fresh : null;
  }

  // A session groups page loads that are less than 30 idle minutes apart.
  var session_id = null;
  try {
    var saved = JSON.parse(read(SESSION_KEY) || 'null');
    if (saved && typeof saved.id === 'string' && UUID.test(saved.id) &&
        typeof saved.t === 'number' && now() - saved.t >= 0 && now() - saved.t < SESSION_IDLE_MS) {
      session_id = saved.id;
    }
  } catch (_) {}
  if (!session_id) session_id = newId();
  if (session_id && !write(SESSION_KEY, JSON.stringify({ id: session_id, t: now() }))) session_id = null;

  // How many guide steps this browser has ticked, read from the page's own saved
  // progress. Zero when nothing is saved yet; null when storage is unavailable.
  var steps_done = null;
  if (storage()) {
    steps_done = 0;
    try {
      var progress = JSON.parse(read(PROGRESS_KEY) || 'null');
      if (progress && progress.done) {
        ['setup', 'lab'].forEach(function (phase) {
          if (Array.isArray(progress.done[phase])) {
            progress.done[phase].forEach(function (ticked) { if (ticked === true) steps_done++; });
          }
        });
      }
    } catch (_) {}
    if (steps_done > 99) steps_done = 99;
  }

  // Which link brought the visitor, from ?src=... (for example ?src=moodle).
  var src = null;
  if (params) {
    var source = (params.get('src') || '').trim().toLowerCase();
    if (SOURCE.test(source)) src = source;
  }

  var sent = false;
  function send(loaded) {
    if (sent) return;
    sent = true;

    var load_ms = null;
    if (loaded) {
      try {
        if (typeof performance === 'object' && performance && typeof performance.now === 'function') {
          var ms = Math.round(performance.now());
          if (Number.isInteger(ms) && ms >= 0 && ms <= 600000) load_ms = ms;
        }
      } catch (_) {}
    }

    var payload = {
      path: path,
      language: language,
      viewport_width: viewport_width,
      viewport_height: viewport_height,
      referrer: referrer,
      visitor_id: visitor_id,
      session_id: session_id,
      steps_done: steps_done,
      src: src,
      load_ms: load_ms,
    };

    try {
      var res = fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'omit',
        keepalive: true,
        body: JSON.stringify(payload),
      });
      if (res && typeof res.catch === 'function') {
        res.catch(function () {});
      }
    } catch (_) {}
  }

  // Send once the page has finished loading, so load time can be recorded. A visit
  // that leaves first, or a load that stalls, is still sent, just without load_ms.
  if (document.readyState === 'complete' || typeof addEventListener !== 'function') {
    send(true);
  } else {
    addEventListener('load', function () { send(true); }, { once: true });
    addEventListener('pagehide', function () { send(false); }, { once: true });
    if (typeof setTimeout === 'function') setTimeout(function () { send(false); }, LOAD_WAIT_MS);
  }
})();
