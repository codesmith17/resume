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
    const baseLocation = {
      country: req.headers['x-vercel-ip-country-name'] || vercelCountry,
      countryCode: vercelCountry,
      region: req.headers['x-vercel-ip-country-region'] || 'Unknown',
      city: req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : 'Unknown',
      latitude: req.headers['x-vercel-ip-latitude'] ? parseFloat(req.headers['x-vercel-ip-latitude']) : null,
      longitude: req.headers['x-vercel-ip-longitude'] ? parseFloat(req.headers['x-vercel-ip-longitude']) : null,
      timezone: req.headers['x-vercel-ip-timezone'] || '',
      postal: '',
      org: '',
      asn: req.headers['x-vercel-ip-as-number'] ? `AS${req.headers['x-vercel-ip-as-number']}` : '',
    };

    // Dynamically lookup real Organization / Carrier and ASN from dynamic registry (cached in memory)
    if (ip && ip !== '127.0.0.1' && ip !== '::1' && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
      if (geoCache.has(ip)) {
        const cached = geoCache.get(ip);
        baseLocation.org = cached.org || baseLocation.org;
        baseLocation.asn = cached.asn || baseLocation.asn;
        return baseLocation;
      }
      try {
        const resp = await axios.get(`http://ip-api.com/json/${ip}?fields=status,org,isp,as`, {
          timeout: 2500,
        });
        if (resp.data && resp.data.status === 'success') {
          baseLocation.org = resp.data.org || resp.data.isp || '';
          baseLocation.asn = resp.data.as || baseLocation.asn;
          if (geoCache.size > 2000) geoCache.clear();
          geoCache.set(ip, { ...baseLocation });
        }
      } catch (_) {}
    }

    return baseLocation;
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

  // Parse device with user agent + client hints + screen + hardware telemetry
  const device = parseDevice(
    ua,
    payload.clientHints || {},
    payload.screen || {},
    payload.clientTelemetry || payload.telemetry || {}
  );

  // Determine canonical visitor ID:
  // 1. If payload.visitorId is provided (e.g. from cryptographically verified signed token)
  // 2. Otherwise deterministic hardware vector (hardwareFp)
  // 3. Fallback to fresh UUID
  let canonicalVisitorId = payload.visitorId;
  const hardwareFp = payload.hardwareFp || '';
  if (!canonicalVisitorId) {
    if (hardwareFp) {
      canonicalVisitorId = 'hw_' + hashString(hardwareFp).slice(0, 24);
    } else {
      canonicalVisitorId = 'v_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    }
  }

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
  if (!company && geo.org && geo.org !== 'Unknown' && geo.org !== 'Loopback / Dev') {
    company = geo.org;
  }

  const screen = payload.screen || {};
  const screenRes = screen.width && screen.height ? `${screen.width}x${screen.height}` : '';
  const viewport = screen.viewportW && screen.viewportH ? `${screen.viewportW}x${screen.viewportH}` : '';
  const siteHost = (payload.siteHost || req.headers['x-forwarded-host'] || req.headers['host'] || '').split(':')[0].toLowerCase();
  const clientTelemetry = payload.clientTelemetry || payload.telemetry || {};

  const insertSql = `
    INSERT INTO visitor (
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
      site_host, client_telemetry, visit_timestamps,
      viewed_resume, viewed_cover_letter, downloaded_resume, downloaded_cover_letter, actions,
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
      $45, $46, ARRAY[NOW()],
      1, 0, 0, 0, $47::jsonb,
      NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id, visitor_id, created_at;
  `;

  const params = [
    eventId,
    canonicalVisitorId,
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
    siteHost,
    JSON.stringify(clientTelemetry),
    JSON.stringify([{ action: 'view_resume', timestamp: new Date().toISOString() }]),
  ];

  let inserted = true;
  let activeEventId = eventId;
  let resolvedVisitorId = canonicalVisitorId;

  if (db.isConfigured()) {
    try {
      // Robust revisit check: check if this visitor/session or hardware vector already exists
      const canvasHash = clientTelemetry.canvasHash || '';
      const audioHash = clientTelemetry.audioHash || '';

      const existing = await db.query(
        `SELECT id, visitor_id, view_count, duration_seconds, updated_at 
         FROM visitor 
         WHERE visitor_id = $1 
            OR session_id = $2
            OR (
              $3 != '' AND $4 != '' 
              AND client_telemetry->>'canvasHash' = $3 
              AND client_telemetry->>'audioHash' = $4
            )
         ORDER BY created_at ASC 
         LIMIT 1`,
        [canonicalVisitorId, sessionId, canvasHash, audioHash]
      );

      if (existing.rows.length > 0) {
        // User is revisiting! Do NOT add a new row.
        // Instead, append this distinct attendance timestamp to visit_timestamps array:
        activeEventId = existing.rows[0].id;
        resolvedVisitorId = existing.rows[0].visitor_id || canonicalVisitorId;
        inserted = false;
        await db.query(
          `UPDATE visitor 
           SET view_count = view_count + 1,
               viewed_resume = COALESCE(viewed_resume, 0) + 1,
               visit_timestamps = CASE 
                 WHEN updated_at < NOW() - INTERVAL '15 seconds' THEN array_append(COALESCE(visit_timestamps, ARRAY[created_at]), NOW())
                 ELSE COALESCE(visit_timestamps, ARRAY[created_at])
               END,
               updated_at = NOW(),
               site_host = COALESCE(NULLIF($2, ''), site_host),
               client_telemetry = COALESCE($3, client_telemetry)
           WHERE id = $1`,
          [activeEventId, siteHost, JSON.stringify(clientTelemetry)]
        );
      } else {
        const res = await db.query(insertSql, params);
        if (res.rowCount === 0) {
          inserted = false; // Idempotent duplicate eventId caught
        }
      }
    } catch (err) {
      console.error('[tracker] DB insert error:', err.message);
    }
  }

  return {
    success: true,
    eventId: activeEventId,
    visitorId: resolvedVisitorId,
    sessionId,
    inserted,
    device: device.device,
    location: `${geo.city}, ${geo.country}`,
  };
}

/**
 * Record user interactions (view cover letter, download resume, download cover letter, etc.)
 * Strictly updates the single existing visitor row — never creates a duplicate row.
 */
async function recordAction(eventId, visitorId, actionName, details = {}) {
  if (!db.isConfigured() || !actionName) return;

  const actionEntry = {
    action: actionName,
    label: details.label || actionName,
    elapsed_seconds: details.elapsedSeconds !== undefined ? Math.round(details.elapsedSeconds) : null,
    watched_duration_seconds: details.watchedDurationBeforeDownload !== undefined ? Math.round(details.watchedDurationBeforeDownload) : (details.watchedDuration !== undefined ? Math.round(details.watchedDuration) : null),
    target: details.file || details.target || null,
    timestamp: new Date().toISOString(),
  };

  const colUpdates = [];
  const params = [eventId || '', visitorId || '', JSON.stringify([actionEntry])];

  if (actionName === 'view_resume') {
    colUpdates.push('viewed_resume = COALESCE(viewed_resume, 0) + 1');
  } else if (actionName === 'view_cover_letter') {
    colUpdates.push('viewed_cover_letter = COALESCE(viewed_cover_letter, 0) + 1');
  } else if (actionName === 'download_resume') {
    colUpdates.push('downloaded_resume = COALESCE(downloaded_resume, 0) + 1');
    if (details.elapsedSeconds !== undefined) {
      params.push(Math.round(details.elapsedSeconds));
      colUpdates.push(`download_time_seconds = COALESCE(download_time_seconds, $${params.length})`);
    }
  } else if (actionName === 'download_cover_letter') {
    colUpdates.push('downloaded_cover_letter = COALESCE(downloaded_cover_letter, 0) + 1');
    if (details.elapsedSeconds !== undefined) {
      params.push(Math.round(details.elapsedSeconds));
      colUpdates.push(`download_time_seconds = COALESCE(download_time_seconds, $${params.length})`);
    }
  }

  if (details.resumeDuration !== undefined) {
    params.push(Math.round(details.resumeDuration));
    colUpdates.push(`resume_duration_seconds = GREATEST(COALESCE(resume_duration_seconds, 0), $${params.length})`);
  }
  if (details.letterDuration !== undefined) {
    params.push(Math.round(details.letterDuration));
    colUpdates.push(`letter_duration_seconds = GREATEST(COALESCE(letter_duration_seconds, 0), $${params.length})`);
  }

  const setClause = colUpdates.length ? colUpdates.join(', ') + ', ' : '';

  const sql = `
    UPDATE visitor
    SET ${setClause}
        actions = COALESCE(actions, '[]'::jsonb) || $3::jsonb,
        updated_at = NOW()
    WHERE id = $1 OR visitor_id = $2;
  `;

  try {
    await db.query(sql, params);
  } catch (err) {
    console.error('[tracker] Error recording action:', err.message);
  }
}

/**
 * Update viewing duration / heartbeat for an existing view event.
 */
async function updateHeartbeat(eventId, durationSeconds = 5, resumeDuration = 0, letterDuration = 0) {
  if (!db.isConfigured() || !eventId) return;
  const sql = `
    UPDATE visitor
    SET duration_seconds = GREATEST(duration_seconds, $2::int),
        resume_duration_seconds = GREATEST(COALESCE(resume_duration_seconds, 0), $3::int),
        letter_duration_seconds = GREATEST(COALESCE(letter_duration_seconds, 0), $4::int),
        updated_at = NOW()
    WHERE id = $1;
  `;
  try {
    await db.query(sql, [
      eventId,
      Math.round(durationSeconds),
      Math.round(resumeDuration || 0),
      Math.round(letterDuration || 0)
    ]);
  } catch (err) {
    console.error('[tracker] Heartbeat update error:', err.message);
  }
}

module.exports = {
  recordView,
  recordAction,
  updateHeartbeat,
  resolveLocation,
  getClientIP,
};
