/**
 * Document Viewer Telemetry & View Engine (Anti-Adblock & Deep Client Entropy).
 * Collects deep client-side telemetry (hardware, display, network, battery, fonts, WebGL)
 * without permission prompts, abstracting all analytics from general users.
 */

(function () {
  'use strict';

  // Base API URL: when running statically on github.io, route to deployed Vercel backend
  var API_BASE = (function () {
    var host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    if (host.indexOf('github.io') !== -1) {
      return 'https://resume-mu-ivory-48.vercel.app';
    }
    return '';
  })();

  // Fast SHA-256 / Hash in browser using Web Crypto API with fallback
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

  // --- ENTROPY SOURCE 1: WebGL Unmasked GPU Renderer & Capabilities ---
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
      var glslVer = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
      var maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      var maxCubeMap = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
      var extensions = gl.getSupportedExtensions() || [];

      return {
        supported: true,
        vendor: String(vendor || ''),
        renderer: String(renderer || ''),
        glslVersion: String(glslVer || ''),
        maxTextureSize: maxTexSize || null,
        maxCubeMapSize: maxCubeMap || null,
        extensionsCount: extensions.length,
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

  // --- ENTROPY SOURCE 3: OfflineAudioContext Oscillator & Dynamics Compressor ---
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

  // --- ENTROPY SOURCE 5: Incognito / Private Window Storage Heuristics ---
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

  // --- ENTROPY SOURCE 6: Network Information API ---
  function getNetworkInfo() {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      return {
        supported: true,
        effectiveType: conn.effectiveType || '',
        downlink: conn.downlink || null,
        rtt: conn.rtt || null,
        saveData: Boolean(conn.saveData),
        onLine: Boolean(navigator.onLine),
      };
    }
    return { supported: false, onLine: Boolean(navigator.onLine) };
  }

  // --- ENTROPY SOURCE 7: Battery Status API ---
  async function getBatteryInfo() {
    try {
      if (typeof navigator.getBattery === 'function') {
        var b = await navigator.getBattery();
        return {
          supported: true,
          level: b.level !== undefined ? Math.round(b.level * 100) : null,
          charging: Boolean(b.charging),
          chargingTime: b.chargingTime,
          dischargingTime: b.dischargingTime,
        };
      }
    } catch (_) {}
    return { supported: false };
  }

  // --- ENTROPY SOURCE 8: Speech Synthesis Voices Enumeration ---
  function getSpeechVoicesInfo() {
    try {
      if (window.speechSynthesis) {
        var voices = window.speechSynthesis.getVoices() || [];
        return {
          supported: true,
          count: voices.length,
          sampleVoices: voices.slice(0, 8).map(function (v) {
            return v.name + (v.lang ? ' (' + v.lang + ')' : '');
          }),
        };
      }
    } catch (_) {}
    return { supported: false, count: 0, sampleVoices: [] };
  }

  // --- ENTROPY SOURCE 9: System Installed Fonts Detection ---
  function detectInstalledFonts() {
    try {
      var baseFonts = ['monospace', 'sans-serif', 'serif'];
      var testString = 'mmmmmmmmmmlli';
      var testSize = '72px';
      var h = document.body;
      if (!h) return [];

      var baseWidths = {};
      for (var i = 0; i < baseFonts.length; i++) {
        var s = document.createElement('span');
        s.style.fontSize = testSize;
        s.innerHTML = testString;
        s.style.fontFamily = baseFonts[i];
        s.style.position = 'absolute';
        s.style.left = '-9999px';
        s.style.visibility = 'hidden';
        h.appendChild(s);
        baseWidths[baseFonts[i]] = s.offsetWidth;
        h.removeChild(s);
      }

      var fontList = [
        'Segoe UI', 'Calibri', 'Consolas', 'Cambria', 'Constantia',
        'Trebuchet MS', 'Arial', 'Tahoma', 'Verdana', 'Georgia', 'Impact',
        'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Source Code Pro',
        'Roboto', 'Ubuntu', 'Helvetica Neue', 'San Francisco', 'Menlo', 'Monaco',
        'Palatino', 'MS Gothic', 'Apple Color Emoji', 'Segoe UI Emoji',
        'Droid Sans', 'Cantarell', 'Liberation Sans', 'DejaVu Sans'
      ];

      var detected = [];
      var testSpan = document.createElement('span');
      testSpan.style.fontSize = testSize;
      testSpan.innerHTML = testString;
      testSpan.style.position = 'absolute';
      testSpan.style.left = '-9999px';
      testSpan.style.visibility = 'hidden';
      h.appendChild(testSpan);

      for (var j = 0; j < fontList.length; j++) {
        var font = fontList[j];
        var matched = false;
        for (var k = 0; k < baseFonts.length; k++) {
          testSpan.style.fontFamily = "'" + font + "'," + baseFonts[k];
          if (testSpan.offsetWidth !== baseWidths[baseFonts[k]]) {
            matched = true;
            break;
          }
        }
        if (matched) detected.push(font);
      }
      h.removeChild(testSpan);
      return detected;
    } catch (_) {
      return [];
    }
  }

  // --- ENTROPY SOURCE 10: Client Hints (User-Agent Data) ---
  async function getClientHints() {
    var hints = {
      mobile: /Mobi|Android/i.test(navigator.userAgent),
      maxTouchPoints: navigator.maxTouchPoints || 0,
      platform: navigator.platform || '',
      model: '',
      architecture: '',
      bitness: '',
      platformVersion: '',
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
        if (highEntropy.bitness) hints.bitness = highEntropy.bitness;
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

    if (window.FingerprintJS && typeof window.FingerprintJS.load === 'function') {
      try {
        var fpAgent = await window.FingerprintJS.load();
        var fpResult = await fpAgent.get();
        if (fpResult && fpResult.visitorId) {
          fpVisitorId = fpResult.visitorId;
        }
      } catch (_) {}
    }

    var webglData = getWebGLFingerprint();
    var canvasData = getCanvasFingerprint();
    var audioData = await getAudioFingerprint();
    var mathData = getMathFingerprint();
    var isIncognito = await detectIncognito();
    var clientHints = await getClientHints();
    var batteryData = await getBatteryInfo();
    var networkData = getNetworkInfo();
    var voicesData = getSpeechVoicesInfo();
    var fontsData = detectInstalledFonts();

    var hardwareEntropy = [
      webglData.vendor,
      webglData.renderer,
      canvasData.slice(0, 100),
      audioData,
      mathData,
      navigator.hardwareConcurrency || '0',
      navigator.deviceMemory || '0',
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      window.devicePixelRatio || '1',
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      navigator.language || '',
      navigator.maxTouchPoints || '0',
      clientHints.model || '',
      clientHints.architecture || '',
    ].join('|');

    var customHardwareFp = await sha256(hardwareEntropy);
    var canvasHash = await sha256(canvasData);

    return {
      visitorId: fpVisitorId || ('hw_' + customHardwareFp.slice(0, 16)),
      fpVisitorId: fpVisitorId,
      customHardwareFp: customHardwareFp,
      canvasHash: canvasHash,
      clientHints: clientHints,
      isIncognito: isIncognito,
      webgl: webglData,
      audioHash: audioData,
      battery: batteryData,
      network: networkData,
      voices: voicesData,
      fonts: fontsData,
    };
  }

  // Main Tracking Execution
  async function initDocView() {
    var queryParams = getQueryParams();
    var siteHost = (window.location && window.location.hostname) || '';
    var siteUrl = (window.location && window.location.href) || '';

    var fpData = {};
    try {
      fpData = await extractVisitorFingerprint();
    } catch (_) {
      fpData = {
        visitorId: 'fb_' + Math.random().toString(36).slice(2),
        fpVisitorId: null,
        customHardwareFp: null,
        canvasHash: null,
        clientHints: {},
        isIncognito: false,
        webgl: {},
        battery: {},
        network: {},
        voices: {},
        fonts: [],
      };
    }

    // Fresh event ID generated on EVERY page load / reload (reload double-counts)
    var eventId = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : ('evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2));

    var sessionId = getOrSetStorage('__resume_sid', true);

    // --- RESILIENT EVERCOOKIE QUAD-STORAGE ENGINE ---
    function getIDBToken() {
      return new Promise(function (resolve) {
        if (!window.indexedDB) return resolve(null);
        try {
          var req = window.indexedDB.open('ataraxia_idb', 1);
          req.onupgradeneeded = function (e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains('tokens')) {
              db.createObjectStore('tokens');
            }
          };
          req.onsuccess = function (e) {
            try {
              var db = e.target.result;
              var tx = db.transaction('tokens', 'readonly');
              var store = tx.objectStore('tokens');
              var getReq = store.get('vid');
              getReq.onsuccess = function () {
                resolve(getReq.result || null);
              };
              getReq.onerror = function () { resolve(null); };
            } catch (_) { resolve(null); }
          };
          req.onerror = function () { resolve(null); };
        } catch (_) { resolve(null); }
      });
    }

    function setIDBToken(token) {
      if (!window.indexedDB || !token) return;
      try {
        var req = window.indexedDB.open('ataraxia_idb', 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains('tokens')) {
            db.createObjectStore('tokens');
          }
        };
        req.onsuccess = function (e) {
          try {
            var db = e.target.result;
            var tx = db.transaction('tokens', 'readwrite');
            var store = tx.objectStore('tokens');
            store.put(token, 'vid');
          } catch (_) {}
        };
      } catch (_) {}
    }

    async function retrievePersistentVisitorToken() {
      var token = null;
      // 1. Check document.cookie
      try {
        var match = document.cookie.match(/(?:^|;\s*)__ataraxia_vid=([^;]+)/);
        if (match && match[1]) token = decodeURIComponent(match[1]);
      } catch (_) {}

      // 2. Check localStorage
      if (!token) {
        try { token = localStorage.getItem('__ataraxia_vid'); } catch (_) {}
      }

      // 3. Check sessionStorage
      if (!token) {
        try { token = sessionStorage.getItem('__ataraxia_vid'); } catch (_) {}
      }

      // 4. Check IndexedDB
      if (!token) {
        try { token = await getIDBToken(); } catch (_) {}
      }

      return token || '';
    }

    function storePersistentVisitorToken(token) {
      if (!token) return;
      // 1. localStorage
      try { localStorage.setItem('__ataraxia_vid', token); } catch (_) {}
      // 2. sessionStorage
      try { sessionStorage.setItem('__ataraxia_vid', token); } catch (_) {}
      // 3. document.cookie (2 years lifetime)
      try {
        document.cookie = '__ataraxia_vid=' + encodeURIComponent(token) + '; path=/; max-age=63072000; SameSite=Lax';
      } catch (_) {}
      // 4. IndexedDB
      try { setIDBToken(token); } catch (_) {}
    }

    // Read signed visitor token across all storage layers for unbreakable deduplication
    var savedSignedToken = await retrievePersistentVisitorToken();

    // Deep client telemetry bundle for hidden admin dashboard
    var deepTelemetry = {
      siteHost: siteHost,
      siteUrl: siteUrl,
      canvasHash: fpData.canvasHash,
      audioHash: fpData.audioHash,
      webgl: fpData.webgl,
      battery: fpData.battery,
      network: fpData.network,
      voices: fpData.voices,
      fonts: fpData.fonts,
      clientHints: fpData.clientHints,
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelRatio: window.devicePixelRatio || 1,
        orientation: (screen.orientation && screen.orientation.type) || '',
      },
      window: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
      },
      intl: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        timezoneOffset: new Date().getTimezoneOffset(),
        locale: Intl.DateTimeFormat().resolvedOptions().locale || '',
        languages: navigator.languages ? Array.from(navigator.languages) : [navigator.language || ''],
      },
      environment: {
        pdfViewerEnabled: Boolean(navigator.pdfViewerEnabled),
        cookieEnabled: Boolean(navigator.cookieEnabled),
        doNotTrack: navigator.doNotTrack || '',
        webdriver: Boolean(navigator.webdriver),
        prefersDark: window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : null,
        prefersReducedMotion: window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : null,
      },
    };

    var payload = {
      eventId: eventId,
      siteHost: siteHost,
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
      signedVisitorToken: savedSignedToken,
      clientTelemetry: deepTelemetry,
    };

    // Unblocked first-party endpoint (/api/views/record)
    try {
      var fetchHeaders = {
        'Content-Type': 'application/json',
      };
      if (savedSignedToken) {
        fetchHeaders['X-Signed-Visitor-Token'] = savedSignedToken;
      }

      var response = await fetch(API_BASE + '/api/views/record', {
        method: 'POST',
        headers: fetchHeaders,
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        var data = await response.json();
        if (data.signedVisitorToken) {
          storePersistentVisitorToken(data.signedVisitorToken);
        }
        updateUIStats(data);
      } else {
        fetchStatsOnly(siteHost);
      }
    } catch (_) {
      fetchStatsOnly(siteHost);
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

  // Fetch summary without re-recording a view
  async function fetchStatsOnly(host) {
    try {
      var url = API_BASE + '/api/views/summary';
      if (host) url += '?host=' + encodeURIComponent(host);
      var res = await fetch(url);
      if (res.ok) {
        var stats = await res.json();
        updateUIStats(stats);
      }
    } catch (_) {}
  }

  // Updates ONLY the clean bottom footer badge
  function updateUIStats(data) {
    if (!data) return;
    var totalViews = data.totalViews !== undefined ? data.totalViews : (data.views || 0);
    var badgeContainer = document.getElementById('viewCounterBadge');
    var badgeText = document.getElementById('viewCountText');

    if (badgeContainer && badgeText) {
      if (totalViews > 0) {
        badgeText.textContent = totalViews.toLocaleString() + ' views';
        badgeContainer.style.display = 'inline-flex';
      }
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
