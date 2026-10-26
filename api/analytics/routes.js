/**
 * Modular API router for visitor telemetry & view counter endpoints.
 * Anti-Adblock Hardened:
 * Uses clean first-party endpoint names (/record, /ping, /summary)
 * that bypass uBlock Origin, AdGuard, Brave Shields, and EasyPrivacy lists,
 * while maintaining backward-compatible aliases (/track, /heartbeat, /stats).
 */
const express = require('express');
const router = express.Router();
const { recordView, updateHeartbeat } = require('./tracker');
const { getStats } = require('./stats');

// Handle view event ingestion (/record is unblocked by uBlock Origin)
async function handleRecord(req, res) {
  try {
    const payload = req.body || {};
    const result = await recordView(req, payload);

    // Fetch updated live stats to return immediately to the frontend badge
    const stats = await getStats();

    res.json({
      success: true,
      eventId: result.eventId,
      visitorId: result.visitorId,
      sessionId: result.sessionId,
      device: result.device,
      location: result.location,
      totalViews: stats.totalViews,
      uniqueVisitors: stats.uniqueVisitors,
      viewsToday: stats.viewsToday,
      uniqueToday: stats.uniqueToday,
    });
  } catch (err) {
    console.error('Error recording view:', err);
    res.status(500).json({ error: 'Failed to record view', details: err.message });
  }
}

router.post('/record', handleRecord);
router.post('/track', handleRecord); // legacy alias

// Handle heartbeat / dwell time (/ping is unblocked by uBlock Origin)
async function handlePing(req, res) {
  try {
    const { eventId, durationSeconds } = req.body || {};
    if (eventId) {
      await updateHeartbeat(eventId, durationSeconds);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update heartbeat' });
  }
}

router.post('/ping', handlePing);
router.post('/heartbeat', handlePing); // legacy alias

// Get live aggregated view metrics (/summary is unblocked by uBlock Origin)
async function handleSummary(req, res) {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}

router.get('/summary', handleSummary);
router.get('/stats', handleSummary); // legacy alias

module.exports = router;
