/**
 * High-precision device, OS, and browser detection.
 * Identifies iPhone, Mac, Android brands (Motorola/Moto, Samsung, Pixel, OnePlus, etc.),
 * Windows, tablets, and desktops using User-Agent Client Hints + User-Agent regex heuristics.
 */

function parseDevice(uaRaw, clientHints = {}) {
  const ua = uaRaw || '';
  let deviceBrand = 'Unknown';
  let deviceModel = 'Unknown';
  let deviceType = 'desktop';
  let os = 'Unknown';
  let browser = 'Unknown';
  let browserName = 'Unknown';
  let browserVersion = '';
  let isMobile = false;

  // 1. Client Hints (High Entropy if sent by modern browsers)
  if (clientHints.model) {
    deviceModel = clientHints.model;
  }

  // 2. Mobile / Tablet / Desktop detection
  if (/mobile/i.test(ua) || (clientHints.mobile !== undefined && clientHints.mobile)) {
    isMobile = true;
    deviceType = 'mobile';
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    isMobile = true;
    deviceType = 'tablet';
  }

  // 3. Brand & Specific Model Heuristics
  // --- APPLE (iPhone, iPad, Mac) ---
  if (/iPhone/i.test(ua)) {
    deviceBrand = 'Apple';
    deviceModel = 'iPhone';
    deviceType = 'mobile';
    isMobile = true;
    os = 'iOS';
    const match = ua.match(/iPhone OS ([\d_]+)/i);
    if (match) os = `iOS ${match[1].replace(/_/g, '.')}`;
  } else if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && clientHints.maxTouchPoints > 1)) {
    deviceBrand = 'Apple';
    deviceModel = 'iPad';
    deviceType = 'tablet';
    isMobile = true;
    os = 'iPadOS';
  } else if (/Macintosh|Mac OS X|Mac_PowerPC/i.test(ua)) {
    deviceBrand = 'Apple';
    deviceModel = 'Mac';
    deviceType = 'desktop';
    isMobile = false;
    const match = ua.match(/Mac OS X ([\d_]+)/i);
    os = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
  }

  // --- MOTOROLA / MOTO ---
  else if (/moto|motorola|XT[0-9]{4}|MB[0-9]{3}|moto\s[a-z0-9]+/i.test(ua) || /moto/i.test(deviceModel)) {
    deviceBrand = 'Motorola';
    isMobile = true;
    deviceType = 'mobile';
    const motoMatch = ua.match(/(moto[\s_][a-zA-Z0-9\s]+?)(?=\sBuild|\)|\;|\/)/i) ||
                      ua.match(/(XT\d{4})/i);
    deviceModel = motoMatch ? motoMatch[1].trim() : (deviceModel !== 'Unknown' ? `Moto ${deviceModel}` : 'Motorola (Moto)');
  }

  // --- SAMSUNG ---
  else if (/samsung|SM-[A-Z0-9]+|GT-[A-Z0-9]+|SCH-[A-Z0-9]+/i.test(ua) || /samsung/i.test(deviceModel)) {
    deviceBrand = 'Samsung';
    isMobile = true;
    const smMatch = ua.match(/(SM-[A-Za-z0-9]+)/i);
    deviceModel = smMatch ? `Galaxy (${smMatch[1]})` : (deviceModel !== 'Unknown' ? `Samsung ${deviceModel}` : 'Samsung Galaxy');
    if (/tablet|sm-t/i.test(ua)) deviceType = 'tablet';
  }

  // --- GOOGLE PIXEL ---
  else if (/Pixel(\s[0-9a-zA-Z]+)?/i.test(ua) || /pixel/i.test(deviceModel)) {
    deviceBrand = 'Google';
    isMobile = true;
    deviceType = 'mobile';
    const pixelMatch = ua.match(/(Pixel[\s_]?[0-9a-zA-Z\s]+?)(?=\sBuild|\)|\;|\/)/i);
    deviceModel = pixelMatch ? pixelMatch[1].trim() : (deviceModel !== 'Unknown' ? deviceModel : 'Google Pixel');
  }

  // --- ONEPLUS ---
  else if (/OnePlus|ONEPLUS|GM19\d{2}|HD19\d{2}|IN20\d{2}/i.test(ua)) {
    deviceBrand = 'OnePlus';
    isMobile = true;
    deviceType = 'mobile';
    deviceModel = deviceModel !== 'Unknown' ? `OnePlus ${deviceModel}` : 'OnePlus';
  }

  // --- XIAOMI / REDMI / POCO ---
  else if (/Redmi|POCO|Xiaomi|2201|2109|M2\d{3}|2304/i.test(ua)) {
    deviceBrand = /POCO/i.test(ua) ? 'POCO' : (/Redmi/i.test(ua) ? 'Redmi' : 'Xiaomi');
    isMobile = true;
    deviceType = 'mobile';
    deviceModel = deviceModel !== 'Unknown' ? `${deviceBrand} ${deviceModel}` : `${deviceBrand} Device`;
  }

  // --- REALME / OPPO / VIVO ---
  else if (/Realme|RMX\d{4}/i.test(ua)) {
    deviceBrand = 'Realme';
    isMobile = true;
    deviceModel = 'Realme';
  } else if (/OPPO|CPH\d{4}/i.test(ua)) {
    deviceBrand = 'OPPO';
    isMobile = true;
    deviceModel = 'OPPO';
  } else if (/vivo|V\d{4}[A-Z]?/i.test(ua)) {
    deviceBrand = 'Vivo';
    isMobile = true;
    deviceModel = 'Vivo';
  }

  // --- WINDOWS PC ---
  else if (/Windows NT/i.test(ua)) {
    deviceBrand = 'Microsoft';
    deviceModel = 'Windows PC';
    deviceType = 'desktop';
    isMobile = false;
    if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
    else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
    else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
    else os = 'Windows';
  }

  // --- LINUX DESKTOP ---
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
    deviceBrand = 'Generic';
    deviceModel = 'Linux Desktop';
    deviceType = 'desktop';
    isMobile = false;
    os = 'Linux';
  }

  // --- GENERIC ANDROID ---
  if (/Android/i.test(ua) && os === 'Unknown') {
    const androidMatch = ua.match(/Android\s([0-9.]+)/i);
    os = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
    if (deviceBrand === 'Unknown') deviceBrand = 'Android';
    if (deviceModel === 'Unknown') deviceModel = 'Android Device';
  }

  // 4. Browser Detection
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

  // Composite friendly display string
  // e.g. "iPhone", "Mac", "Motorola Moto G84", "Samsung Galaxy", "Windows PC"
  let displayDevice = deviceModel !== 'Unknown' ? deviceModel : deviceBrand;
  if (deviceBrand === 'Apple' && deviceModel !== 'Unknown') {
    displayDevice = deviceModel; // "iPhone" or "Mac" or "iPad"
  } else if (deviceBrand !== 'Unknown' && deviceModel !== 'Unknown' && !deviceModel.startsWith(deviceBrand)) {
    displayDevice = `${deviceBrand} ${deviceModel}`;
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
