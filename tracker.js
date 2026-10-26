/**
 * Resume Visitor Telemetry & Analytics Client.
 * Features:
 * - Granular device & hardware identification (iPhone, Mac, Android brands like Motorola/Moto, Samsung, Pixel)
 * - Hardware Canvas, WebGL, and AudioContext fingerprinting for robust incognito deduplication
 * - Every page load and reload records an event (double count on reload)
 * - Dedicated session & unique visitor tracking
 * - Live views badge with interactive telemetry popover
 */
(function() {
  'use strict';

  // Simple, fast SHA-256 in browser using SubtleCrypto with fallback
  async function sha256(str) {
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      const buffer = new TextEncoder().encode(str);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
    // FNV-1a 32-bit fallback
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  // 1. Canvas Fingerprint
  function getCanvasFp() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'no-canvas';
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial, sans-serif';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Krishna Resume <canvas> 1.0', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Krishna Resume <canvas> 1.0', 4, 17);
      return canvas.toDataURL();
    } catch (_) {
      return 'canvas-err';
    }
  }

  // 2. WebGL Fingerprint
  function getWebGLFp() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'no-webgl';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return 'webgl-no-ext';
      const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '';
      const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
      return `${vendor}~${renderer}`;
    } catch (_) {
      return 'webgl-err';
    }
  }

  // 3. Detect Incognito / Private Window
  async function detectIncognito() {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const { quota } = await navigator.storage.estimate();
        // Chromium incognito typically limits quota to ~120MB or a fraction of disk
        if (quota && quota < 130 * 1024 * 1024) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  // 4. Client Hints (Extracts exact Motorola, Samsung, Pixel models on Chromium/Android)
  async function getClientHints() {
    const hints = {
      mobile: /Mobi|Android/i.test(navigator.userAgent),
      maxTouchPoints: navigator.maxTouchPoints || 0,
      platform: navigator.platform || '',
      model: '',
    };

    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      try {
        const highEntropy = await navigator.userAgentData.getHighEntropyValues([
          'model',
          'platform',
          'platformVersion',
          'architecture',
        ]);
        if (highEntropy.model) hints.model = highEntropy.model;
        if (highEntropy.platform) hints.platform = highEntropy.platform;
      } catch (_) {}
    }
    return hints;
  }

  // Generate or retrieve persistent visitor ID & session ID
  function getOrSetStorage(key, isSession) {
    const storage = isSession ? window.sessionStorage : window.localStorage;
    try {
      let val = storage.getItem(key);
      if (!val) {
        val = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : ('id_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
        storage.setItem(key, val);
      }
      return val;
    } catch (_) {
      return 'temp_' + Math.random().toString(36).slice(2);
    }
  }

  // Extract query parameters (e.g. ?email=... &utm_source=...)
  function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      email: params.get('email') || params.get('e') || params.get('contact') || '',
      utmSource: params.get('utm_source') || '',
      utmMedium: params.get('utm_medium') || '',
      utmCampaign: params.get('utm_campaign') || '',
    };
  }

  // Main Tracking Execution
  async function initTracker() {
    const queryParams = getQueryParams();
    const clientHints = await getClientHints();
    const isIncognito = await detectIncognito();

    const canvasHash = await sha256(getCanvasFp());
    const webglFp = getWebGLFp();

    // Composite client fingerprint: combines hardware renderer, screen, timezone, platform
    const rawFpString = [
      canvasHash,
      webglFp,
      screen.width,
      screen.height,
      screen.colorDepth,
      window.devicePixelRatio || 1,
      navigator.hardwareConcurrency || 0,
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      navigator.language || '',
      clientHints.platform,
    ].join('###');

    const hardwareFp = await sha256(rawFpString);

    // Primary visitor token: fallback to hardware fingerprint in incognito or when localStorage is reset
    let storedVisitorId = '';
    try {
      storedVisitorId = localStorage.getItem('__resume_vid');
      if (!storedVisitorId) {
        storedVisitorId = hardwareFp;
        localStorage.setItem('__resume_vid', storedVisitorId);
      }
    } catch (_) {
      storedVisitorId = hardwareFp;
    }

    // Fresh event ID generated on EVERY single page load / reload (ensures reloads are counted!)
    const eventId = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : ('evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2));

    const sessionId = getOrSetStorage('__resume_sid', true);

    const payload = {
      eventId: eventId,
      visitorId: storedVisitorId,
      sessionId: sessionId,
      clientHints: clientHints,
      isIncognito: isIncognito,
      referrer: document.referrer || 'Direct',
      email: queryParams.email,
      utmSource: queryParams.utmSource,
      utmMedium: queryParams.utmMedium,
      utmCampaign: queryParams.utmCampaign,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      language: navigator.language || '',
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemory: navigator.deviceMemory || null,
      platform: navigator.platform || '',
      screen: {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth,
        pixelRatio: window.devicePixelRatio || 1,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      },
    };

    // Send view ingestion request
    try {
      const response = await fetch('/api/views/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        updateUIStats(data);
      } else {
        // Fallback fetch stats
        fetchStatsOnly();
      }
    } catch (err) {
      fetchStatsOnly();
    }

    // Start dwell time heartbeat (pings at 5s, 15s, 30s, 60s, 120s, 180s)
    let elapsed = 0;
    const intervals = [5, 10, 15, 30, 60, 60];
    let intervalIndex = 0;

    function scheduleHeartbeat() {
      if (intervalIndex >= intervals.length) return;
      const step = intervals[intervalIndex++];
      setTimeout(() => {
        elapsed += step;
        fetch('/api/views/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: eventId, durationSeconds: elapsed }),
        }).catch(() => {});
        scheduleHeartbeat();
      }, step * 1000);
    }
    scheduleHeartbeat();
  }

  // Fetch stats without re-recording a view
  async function fetchStatsOnly() {
    try {
      const res = await fetch('/api/views/stats');
      if (res.ok) {
        const stats = await res.json();
        updateUIStats(stats);
      }
    } catch (_) {}
  }

  // Update views badge & popover UI
  function updateUIStats(data) {
    const counterText = document.getElementById('viewsCounterText');
    const statTotalViews = document.getElementById('statTotalViews');
    const statUniqueVisitors = document.getElementById('statUniqueVisitors');
    const statViewsToday = document.getElementById('statViewsToday');
    const statYourDevice = document.getElementById('statYourDevice');
    const statLocationFooter = document.getElementById('statLocationFooter');

    const totalViews = data.totalViews !== undefined ? data.totalViews : (data.views || 0);
    const uniqueVisitors = data.uniqueVisitors !== undefined ? data.uniqueVisitors : 0;

    if (counterText) {
      if (totalViews > 0) {
        counterText.textContent = `${totalViews.toLocaleString()} views`;
        if (uniqueVisitors > 0) {
          counterText.title = `${totalViews} total views • ${uniqueVisitors} unique visitors`;
        }
      } else {
        counterText.textContent = '1 view';
      }
    }

    if (statTotalViews) statTotalViews.textContent = totalViews.toLocaleString();
    if (statUniqueVisitors) statUniqueVisitors.textContent = uniqueVisitors.toLocaleString();
    if (statViewsToday) statViewsToday.textContent = (data.viewsToday || 0).toLocaleString();
    if (statYourDevice && data.device) statYourDevice.textContent = data.device;
    if (statLocationFooter && data.location) {
      statLocationFooter.textContent = `📍 Approximate location: ${data.location}`;
    }
  }

  // Popover toggle handling
  function initPopover() {
    const badgeBtn = document.getElementById('viewsBadgeBtn');
    const popover = document.getElementById('viewsPopover');
    if (!badgeBtn || !popover) return;

    badgeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const isVisible = popover.classList.contains('is-visible');
      if (isVisible) {
        popover.classList.remove('is-visible');
      } else {
        popover.classList.add('is-visible');
        fetchStatsOnly();
      }
    });

    document.addEventListener('click', function(e) {
      if (!popover.contains(e.target) && e.target !== badgeBtn) {
        popover.classList.remove('is-visible');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initPopover();
      initTracker();
    });
  } else {
    initPopover();
    initTracker();
  }
})();

