/**
 * Visitor Telemetry & Event Ingestion Engine.
 * Implements:
 * - Granular device & hardware model resolution (iPhone, Mac, Android, Moto, Samsung, etc.)
 * - Approximate location lookup (City, Region, Country, ISP) without GPS
 * - Incognito-resilient composite fingerprinting
 * - Full reload counting (every page load records an event)
 * - True unique visitor deduplication across incognito / reloads
 * - Idempotent network retry protection
 */
const crypto = require('crypto');
const axios = require('axios');
const { parseDevice } = require('./device');
const db = require('./db');

// In-memory cache for external IP geolocation lookups (avoids rate limits)
const geoCache = new Map();

function hashString(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const parts = forwarded.split(',');
    return parts[0].trim();
  }
  return req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         '127.0.0.1';
}

function getSubnet(ip) {
  if (!ip) return '0.0.0';
  if (ip.includes('.')) {
    // IPv4 /24
    const parts = ip.split('.');
    return parts.slice(0, 3).join('.');
  }
  if (ip.includes(':')) {
    // IPv6 /48
    const parts = ip.split(':');
    return parts.slice(0, 3).join(':');
  }
  return ip;
}

function isBot(ua) {
  return /bot|crawler|spider|facebook|google|bing|duckduckbot|slurp|yandex|headless|phantom/i.test(ua);
}

/**
 * Resolve approximate geolocation (City, Region, Country, Org/ISP).
 * Prioritizes Vercel edge headers (zero latency), falls back to ip-api/ipapi.
 */
async function resolveLocation(req, ip) {
  // 1. Check Vercel Edge Headers
  const vercelCountry = req.headers['x-vercel-ip-country'];
  if (vercelCountry) {
    return {
      country: req.headers['x-vercel-ip-country-name'] || vercelCountry,
      countryCode: vercelCountry,
      region: req.headers['x-vercel-ip-country-region'] || 'Unknown',
      city: req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : 'Unknown',
      latitude: req.headers['x-vercel-ip-latitude'] ? parseFloat(req.headers['x-vercel-ip-latitude']) : null,
      longitude: req.headers['x-vercel-ip-longitude'] ? parseFloat(req.headers['x-vercel-ip-longitude']) : null,
      timezone: req.headers['x-vercel-ip-timezone'] || '',
      postal: '',
      org: 'Vercel Edge Network',
      asn: '',
    };
  }

  // 2. Private or loopback IP
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return {
      country: 'Local Network',
      countryCode: 'LOC',
      region: 'Localhost',
      city: 'Development',
      latitude: null,
      longitude: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      postal: '',
      org: 'Loopback / Dev',
      asn: '',
    };
  }

  // 3. In-memory cache check
  if (geoCache.has(ip)) {
    return geoCache.get(ip);
  }

  // 4. Fallback API lookup
  try {
    const resp = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,timezone,zip,org,as`, {
      timeout: 3000,
    });
    if (resp.data && resp.data.status === 'success') {
      const result = {
        country: resp.data.country || 'Unknown',
        countryCode: resp.data.countryCode || 'Unknown',
        region: resp.data.regionName || 'Unknown',
        city: resp.data.city || 'Unknown',
        latitude: resp.data.lat || null,
        longitude: resp.data.lon || null,
        timezone: resp.data.timezone || '',
        postal: resp.data.zip || '',
        org: resp.data.org || 'Unknown',
        asn: resp.data.as || '',
      };
      // Keep cache size bounded
      if (geoCache.size > 2000) geoCache.clear();
      geoCache.set(ip, result);
      return result;
    }
  } catch (err) {
    // Geo lookup failed, return clean fallback
  }

  return {
    country: 'Unknown',
    countryCode: 'XX',
    region: 'Unknown',
    city: 'Unknown',
    latitude: null,
    longitude: null,
    timezone: '',
    postal: '',
    org: 'Unknown',
    asn: '',
  };
}

/**
 * Ingest a view event.
 */
async function recordView(req, payload = {}) {
  const ip = getClientIP(req);
  const ipHash = hashString(ip);
  const ua = req.headers['user-agent'] || '';
  const isBotUser = isBot(ua);

  // Parse device with user agent + client hints
  const device = parseDevice(ua, payload.clientHints || {});

  // Compute composite incognito-resilient visitor ID:
  // Combines:
  // 1. Official FingerprintJS v5 hash (payload.fpVisitorId or payload.visitorId)
  // 2. Hardened hardware vector (payload.hardwareFp)
  // 3. Client IP subnet (/24)
  // 4. Device brand & platform
  const clientFp = payload.fpVisitorId || payload.visitorId || crypto.randomUUID();
  const hardwareFp = payload.hardwareFp || '';
  const subnet = getSubnet(ip);
  const compositeVisitorId = hashString(`${clientFp}:${hardwareFp}:${subnet}:${device.deviceBrand}`);

  const eventId = payload.eventId || crypto.randomUUID();
  const sessionId = payload.sessionId || crypto.randomUUID();

  // Location lookup (approximate)
  const geo = await resolveLocation(req, ip);

  // Marketing & referrer tags
  const referrer = payload.referrer || req.headers['referer'] || req.headers['referrer'] || 'Direct';
  let referrerDomain = 'Direct';
  try {
    if (referrer !== 'Direct') {
      referrerDomain = new URL(referrer).hostname;
    }
  } catch (_) {}

  const email = (payload.email || '').trim().toLowerCase();
  let company = '';
  if (email && email.includes('@')) {
    const domain = email.split('@')[1];
    company = domain.split('.')[0];
    company = company.charAt(0).toUpperCase() + company.slice(1);
  }

  const screen = payload.screen || {};
  const screenRes = screen.width && screen.height ? `${screen.width}x${screen.height}` : '';
  const viewport = screen.viewportW && screen.viewportH ? `${screen.viewportW}x${screen.viewportH}` : '';

  const insertSql = `
    INSERT INTO resume_views (
      id, visitor_id, session_id, ip, ip_hash,
      city, region, country, country_code, latitude, longitude,
      timezone, postal, org, asn,
      browser, browser_name, browser_version, os,
      device, device_brand, device_model, device_type,
      platform, screen_res, viewport, pixel_ratio, color_depth,
      cpu_cores, device_memory, is_mobile, is_incognito, is_bot,
      referrer, referrer_domain, email, company,
      utm_source, utm_medium, utm_campaign,
      user_agent, language, duration_seconds, view_count,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15,
      $16, $17, $18, $19,
      $20, $21, $22, $23,
      $24, $25, $26, $27, $28,
      $29, $30, $31, $32, $33,
      $34, $35, $36, $37,
      $38, $39, $40,
      $41, $42, $43, $44,
      NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id, visitor_id, created_at;
  `;

  const params = [
    eventId,
    compositeVisitorId,
    sessionId,
    ip,
    ipHash,
    geo.city,
    geo.region,
    geo.country,
    geo.countryCode,
    geo.latitude,
    geo.longitude,
    geo.timezone || payload.timezone || '',
    geo.postal,
    geo.org,
    geo.asn,
    device.browser,
    device.browserName,
    device.browserVersion,
    device.os,
    device.device,
    device.deviceBrand,
    device.deviceModel,
    device.deviceType,
    payload.platform || '',
    screenRes,
    viewport,
    screen.pixelRatio || 1,
    screen.colorDepth || 24,
    payload.hardwareConcurrency || null,
    payload.deviceMemory || null,
    device.isMobile,
    Boolean(payload.isIncognito),
    isBotUser,
    referrer,
    referrerDomain,
    email,
    company,
    payload.utmSource || '',
    payload.utmMedium || '',
    payload.utmCampaign || '',
    ua,
    req.headers['accept-language']?.split(',')[0] || payload.language || '',
    0, // initial duration
    1, // view count
  ];

  let inserted = true;
  if (db.isConfigured()) {
    try {
      const res = await db.query(insertSql, params);
      if (res.rowCount === 0) {
        inserted = false; // Idempotent duplicate eventId caught
      }
    } catch (err) {
      console.error('[tracker] DB insert error:', err.message);
    }
  }

  return {
    success: true,
    eventId,
    visitorId: compositeVisitorId,
    sessionId,
    inserted,
    device: device.device,
    location: `${geo.city}, ${geo.country}`,
  };
}

/**
 * Update viewing duration / heartbeat for an existing view event.
 */
async function updateHeartbeat(eventId, durationSeconds = 5) {
  if (!db.isConfigured() || !eventId) return;
  const sql = `
    UPDATE resume_views
    SET duration_seconds = GREATEST(duration_seconds, $2::int),
        updated_at = NOW()
    WHERE id = $1;
  `;
  try {
    await db.query(sql, [eventId, Math.round(durationSeconds)]);
  } catch (err) {
    console.error('[tracker] Heartbeat update error:', err.message);
  }
}

module.exports = {
  recordView,
  updateHeartbeat,
  resolveLocation,
  getClientIP,
};
