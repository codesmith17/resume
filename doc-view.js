/**
 * Document Viewer Telemetry & View Engine.
 * Anti-Adblock Hardened:
 * - Operates entirely through first-party unblocked routes (/api/views/record, /api/views/ping, /api/views/summary).
 * - Avoids blacklisted keywords that trigger uBlock Origin / EasyPrivacy filters.
 * - Double-counts reloads (every reload generates a fresh event_id).
 * - Deduplicates unique visitors using persistent FingerprintJS + hardware GPU / canvas / audio signals.
 */

(function () {
  'use strict';

  // Base API URL: when running statically on github.io, point to deployed Vercel backend
  var API_BASE = (function () {
    var host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    if (host.indexOf('github.io') !== -1) {
      return 'https://resume-mu-ivory-48.vercel.app';
    }
    return '';
  })();

  // Fast SHA-256 in browser using Web Crypto API with fallback
  async function sha256(str) {
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      try {
        var buffer = new TextEncoder().encode(str);
        var hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(hashBuffer))
          .map(function (b) { return b.toString(16).padStart(2, '0'); })
          .join('');
      } catch (_) {}
    }
    var hash = 2166136261;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  // --- ENTROPY SOURCE 1: WebGL Unmasked GPU Renderer & Context ---
  function getWebGLFingerprint() {
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { supported: false };

      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      var vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      var renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

      var vShaderPrec = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
      var fShaderPrec = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);

      return {
        supported: true,
        vendor: String(vendor || ''),
        renderer: String(renderer || ''),
        vShader: vShaderPrec ? [vShaderPrec.rangeMin, vShaderPrec.rangeMax, vShaderPrec.precision].join(',') : '',
        fShader: fShaderPrec ? [fShaderPrec.rangeMin, fShaderPrec.rangeMax, fShaderPrec.precision].join(',') : '',
      };
    } catch (_) {
      return { supported: false, error: true };
    }
  }

  // --- ENTROPY SOURCE 2: Canvas 2D Text, Winding & Subpixel Geometry ---
  function getCanvasFingerprint() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 60;
      var ctx = canvas.getContext('2d');
      if (!ctx) return 'no-canvas';

      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);

      ctx.fillStyle = '#069';
      ctx.font = '11pt no-real-font-123, Arial';
      ctx.fillText('Krishna Resume Telemetry, \ud83d\ude03 \ud83c\udff3\ufe0f\u200d\ud83c\udf08', 2, 15);

      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.font = '18pt Arial';
      ctx.fillText('Krishna Resume Telemetry, \ud83d\ude03 \ud83c\udff3\ufe0f\u200d\ud83c\udf08', 4, 45);

      ctx.beginPath();
      ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.rect(100, 10, 10, 10);
      ctx.fill('evenodd');

      return canvas.toDataURL();
    } catch (_) {
      return 'canvas-err';
    }
  }

  // --- ENTROPY SOURCE 3: OfflineAudioContext Oscillator & Compressor ---
  async function getAudioFingerprint() {
    return new Promise(function (resolve) {
      try {
        var AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AudioCtx) return resolve('no-audio-api');

        var context = new AudioCtx(1, 44100, 44100);
        var oscillator = context.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(10000, context.currentTime);

        var compressor = context.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, context.currentTime);
        compressor.knee.setValueAtTime(40, context.currentTime);
        compressor.ratio.setValueAtTime(12, context.currentTime);
        compressor.reduction.setValueAtTime(-20, context.currentTime);
        compressor.attack.setValueAtTime(0, context.currentTime);
        compressor.release.setValueAtTime(0.25, context.currentTime);

        oscillator.connect(compressor);
        compressor.connect(context.destination);
        oscillator.start(0);

        context.oncomplete = function (event) {
          try {
            var samples = event.renderedBuffer.getChannelData(0);
            var sum = 0;
            for (var i = 4500; i < 5000; i++) {
              sum += Math.abs(samples[i]);
            }
            resolve(String(sum));
          } catch (_) {
            resolve('audio-render-err');
          }
        };

        context.startRendering().catch(function () {
          resolve('audio-timeout');
        });
      } catch (_) {
        resolve('audio-err');
      }
    });
  }

  // --- ENTROPY SOURCE 4: Math Transcendental Function IEEE-754 Precision ---
  function getMathFingerprint() {
    try {
      return [
        Math.acos(0.123124234234234242),
        Math.acosh(1e308),
        Math.asin(0.123124234234234242),
        Math.asinh(1),
        Math.atanh(0.5),
        Math.atan(2),
        Math.sin(-1e300),
        Math.sinh(1),
        Math.cos(21 * Math.LN2),
        Math.cosh(1),
        Math.tan(-1e300),
        Math.tanh(1),
        Math.exp(1),
        Math.expm1(1),
        Math.log1p(10),
      ].join(';');
    } catch (_) {
      return 'math-err';
    }
  }

  // --- ENTROPY SOURCE 5: Incognito / Private Window Heuristics ---
  async function detectIncognito() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        var estimate = await navigator.storage.estimate();
        if (estimate.quota && estimate.quota < 130 * 1024 * 1024) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  // --- ENTROPY SOURCE 6: User-Agent Client Hints High Entropy (Motorola, Samsung, Pixel) ---
  async function getClientHints() {
    var hints = {
      mobile: /Mobi|Android/i.test(navigator.userAgent),
      maxTouchPoints: navigator.maxTouchPoints || 0,
      platform: navigator.platform || '',
      model: '',
    };

    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      try {
        var highEntropy = await navigator.userAgentData.getHighEntropyValues([
          'model',
          'platform',
          'platformVersion',
          'architecture',
          'bitness',
        ]);
        if (highEntropy.model) hints.model = highEntropy.model;
        if (highEntropy.platform) hints.platform = highEntropy.platform;
        if (highEntropy.platformVersion) hints.platformVersion = highEntropy.platformVersion;
        if (highEntropy.architecture) hints.architecture = highEntropy.architecture;
      } catch (_) {}
    }
    return hints;
  }

  // Session & Local Storage persistence
  function getOrSetStorage(key, isSession) {
    var storage = isSession ? window.sessionStorage : window.localStorage;
    try {
      var val = storage.getItem(key);
      if (!val) {
        val = (window.crypto && window.crypto.randomUUID)
          ? window.crypto.randomUUID()
          : ('id_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
        storage.setItem(key, val);
      }
      return val;
    } catch (_) {
      return 'temp_' + Math.random().toString(36).slice(2);
    }
  }

  function getQueryParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      email: params.get('email') || params.get('e') || params.get('contact') || '',
      utmSource: params.get('utm_source') || '',
      utmMedium: params.get('utm_medium') || '',
      utmCampaign: params.get('utm_campaign') || '',
    };
  }

  // --- Master Fingerprint Aggregator ---
  async function extractVisitorFingerprint() {
    var fpVisitorId = null;
    var fpComponents = null;

    // 1. Run official FingerprintJS v5.3.0 if loaded
    if (window.FingerprintJS && typeof window.FingerprintJS.load === 'function') {
      try {
        var fpAgent = await window.FingerprintJS.load();
        var fpResult = await fpAgent.get();
        if (fpResult && fpResult.visitorId) {
          fpVisitorId = fpResult.visitorId;
          fpComponents = fpResult.components;
        }
      } catch (_) {}
    }

    // 2. Run complementary hardened entropy sources
    var webglData = getWebGLFingerprint();
    var canvasData = getCanvasFingerprint();
    var audioData = await getAudioFingerprint();
    var mathData = getMathFingerprint();
    var clientHints = await getClientHints();
    var isIncognito = await detectIncognito();

    // 3. Composite hardware signature
    var canvasHash = await sha256(canvasData);
    var hardwareVector = [
      fpVisitorId || 'no-fpjs',
      webglData.vendor,
      webglData.renderer,
      webglData.vShader,
      webglData.fShader,
      canvasHash,
      audioData,
      mathData,
      screen.width,
      screen.height,
      screen.availWidth,
      screen.availHeight,
      screen.colorDepth,
      window.devicePixelRatio || 1,
      navigator.hardwareConcurrency || 0,
      navigator.maxTouchPoints || 0,
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      navigator.language || '',
      clientHints.platform,
    ].join('###');

    var customHardwareFp = await sha256(hardwareVector);
    var resolvedVisitorId = fpVisitorId || customHardwareFp;

    return {
      visitorId: resolvedVisitorId,
      fpVisitorId: fpVisitorId,
      customHardwareFp: customHardwareFp,
      clientHints: clientHints,
      isIncognito: isIncognito,
    };
  }

  // Main Tracking Execution
  async function initDocView() {
    var queryParams = getQueryParams();
    var fpData = await extractVisitorSafe();

    // Fresh event ID generated on EVERY page load / reload (reload double-counts)
    var eventId = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : ('evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2));

    var sessionId = getOrSetStorage('__resume_sid', true);

    var payload = {
      eventId: eventId,
      visitorId: fpData.visitorId,
      fpVisitorId: fpData.fpVisitorId,
      hardwareFp: fpData.customHardwareFp,
      sessionId: sessionId,
      clientHints: fpData.clientHints,
      isIncognito: fpData.isIncognito,
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
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelRatio: window.devicePixelRatio || 1,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      },
    };

    // Unblocked first-party endpoint (/api/views/record)
    try {
      var response = await fetch(API_BASE + '/api/views/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        var data = await response.json();
        updateUIStats(data);
      } else {
        fetchStatsOnly();
      }
    } catch (_) {
      fetchStatsOnly();
    }

    // Dwell time / heartbeat via unblocked /api/views/ping
    var elapsed = 0;
    var intervals = [5, 10, 15, 30, 60, 60];
    var intervalIndex = 0;

    function scheduleHeartbeat() {
      if (intervalIndex >= intervals.length) return;
      var step = intervals[intervalIndex++];
      setTimeout(function () {
        elapsed += step;
        fetch(API_BASE + '/api/views/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: eventId, durationSeconds: elapsed }),
        }).catch(function () {});
        scheduleHeartbeat();
      }, step * 1000);
    }
    scheduleHeartbeat();
  }

  async function extractVisitorSafe() {
    try {
      return await extractVisitorFingerprint();
    } catch (_) {
      return {
        visitorId: 'fallback_' + Math.random().toString(36).slice(2),
        fpVisitorId: null,
        customHardwareFp: null,
        clientHints: {},
        isIncognito: false,
      };
    }
  }

  // Fetch summary without re-recording a view
  async function fetchStatsOnly() {
    try {
      var res = await fetch(API_BASE + '/api/views/summary');
      if (res.ok) {
        var stats = await res.json();
        updateUIStats(stats);
      }
    } catch (_) {}
  }

  function updateUIStats(data) {
    if (!data) return;
    var totalViews = data.totalViews !== undefined ? data.totalViews : (data.views || 0);
    var badgeContainer = document.getElementById('viewCounterBadge');
    var badgeText = document.getElementById('viewCountText');

    if (badgeContainer && badgeText && totalViews > 0) {
      badgeText.textContent = totalViews.toLocaleString() + ' views';
      badgeContainer.style.display = 'inline-flex';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initDocView();
    });
  } else {
    initDocView();
  }
})();
