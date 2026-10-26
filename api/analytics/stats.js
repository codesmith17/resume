/**
 * Aggregations and metrics queries for Resume Views.
 * Provides:
 * - Total Page Views (counts every load & reload)
 * - Unique Visitors (deduplicated across sessions, incognito & reloads)
 * - Views Today & Unique Today
 * - Top Devices (e.g. iPhone, Mac, Motorola, Samsung, Windows PC)
 * - Top Countries & Cities (approximate)
 * - Recent visits list
 */
const db = require('./db');

async function getStats() {
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
      message: 'DATABASE_URL not configured. Running in memory / offline mode.',
    };
  }

  try {
    // 1. Overall counts
    const overviewRes = await db.query(`
      SELECT
        COUNT(*)::int AS total_views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors,
        COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END)::int AS views_today,
        COUNT(DISTINCT CASE WHEN created_at >= CURRENT_DATE THEN visitor_id END)::int AS unique_today
      FROM resume_views
      WHERE is_bot = FALSE;
    `);

    const overview = overviewRes.rows[0] || {
      total_views: 0,
      unique_visitors: 0,
      views_today: 0,
      unique_today: 0,
    };

    // 2. Top Devices (iPhone, Mac, Motorola, Samsung, Windows, etc.)
    const devicesRes = await db.query(`
      SELECT
        COALESCE(NULLIF(device, ''), 'Unknown') AS name,
        device_brand AS brand,
        device_type AS type,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM resume_views
      WHERE is_bot = FALSE
      GROUP BY device, device_brand, device_type
      ORDER BY views DESC
      LIMIT 8;
    `);

    // 3. Top Countries / Cities
    const geoRes = await db.query(`
      SELECT
        country,
        country_code,
        city,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM resume_views
      WHERE is_bot = FALSE AND country != '' AND country != 'Unknown'
      GROUP BY country, country_code, city
      ORDER BY views DESC
      LIMIT 8;
    `);

    // 4. Recent Visits (anonymized IP, city, device, timestamp)
    const recentRes = await db.query(`
      SELECT
        id,
        city,
        region,
        country,
        country_code,
        device,
        device_brand,
        device_model,
        os,
        browser,
        is_incognito,
        referrer_domain,
        email,
        company,
        duration_seconds,
        created_at
      FROM resume_views
      WHERE is_bot = FALSE
      ORDER BY created_at DESC
      LIMIT 15;
    `);

    return {
      configured: true,
      totalViews: overview.total_views,
      uniqueVisitors: overview.unique_visitors,
      viewsToday: overview.views_today,
      uniqueToday: overview.unique_today,
      topDevices: devicesRes.rows,
      topCountries: geoRes.rows,
      recentVisits: recentRes.rows,
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
      topDevices: [],
      topCountries: [],
      recentVisits: [],
    };
  }
}

module.exports = { getStats };

