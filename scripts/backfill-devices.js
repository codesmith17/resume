/**
 * One-time backfill script to update historical visitor rows in YugabyteDB
 * with the new high-precision Google Play Certified & Apple/Windows device names.
 */
const db = require('../api/analytics/db');
const { parseDevice } = require('../api/analytics/device');

async function backfillDevices() {
  if (!db.isConfigured()) {
    console.error('DATABASE_URL not configured.');
    process.exit(1);
  }

  console.log('[backfill-devices] Querying all visitor rows...');
  const res = await db.query(`
    SELECT id, user_agent, client_telemetry, screen_res, pixel_ratio, device, os
    FROM visitor
    ORDER BY created_at DESC;
  `);

  console.log(`[backfill-devices] Found ${res.rows.length} rows to evaluate.`);

  let updatedCount = 0;
  for (const v of res.rows) {
    const t = v.client_telemetry || {};
    const hints = t.clientHints || {};
    const screen = {
      width: parseInt((v.screen_res || '').split('x')[0], 10) || 0,
      height: parseInt((v.screen_res || '').split('x')[1], 10) || 0,
      pixelRatio: v.pixel_ratio || 1,
    };

    const resolved = parseDevice(v.user_agent, hints, screen, t);

    // Only update if resolved name is better/different
    if (resolved.device && resolved.device !== 'Unknown Device' && (resolved.device !== v.device || resolved.os !== v.os)) {
      console.log(`Updating #${v.id.slice(0, 8)}:`);
      console.log(`  OLD: "${v.device}" (${v.os})`);
      console.log(`  NEW: "${resolved.device}" (${resolved.os})`);

      await db.query(`
        UPDATE visitor
        SET
          device = $1,
          device_brand = $2,
          device_model = $3,
          device_type = $4,
          os = $5
        WHERE id = $6;
      `, [
        resolved.device,
        resolved.deviceBrand,
        resolved.deviceModel,
        resolved.deviceType,
        resolved.os,
        v.id
      ]);

      updatedCount++;
    }
  }

  console.log(`[backfill-devices] Successfully updated ${updatedCount} rows in the database.`);
  process.exit(0);
}

if (require.main === module) {
  backfillDevices().catch(err => {
    console.error('[backfill-devices] Error:', err);
    process.exit(1);
  });
}

module.exports = { backfillDevices };
