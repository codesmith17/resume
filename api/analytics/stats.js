/**
 * Aggregations and metrics queries for Resume Views.
 * Provides:
 * - Public Stats: Filtered strictly for real production visitors (excludes localhost, 127.0.0.1, dev reloads)
 * - Admin Stats: Full unredacted telemetry, client hardware/environment dumps, per-host breakdowns
 */
const db = require('./db');

/**
 * Public stats for the footer view counter badge.
 * Only counts real production traffic, strictly ignoring localhost/127.0.0.1.
 */
async function getStats(options = {}) {
  const { host = '', includeDev = false } = options;

  if (!db.isConfigured()) {
    return {
      configured: false,
      totalViews: 0,
      uniqueVisitors: 0,
      viewsToday: 0,
      uniqueToday: 0,
      topDevices: [],
      topCountries: [],
      recentVisits: [],
      message: 'DATABASE_URL not configured. Running in offline mode.',
    };
  }

  try {
    let where = 'WHERE is_bot = FALSE';
    const params = [];

    // Filter out localhost / development from public production counters
    if (!includeDev) {
      where += ` AND ip NOT IN ('127.0.0.1', '::1')
                 AND (country != 'Local Network' OR country IS NULL)
                 AND (site_host IS NULL OR (site_host NOT LIKE '%localhost%' AND site_host NOT LIKE '%127.0.0.1%'))`;
    }

    if (host && host.trim()) {
      params.push(`%${host.trim().toLowerCase()}%`);
      where += ` AND (LOWER(site_host) LIKE $${params.length} OR site_host IS NULL)`;
    }

    // 1. Production counts
    const overviewRes = await db.query(`
      SELECT
        COUNT(*)::int AS total_views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors,
        COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END)::int AS views_today,
        COUNT(DISTINCT CASE WHEN created_at >= CURRENT_DATE THEN visitor_id END)::int AS unique_today
      FROM resume_views
      ${where};
    `, params);

    const overview = overviewRes.rows[0] || {
      total_views: 0,
      unique_visitors: 0,
      views_today: 0,
      unique_today: 0,
    };

    return {
      configured: true,
      totalViews: overview.total_views,
      uniqueVisitors: overview.unique_visitors,
      viewsToday: overview.views_today,
      uniqueToday: overview.unique_today,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[stats] Query error:', err.message);
    return {
      configured: true,
      error: err.message,
      totalViews: 0,
      uniqueVisitors: 0,
      viewsToday: 0,
      uniqueToday: 0,
    };
  }
}

/**
 * Comprehensive in-depth admin analytics.
 * Includes complete visitor telemetry, client hardware profiles, deep fingerprints, and host metrics.
 */
async function getAdminStats(options = {}) {
  const { host = '' } = options;

  if (!db.isConfigured()) {
    return { configured: false, error: 'Database not configured' };
  }

  try {
    let hostFilter = '';
    const params = [];
    if (host && host !== 'all') {
      params.push(`%${host.toLowerCase()}%`);
      hostFilter = ` AND LOWER(site_host) LIKE $${params.length}`;
    }

    // 1. Production Overview (Excludes localhost/dev)
    const prodOverviewRes = await db.query(`
      SELECT
        COUNT(*)::int AS total_views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors,
        COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END)::int AS views_today,
        COUNT(DISTINCT CASE WHEN created_at >= CURRENT_DATE THEN visitor_id END)::int AS unique_today,
        COALESCE(AVG(duration_seconds)::int, 0) AS avg_duration_seconds,
        COUNT(CASE WHEN updated_at >= NOW() - INTERVAL '5 minutes' THEN 1 END)::int AS active_visitors
      FROM resume_views
      WHERE is_bot = FALSE
        AND ip NOT IN ('127.0.0.1', '::1')
        AND (country != 'Local Network' OR country IS NULL)
        AND (site_host IS NULL OR (site_host NOT LIKE '%localhost%' AND site_host NOT LIKE '%127.0.0.1%'))
        ${hostFilter};
    `, params);

    // 2. Localhost / Dev Hits Overview
    const devOverviewRes = await db.query(`
      SELECT
        COUNT(*)::int AS dev_views,
        COUNT(DISTINCT visitor_id)::int AS dev_visitors
      FROM resume_views
      WHERE ip IN ('127.0.0.1', '::1')
         OR country = 'Local Network'
         OR site_host LIKE '%localhost%'
         OR site_host LIKE '%127.0.0.1%';
    `);

    // 3. Hosts distribution (e.g. codesmith17.github.io vs vercel vs localhost)
    const hostsRes = await db.query(`
      SELECT
        COALESCE(NULLIF(site_host, ''), 'unspecified') AS host,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM resume_views
      GROUP BY site_host
      ORDER BY views DESC;
    `);

    // 4. Devices breakdown
    const devicesRes = await db.query(`
      SELECT
        COALESCE(NULLIF(device, ''), 'Unknown') AS name,
        device_brand AS brand,
        device_type AS type,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM resume_views
      WHERE is_bot = FALSE ${hostFilter}
      GROUP BY device, device_brand, device_type
      ORDER BY views DESC
      LIMIT 10;
    `, params);

    // 5. Operating Systems breakdown
    const osRes = await db.query(`
      SELECT
        COALESCE(NULLIF(os, ''), 'Unknown') AS os,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM resume_views
      WHERE is_bot = FALSE ${hostFilter}
      GROUP BY os
      ORDER BY views DESC
      LIMIT 10;
    `, params);

    // 6. Browsers breakdown
    const browserRes = await db.query(`
      SELECT
        COALESCE(NULLIF(browser, ''), 'Unknown') AS browser,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM resume_views
      WHERE is_bot = FALSE ${hostFilter}
      GROUP BY browser
      ORDER BY views DESC
      LIMIT 10;
    `, params);

    // 7. Countries and Cities breakdown
    const geoRes = await db.query(`
      SELECT
        country,
        country_code,
        city,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM resume_views
      WHERE is_bot = FALSE AND country != '' AND country != 'Unknown' ${hostFilter}
      GROUP BY country, country_code, city
      ORDER BY views DESC
      LIMIT 10;
    `, params);

    // 8. Referrers & Traffic Sources
    const refRes = await db.query(`
      SELECT
        COALESCE(NULLIF(referrer_domain, ''), 'Direct') AS domain,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM resume_views
      WHERE is_bot = FALSE ${hostFilter}
      GROUP BY referrer_domain
      ORDER BY views DESC
      LIMIT 10;
    `, params);

    // 9. Full Recent Visits with complete client_telemetry
    const recentRes = await db.query(`
      SELECT
        id,
        visitor_id,
        session_id,
        site_host,
        ip,
        city,
        region,
        country,
        country_code,
        latitude,
        longitude,
        org,
        asn,
        device,
        device_brand,
        device_model,
        device_type,
        os,
        browser,
        browser_name,
        browser_version,
        platform,
        screen_res,
        viewport,
        pixel_ratio,
        color_depth,
        cpu_cores,
        device_memory,
        is_mobile,
        is_incognito,
        is_bot,
        referrer,
        referrer_domain,
        email,
        company,
        utm_source,
        utm_medium,
        utm_campaign,
        user_agent,
        language,
        duration_seconds,
        view_count,
        client_telemetry,
        created_at,
        updated_at
      FROM resume_views
      ORDER BY created_at DESC
      LIMIT 60;
    `);

    return {
      configured: true,
      overview: prodOverviewRes.rows[0] || {},
      devOverview: devOverviewRes.rows[0] || {},
      hosts: hostsRes.rows,
      devices: devicesRes.rows,
      operatingSystems: osRes.rows,
      browsers: browserRes.rows,
      geo: geoRes.rows,
      referrers: refRes.rows,
      recentVisits: recentRes.rows,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[stats] Admin Query error:', err.message);
    return {
      configured: true,
      error: err.message,
    };
  }
}

module.exports = { getStats, getAdminStats };
