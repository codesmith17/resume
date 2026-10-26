/**
 * Modular API router for visitor tracking & analytics endpoints.
 */
const express = require('express');
const router = express.Router();
const { recordView, updateHeartbeat } = require('./tracker');
const { getStats } = require('./stats');

// Track page view event (supports reload double-counting + unique visitor deduplication)
router.post('/track', async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await recordView(req, payload);

    // Fetch updated live stats to return immediately to the frontend
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
    console.error('Error tracking view:', err);
    res.status(500).json({ error: 'Failed to record view', details: err.message });
  }
});

// Heartbeat to record time spent on resume
router.post('/heartbeat', async (req, res) => {
  try {
    const { eventId, durationSeconds } = req.body || {};
    if (eventId) {
      await updateHeartbeat(eventId, durationSeconds);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update heartbeat' });
  }
});

// Get aggregated stats for the UI badge & popover
router.get('/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;

