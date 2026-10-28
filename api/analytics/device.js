/**
 * High-precision device, OS, and browser detection.
 * Identifies:
 * - Android phones via Google Play Certified Devices Catalog (44k+ models)
 * - Apple iPhone (iPhone 16/15/14/13 Pro/Max/mini, SE) via screen geometry & GPU
 * - Apple iPad (iPad Pro 12.9", iPad Pro 11" M4/M2/M1, iPad Air, mini)
 * - Apple Mac (MacBook Pro 14"/16", MacBook Air 13"/15", iMac, Apple M1/M2/M3/M4 Silicon)
 * - Microsoft Windows (Windows 11 vs 10 via Client Hints, Surface Pro/Laptop, GPU)
 * - Chromebooks (ChromeOS), Linux Desktops, and Mobile Tablets
 */

let deviceCatalog = null;
try {
  deviceCatalog = require('../../data/device_models.json');
} catch (_) {
  // Gracefully fallback if not yet generated
}

function cleanGpu(renderer) {
  if (!renderer || typeof renderer !== 'string') return '';
  let clean = renderer
    .replace(/^ANGLE\s*\([^,]+,\s*/i, '')
    .replace(/,\s*OpenGL.*|\s*Direct3D.*|\s*D3D.*|\(TM\)|\(R\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  clean = clean.replace(/[,;)]+$/, '').trim();
  if (/WebKit|Google SwiftShader|llvmpipe|Software/i.test(clean)) return '';
  return clean;
}

function detectIPhone(w, h, pr, gpu) {
  const min = Math.min(w, h);
  const max = Math.max(w, h);
  const ratio = pr || 3;

  if (min === 440 && max === 956) return 'iPhone 16 Pro Max';
  if (min === 402 && max === 874) return 'iPhone 16 Pro';
  if (min === 430 && max === 932) {
    if (gpu && /A17\s*Pro/i.test(gpu)) return 'iPhone 15 Pro Max';
    if (gpu && /A18/i.test(gpu)) return 'iPhone 16 Plus';
    return 'iPhone 15 Plus / 14 Pro Max';
  }
  if (min === 393 && max === 852) {
    if (gpu && /A17\s*Pro/i.test(gpu)) return 'iPhone 15 Pro';
    if (gpu && /A18/i.test(gpu)) return 'iPhone 16';
    return 'iPhone 15 / 14 Pro';
  }
  if (min === 428 && max === 926) return 'iPhone 14 Plus / 13 Pro Max';
  if (min === 390 && max === 844) {
    if (gpu && /A14/i.test(gpu)) return 'iPhone 12 / 12 Pro';
    if (gpu && /A15/i.test(gpu)) return 'iPhone 13 / 14';
    return 'iPhone 13 / 14';
  }
  if (min === 375 && max === 812) return 'iPhone 11 Pro / XS / X / 13 mini';
  if (min === 414 && max === 896) {
    return ratio >= 3 ? 'iPhone 11 Pro Max / XS Max' : 'iPhone 11 / XR';
  }
  if (min === 375 && max === 667) return 'iPhone SE (2nd/3rd Gen) / 8';
  if (min === 414 && max === 736) return 'iPhone 8 Plus / 7 Plus';

  return 'iPhone';
}

function detectIPad(w, h, pr, gpu) {
  const min = Math.min(w, h);
  const max = Math.max(w, h);

  if (min === 1024 && max === 1366) {
    if (gpu && /M4/i.test(gpu)) return 'iPad Pro 13" (M4)';
    if (gpu && /M2/i.test(gpu)) return 'iPad Pro 12.9" (M2)';
    if (gpu && /M1/i.test(gpu)) return 'iPad Pro 12.9" (M1)';
    return 'iPad Pro 12.9"';
  }
  if (min === 834 && max === 1194) {
    if (gpu && /M4/i.test(gpu)) return 'iPad Pro 11" (M4)';
    if (gpu && /M2/i.test(gpu)) return 'iPad Pro 11" (M2)';
    if (gpu && /M1/i.test(gpu)) return 'iPad Pro 11" (M1)';
    return 'iPad Pro 11" / iPad Air';
  }
  if (min === 820 && max === 1180) return 'iPad Air / iPad (10th Gen)';
  if (min === 810 && max === 1080) return 'iPad (7th/8th/9th Gen)';
  if (min === 744 && max === 1133) return 'iPad mini (6th Gen)';
  if (min === 768 && max === 1024) return 'iPad 9.7"';

  if (gpu && /Apple\sM[0-9]+/i.test(gpu)) {
    const chipMatch = gpu.match(/Apple\sM[0-9]+(?:\s(?:Pro|Max))?/i);
    return `iPad (${chipMatch ? chipMatch[0] : 'Apple Silicon'})`;
  }
  return 'iPad';
}

function detectMac(w, h, pr, gpu) {
  const min = Math.min(w, h);
  const max = Math.max(w, h);
  const hasAppleSilicon = gpu && /Apple\sM[0-9]+/i.test(gpu);
  let chip = '';
  if (hasAppleSilicon) {
    const m = gpu.match(/Apple\sM[0-9]+(?:\s(?:Pro|Max|Ultra))?/i);
    chip = m ? m[0] : 'Apple Silicon';
  }

  if ((min === 900 && max === 1440) || (min === 956 && max === 1470)) {
    return chip ? `MacBook Air 13" (${chip})` : 'MacBook Air 13"';
  }
  if (min === 982 && max === 1512) {
    return chip ? `MacBook Pro 14" (${chip})` : 'MacBook Pro 14"';
  }
  if (min === 1117 && max === 1728) {
    return chip ? `MacBook Pro 16" (${chip})` : 'MacBook Pro 16"';
  }
  if (min === 960 && max === 1536) {
    return chip ? `MacBook Air 15" (${chip})` : 'MacBook Air 15"';
  }
  if (min === 1050 && max === 1680) {
    return chip ? `MacBook Pro 15"/16" (${chip})` : 'MacBook Pro 15"/16"';
  }
  if (min >= 1440 && max >= 2560) {
    return chip ? `iMac / Mac Studio (${chip})` : 'iMac 27" / Mac Display';
  }
  if (min === 1080 && max === 1920) {
    return chip ? `Mac Desktop (${chip})` : 'Mac Desktop';
  }

  if (chip) return `MacBook (${chip})`;
  if (gpu && !/WebKit|Google/i.test(gpu)) return `Mac (${gpu})`;
  return 'Mac';
}

function parseDevice(uaRaw, clientHints = {}, screen = {}, clientTelemetry = {}) {
  const ua = uaRaw || '';
  let deviceBrand = 'Unknown';
  let deviceModel = 'Unknown';
  let deviceType = 'desktop';
  let os = 'Unknown';
  let browser = 'Unknown';
  let browserName = 'Unknown';
  let browserVersion = '';
  let isMobile = false;

  const w = screen.width || 0;
  const h = screen.height || 0;
  const pr = screen.pixelRatio || 1;
  const rawGpu = clientTelemetry.webgl?.renderer || '';
  const gpu = cleanGpu(rawGpu);
  const touchPoints = clientHints.maxTouchPoints || 0;
  const battery = clientTelemetry.battery || {};

  // 1. Google Play Certified Catalog Resolution for Android (O(1) in-memory)
  const rawModel = (clientHints.model || '').trim();
  let catalogResolved = false;

  if (rawModel) {
    deviceModel = rawModel;
  }

  if (deviceCatalog) {
    let match = rawModel ? deviceCatalog[rawModel] : null;
    if (!match && ua) {
      const uaModelMatch = ua.match(/\b(CPH\d{4}|RMX\d{4}|SM-[A-Z0-9]+|XT\d{4}(?:-\d)?|Pixel\s[0-9a-zA-Z]+|2[1-4]\d{2}[A-Z0-9]+)\b/i);
      if (uaModelMatch && deviceCatalog[uaModelMatch[1]]) {
        match = deviceCatalog[uaModelMatch[1]];
        if (!deviceModel || deviceModel === 'Unknown') deviceModel = uaModelMatch[1];
      }
    }

    if (match) {
      deviceBrand = match[0] || deviceBrand;
      deviceModel = match[1] || deviceModel;
      isMobile = true;
      deviceType = 'mobile';
      catalogResolved = true;
    }
  }

  // 2. Mobile / Tablet / Desktop baseline
  if (/mobile/i.test(ua) || (clientHints.mobile !== undefined && clientHints.mobile) || catalogResolved) {
    isMobile = true;
    if (deviceType === 'desktop') deviceType = 'mobile';
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    isMobile = true;
    deviceType = 'tablet';
  }

  // 3. Apple Devices (iPhone, iPad, Mac)
  if (/iPhone/i.test(ua)) {
    deviceBrand = 'Apple';
    deviceType = 'mobile';
    isMobile = true;
    os = 'iOS';
    const match = ua.match(/iPhone OS ([\d_]+)/i);
    if (match) os = `iOS ${match[1].replace(/_/g, '.')}`;
    deviceModel = detectIPhone(w, h, pr, gpu);
  } else if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) {
    deviceBrand = 'Apple';
    deviceType = 'tablet';
    isMobile = true;
    os = 'iPadOS';
    deviceModel = detectIPad(w, h, pr, gpu);
  } else if (/Macintosh|Mac OS X|Mac_PowerPC/i.test(ua)) {
    deviceBrand = 'Apple';
    deviceType = 'desktop';
    isMobile = false;
    const match = ua.match(/Mac OS X ([\d_]+)/i);
    os = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
    deviceModel = detectMac(w, h, pr, gpu);
  }

  // 4. Microsoft Windows (Windows 11 vs 10 + Surface + GPU)
  else if (/Windows NT/i.test(ua) || clientHints.platform === 'Windows') {
    deviceBrand = 'Microsoft';
    isMobile = false;

    let winVer = 'Windows 10/11';
    if (clientHints.platformVersion) {
      const major = parseInt(clientHints.platformVersion.split('.')[0], 10);
      if (!isNaN(major)) {
        if (major >= 13) winVer = 'Windows 11';
        else if (major >= 1) winVer = 'Windows 10';
      }
    } else if (/Windows NT 10.0/i.test(ua)) {
      winVer = 'Windows 10/11';
    } else if (/Windows NT 6.3/i.test(ua)) {
      winVer = 'Windows 8.1';
    } else if (/Windows NT 6.1/i.test(ua)) {
      winVer = 'Windows 7';
    }
    os = winVer;

    // Surface detection (3:2 screen aspect ratio + touch)
    const minD = Math.min(w, h);
    const maxD = Math.max(w, h);
    const isSurfaceRatio = minD > 0 && maxD > 0 && Math.abs((maxD / minD) - 1.5) < 0.05;
    const isSurfaceModel = clientHints.model && /Surface/i.test(clientHints.model);

    if (isSurfaceModel || (touchPoints > 0 && isSurfaceRatio)) {
      deviceModel = isSurfaceModel ? clientHints.model : 'Surface Pro';
      deviceType = touchPoints > 5 ? 'tablet' : 'laptop';
    } else {
      const isLaptop = battery && battery.supported;
      const formFactor = isLaptop ? 'Laptop' : 'PC';
      let arch = (clientHints.architecture === 'arm' || clientHints.architecture === 'arm64') ? 'ARM64' : '';

      deviceModel = `${winVer} ${formFactor}`;
      if (arch) deviceModel += ` (${arch})`;
      deviceType = isLaptop ? 'laptop' : 'desktop';
    }
  }

  // 5. ChromeOS / Chromebooks
  else if (/CrOS/i.test(ua)) {
    deviceBrand = 'Google';
    deviceModel = 'Chromebook';
    deviceType = touchPoints > 0 ? 'convertible' : 'laptop';
    isMobile = false;
    os = 'ChromeOS';
  }

  // 6. Linux Desktops
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
    deviceBrand = 'Generic';
    deviceModel = 'Linux Desktop';
    deviceType = 'desktop';
    isMobile = false;
    os = 'Linux';
  }

  // 7. Generic Android (if catalog not resolved)
  if (/Android/i.test(ua)) {
    if (os === 'Unknown') {
      const androidMatch = ua.match(/Android\s([0-9.]+)/i);
      os = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
    }
    if (deviceBrand === 'Unknown') deviceBrand = 'Android';
    if (deviceModel === 'Unknown') deviceModel = 'Android Device';
  }

  // 8. Browser Detection
  if (/Edg\/|Edge\//i.test(ua)) {
    browserName = 'Microsoft Edge';
    const m = ua.match(/Edg(?:e)?\/([\d.]+)/i);
    browserVersion = m ? m[1] : '';
  } else if (/Chrome\/|CriOS\//i.test(ua) && !/Edg/i.test(ua) && !/OPR\//i.test(ua)) {
    browserName = 'Chrome';
    const m = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/i);
    browserVersion = m ? m[1] : '';
  } else if (/Firefox\/|FxiOS\//i.test(ua)) {
    browserName = 'Firefox';
    const m = ua.match(/(?:Firefox|FxiOS)\/([\d.]+)/i);
    browserVersion = m ? m[1] : '';
  } else if (/Safari/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) {
    browserName = 'Safari';
    const m = ua.match(/Version\/([\d.]+)/i);
    browserVersion = m ? m[1] : '';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browserName = 'Opera';
    const m = ua.match(/(?:OPR|Opera)\/([\d.]+)/i);
    browserVersion = m ? m[1] : '';
  }
  browser = browserVersion ? `${browserName} ${browserVersion.split('.')[0]}` : browserName;

  // 9. Composite Friendly Display String
  let displayDevice = deviceModel !== 'Unknown' ? deviceModel : deviceBrand;

  if (deviceBrand === 'Apple') {
    displayDevice = deviceModel; // "iPhone 15 Pro", "MacBook Pro 14\" (Apple M3 Pro)", "iPad Pro 11\" (M4)"
  } else if (deviceBrand === 'Microsoft') {
    displayDevice = deviceModel;
    if (gpu && !displayDevice.includes(gpu)) {
      displayDevice = `${displayDevice} • ${gpu}`;
    }
  } else if (deviceBrand !== 'Unknown' && deviceModel !== 'Unknown' && !deviceModel.startsWith(deviceBrand)) {
    displayDevice = `${deviceBrand} ${deviceModel}`;
  }

  // Append raw OEM model code if helpful (e.g. OnePlus Nord CE 3 Lite 5G (CPH2467))
  if (rawModel && rawModel !== displayDevice && !displayDevice.includes(rawModel) && deviceBrand !== 'Apple' && deviceBrand !== 'Microsoft') {
    displayDevice = `${displayDevice} (${rawModel})`;
  }

  return {
    device: displayDevice || 'Unknown Device',
    deviceBrand,
    deviceModel,
    deviceType,
    os,
    browser,
    browserName,
    browserVersion,
    isMobile,
  };
}

module.exports = { parseDevice };
