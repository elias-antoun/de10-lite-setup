const MAX_BODY_BYTES = 4096;
const MAX_PATH_LENGTH = 256;
const MAX_LANGUAGE_LENGTH = 64;
const MAX_REFERRER_LENGTH = 253;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_VIEWPORT = 20000;

const JSON_CONTENT_TYPE = 'application/json';

function response(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function badRequest() {
  return response('Bad request', 400);
}

async function readBoundedBody(request) {
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    return { tooLarge: true };
  }

  if (!request.body) return { text: '' };
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return { invalid: true };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes) };
}

function validPath(path, sitePath) {
  return typeof path === 'string' && path.length <= MAX_PATH_LENGTH &&
    (path === sitePath || path === `${sitePath}index.html`) &&
    !path.includes('?') && !path.includes('#');
}

function optionalString(value, maxLength, { hostname = false } = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > maxLength) return undefined;
  const result = value.trim();
  if (hostname && !validHostname(result)) return undefined;
  return result || null;
}

function validHostname(value) {
  if (value.length === 0 || /[\u0000-\u001f\u007f\s/?#@\\]/.test(value)) return false;
  if (value.startsWith('[') || value.endsWith(']')) {
    return value.startsWith('[') && value.endsWith(']') &&
      /^[0-9A-Fa-f:.]+$/.test(value.slice(1, -1));
  }
  if (value.length > MAX_REFERRER_LENGTH) return false;
  return value.split('.').every((label) =>
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}

function optionalViewport(value) {
  if (value === null || value === undefined) return null;
  return Number.isInteger(value) && value > 0 && value <= MAX_VIEWPORT ? value : undefined;
}

function classify(userAgent) {
  const ua = userAgent || '';
  if (!ua) return { browser: 'unknown', os: 'unknown', device_type: 'unknown' };
  let browser = 'unknown';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser\//i.test(ua)) browser = 'Samsung Internet';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Version\/.*Safari\//i.test(ua)) browser = 'Safari';
  else if (/MSIE |Trident\//i.test(ua)) browser = 'Internet Explorer';

  let os = 'unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/(iPhone|iPad|iPod)/i.test(ua)) os = 'iOS';
  else if (/(Macintosh|Mac OS X)/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let deviceType = 'desktop';
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) deviceType = 'tablet';
  else if (/Mobile|iPhone|iPod|Android/i.test(ua)) deviceType = 'mobile';
  return { browser, os, device_type: deviceType };
}

function parsePayload(text, env) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!validPath(body.path, env.SITE_PATH)) return null;

  const language = optionalString(body.language, MAX_LANGUAGE_LENGTH);
  const referrer = optionalString(body.referrer, MAX_REFERRER_LENGTH, { hostname: true });
  const viewportWidth = optionalViewport(body.viewport_width);
  const viewportHeight = optionalViewport(body.viewport_height);
  if (language === undefined || referrer === undefined || viewportWidth === undefined || viewportHeight === undefined) {
    return null;
  }
  return {
    path: body.path,
    language,
    viewport_width: viewportWidth,
    viewport_height: viewportHeight,
    referrer,
  };
}

function requestOriginAllowed(request, env) {
  return request.headers.get('Origin') === env.ALLOWED_ORIGIN;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/visit') return response('Not found', 404);
    if (request.method !== 'POST' && request.method !== 'OPTIONS') return response('Not found', 404);
    if (!requestOriginAllowed(request, env)) return response('Forbidden', 403);

    if (request.method === 'OPTIONS') {
      return response(null, 204, corsHeaders(env.ALLOWED_ORIGIN));
    }
    const contentType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== JSON_CONTENT_TYPE) return response('Unsupported media type', 415);

    const body = await readBoundedBody(request);
    if (body.tooLarge) return response('Payload too large', 413);
    if (body.invalid) return badRequest();
    const payload = parsePayload(body.text, env);
    if (!payload) return badRequest();

    const ip = request.headers.get('CF-Connecting-IP')?.trim();
    if (!ip) return badRequest();
    const country = String(request.cf?.country || request.headers.get('CF-IPCountry') || '').trim().slice(0, 2) || null;
    const userAgent = request.headers.get('User-Agent')?.slice(0, MAX_USER_AGENT_LENGTH) || null;
    const classification = classify(userAgent);
    const record = [
      crypto.randomUUID(),
      new Date().toISOString(),
      ip,
      country,
      payload.path,
      userAgent,
      classification.browser,
      classification.os,
      classification.device_type,
      payload.language,
      payload.viewport_width,
      payload.viewport_height,
      payload.referrer,
    ];

    try {
      await env.DB.prepare(`
        INSERT INTO visits
          (id, visited_at, ip, country, path, user_agent, browser, os, device_type,
           language, viewport_width, viewport_height, referrer)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(...record).run();
    } catch {
      return response('Service unavailable', 503, corsHeaders(env.ALLOWED_ORIGIN));
    }
    return response(null, 204, corsHeaders(env.ALLOWED_ORIGIN));
  },

  async scheduled(controller, env) {
    try {
      const retentionValue = env.RETENTION_DAYS;
      if (typeof retentionValue !== 'string' || !/^\d+$/.test(retentionValue)) throw new Error('invalid retention');
      const retentionDays = Number(retentionValue);
      if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0) throw new Error('invalid retention');
      const scheduledTime = new Date(controller.scheduledTime);
      if (Number.isNaN(scheduledTime.valueOf())) throw new Error('invalid schedule');
      const cutoff = new Date(scheduledTime.valueOf() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
      await env.DB.prepare('DELETE FROM visits WHERE visited_at < ?').bind(cutoff).run();
    } catch {
      throw new Error('Analytics cleanup failed');
    }
  },
};
