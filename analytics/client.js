(function () {
  'use strict';

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

  var script = typeof document === 'object' && document ? document.currentScript : null;
  var endpoint = script && typeof script.getAttribute === 'function' ? script.getAttribute('data-endpoint') : null;

  if (!isValidEndpoint(endpoint)) {
    return;
  }

  var notice = document.getElementById('visit-notice');
  if (notice) {
    notice.hidden = false;
    notice.textContent = 'Visit logging is enabled: records your public IP, country, browser/device info, and visit details in private storage for 30 days.';
  }

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

  var payload = {
    path: path,
    language: language,
    viewport_width: viewport_width,
    viewport_height: viewport_height,
    referrer: referrer,
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
})();
