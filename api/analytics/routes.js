/**
 * Modular API router for visitor telemetry & view counter endpoints.
 * Includes hardened Admin Authentication with HMAC-SHA256 session tokens,
 * timing-safe comparisons, brute-force rate-limiting, and deep analytics.
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { recordView, updateHeartbeat } = require('./tracker');
const { getStats, getAdminStats } = require('./stats');

// Handle view event ingestion (/record is unblocked by uBlock Origin)
async function handleRecord(req, res) {
  try {
    const payload = req.body || {};
    const result = await recordView(req, payload);

    // Fetch updated live stats for the caller's specific site host (excluding localhost/dev)
    const host = payload.siteHost || '';
    const stats = await getStats({ host, includeDev: false });

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
    const host = req.query.host || '';
    const includeDev = req.query.includeDev === 'true';
    const stats = await getStats({ host, includeDev });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}

router.get('/summary', handleSummary);
router.get('/stats', handleSummary); // legacy alias

// =============================================================================
// SECURE ADMIN AUTHENTICATION & TELEMETRY API
// =============================================================================
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'krishna';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'krishna@1729';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'ataraxia-secret-token-key-1729';

// Brute-force rate limiting: tracks failed attempts per client IP
const loginAttempts = new Map();

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';
}

function isRateLimited(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.lastAttempt > 15 * 60 * 1000) {
    loginAttempts.delete(ip);
    return false;
  }
  return record.failures >= 5;
}

function recordFailure(ip) {
  const record = loginAttempts.get(ip) || { failures: 0, lastAttempt: Date.now() };
  record.failures++;
  record.lastAttempt = Date.now();
  loginAttempts.set(ip, record);
}

function clearFailures(ip) {
  loginAttempts.delete(ip);
}

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Constant time dummy check to prevent timing leaks
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Generate signed HMAC token valid for 24 hours
function generateToken(username) {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${username}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64');
}

// Verify HMAC session token
function verifyToken(token) {
  if (!token) return false;
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const parts = raw.split(':');
    if (parts.length !== 3) return false;
    const [username, expiresAtStr, hmac] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return false;
    if (username !== ADMIN_USERNAME) return false;

    const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(`${username}:${expiresAt}`).digest('hex');
    const hmacBuf = Buffer.from(hmac, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (hmacBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(hmacBuf, expBuf);
  } catch (_) {
    return false;
  }
}

function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return req.headers['x-admin-token'] || req.query.token || '';
}

// Admin Login endpoint (checks Username & Password)
router.post('/admin-login', (req, res) => {
  const ip = getClientIP(req);

  if (isRateLimited(ip)) {
    return res.status(429).json({
      success: false,
      error: 'Too many failed login attempts. Temporarily locked for 15 minutes.',
    });
  }

  const { username = '', password = '' } = req.body || {};

  const validUser = safeCompare(username.trim(), ADMIN_USERNAME);
  const validPass = safeCompare(password.trim(), ADMIN_PASSWORD);

  if (validUser && validPass) {
    clearFailures(ip);
    const token = generateToken(ADMIN_USERNAME);
    return res.json({
      success: true,
      token,
      username: ADMIN_USERNAME,
      expiresIn: 86400,
    });
  }

  recordFailure(ip);
  return res.status(401).json({
    success: false,
    error: 'Invalid username or password.',
  });
});

// Admin Verify Token endpoint
router.get('/admin-verify', (req, res) => {
  const token = extractToken(req);
  if (verifyToken(token)) {
    return res.json({ valid: true, username: ADMIN_USERNAME });
  }
  return res.status(401).json({ valid: false, error: 'Session expired or invalid.' });
});

// Admin In-Depth Telemetry Data endpoint
router.get('/admin-data', async (req, res) => {
  const token = extractToken(req);
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required' });
  }

  try {
    const host = req.query.host || '';
    const data = await getAdminStats({ host });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load telemetry', details: err.message });
  }
});

module.exports = router;
