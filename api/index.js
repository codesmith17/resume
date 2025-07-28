const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const path = require('path');
const useragent = require('useragent');
const cors = require('cors');

const app = express();

// Enable CORS for all origins
app.use(cors());
app.use(express.json());

// Development mode detection
const isDevelopment = !process.env.GOOGLE_CREDENTIALS || process.env.NODE_ENV === 'development';

// Google Sheets authentication (only in production)
let auth = null;
if (!isDevelopment) {
  try {
    auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  } catch (err) {
    console.warn('⚠️  Google Sheets authentication failed, running in development mode');
    console.warn('Set GOOGLE_CREDENTIALS environment variable for production');
  }
}

// Replace with your actual Google Sheet ID
const SHEET_ID = process.env.SHEET_ID || 'YOUR_GOOGLE_SHEET_ID';

// Your actual resume URL (replace with your GitHub Pages or Vercel URL)
const RESUME_URL = process.env.RESUME_URL || 'https://codesmith17.github.io/resume/resume.pdf';

// Helper function to get real IP address
function getRealIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
}

// Helper function to detect if visitor is a bot
function isBot(userAgent) {
  const botPatterns = [
    /bot/i, /crawler/i, /spider/i, /crawling/i, /facebook/i, 
    /google/i, /baidu/i, /bing/i, /msn/i, /duckduckbot/i,
    /teoma/i, /slurp/i, /yandex/i, /curl/i, /wget/i
  ];
  return botPatterns.some(pattern => pattern.test(userAgent));
}

// Helper function to extract email from URL parameters or referrer
function extractEmail(req) {
  const url = require('url');
  const querystring = require('querystring');
  
  // Check URL query parameters for email
  const parsedUrl = url.parse(req.url, true);
  const query = parsedUrl.query;
  
  // Common email parameter names
  const emailParams = ['email', 'e', 'user_email', 'mail', 'contact', 'user', 'from'];
  for (const param of emailParams) {
    if (query[param] && isValidEmail(query[param])) {
      return query[param];
    }
  }
  
  // Check referrer for email patterns
  const referer = req.headers['referer'] || req.headers['referrer'];
  if (referer) {
    try {
      const refUrl = new URL(referer);
      
      // Check referrer query parameters
      const refQuery = querystring.parse(refUrl.search.slice(1));
      for (const param of emailParams) {
        if (refQuery[param] && isValidEmail(refQuery[param])) {
          return refQuery[param];
        }
      }
      
      // Extract email from referrer path or fragment
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emailMatch = referer.match(emailRegex);
      if (emailMatch && emailMatch[0]) {
        return emailMatch[0];
      }
      
      // Special handling for common platforms
      if (refUrl.hostname.includes('linkedin.com')) {
        // LinkedIn sometimes has user indicators in the path
        const pathMatch = refUrl.pathname.match(/\/in\/([^\/]+)/);
        if (pathMatch) {
          return `${pathMatch[1]}@linkedin-user.com`; // Placeholder for LinkedIn users
        }
      }
      
      if (refUrl.hostname.includes('gmail.com') || refUrl.hostname.includes('mail.google.com')) {
        return 'gmail-user@detected.com'; // Placeholder for Gmail users
      }
      
    } catch (err) {
      // Invalid URL, continue
    }
  }
  
  return null;
}

// Helper function to validate email format
function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
}

// Helper function to extract company/domain from email
function extractCompanyFromEmail(email) {
  if (!email || !isValidEmail(email)) return 'Unknown';
  
  const domain = email.split('@')[1].toLowerCase();
  
  // Common personal email providers
  const personalDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
    'icloud.com', 'aol.com', 'protonmail.com', 'tutanota.com',
    'linkedin-user.com', 'gmail-user@detected.com'
  ];
  
  if (personalDomains.includes(domain)) {
    return 'Personal Email';
  }
  
  // Remove common subdomains to get company name
  const companyName = domain
    .replace(/^(www\.|mail\.|email\.|smtp\.)/, '')
    .replace(/\.(com|org|net|edu|gov|mil|int)$/, '')
    .replace(/[.-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
    
  return companyName || domain;
}

// Main tracking endpoint
app.get('/track', async (req, res) => {
  const startTime = Date.now();
  const ip = getRealIP(req);
  const uaRaw = req.headers['user-agent'] || 'Unknown';
  const referer = req.headers['referer'] || req.headers['referrer'] || 'Direct';
  const language = req.headers['accept-language']?.split(',')[0] || 'unknown';
  const encoding = req.headers['accept-encoding'] || 'unknown';
  const timestamp = new Date().toISOString();
  const dateOnly = new Date().toISOString().split('T')[0];
  const timeOnly = new Date().toLocaleTimeString();

  // Parse user agent for device/browser info
  const agent = useragent.parse(uaRaw);
  const browser = agent.toAgent();
  const os = agent.os.toString();
  const device = agent.device.toString() || 'Desktop';
  const isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(uaRaw);
  const isBotUser = isBot(uaRaw);

  // Extract email information
  let extractedEmail = extractEmail(req);
  
  // Check if email was provided directly via headers (from /track-email endpoint)
  if (!extractedEmail && req.headers['x-provided-email']) {
    extractedEmail = req.headers['x-provided-email'];
  }
  
  const emailDomain = extractedEmail ? extractedEmail.split('@')[1] : 'Unknown';
  const companyFromEmail = extractCompanyFromEmail(extractedEmail);
  const emailSource = req.headers['x-email-source'] || (extractedEmail ? 'auto-detected' : 'none');

  let geo = {
    city: 'Unknown',
    region: 'Unknown',
    country: 'Unknown',
    countryCode: 'Unknown',
    latitude: null,
    longitude: null,
    postal: 'Unknown',
    timezone: 'Unknown',
    org: 'Unknown',
    asn: 'Unknown'
  };

  // Get geolocation data
  try {
    const geoResponse = await axios.get(`https://ipapi.co/${ip}/json/`, {
      timeout: 5000,
      headers: { 'User-Agent': 'ResumeTracker/1.0' }
    });
    
    if (geoResponse.data && !geoResponse.data.error) {
      geo = {
        city: geoResponse.data.city || 'Unknown',
        region: geoResponse.data.region || 'Unknown',
        country: geoResponse.data.country_name || 'Unknown',
        countryCode: geoResponse.data.country_code || 'Unknown',
        latitude: geoResponse.data.latitude || null,
        longitude: geoResponse.data.longitude || null,
        postal: geoResponse.data.postal || 'Unknown',
        timezone: geoResponse.data.timezone || 'Unknown',
        org: geoResponse.data.org || 'Unknown',
        asn: geoResponse.data.asn || 'Unknown'
      };
    }
  } catch (err) {
    console.error('Geolocation lookup failed:', err.message);
  }

  // Prepare row data for Google Sheets
  const row = [
    timestamp,           // A: Timestamp
    dateOnly,           // B: Date
    timeOnly,           // C: Time  
    ip,                 // D: IP Address
    extractedEmail || 'Not Detected',      // E: Email Address
    emailDomain,        // F: Email Domain
    companyFromEmail,   // G: Company (from email)
    emailSource,        // H: Email Source
    geo.city,           // I: City
    geo.region,         // J: Region/State
    geo.country,        // K: Country
    geo.countryCode,    // L: Country Code
    geo.latitude,       // M: Latitude
    geo.longitude,      // N: Longitude
    geo.postal,         // O: Postal Code
    geo.timezone,       // P: Timezone
    geo.org,            // Q: Organization/ISP
    geo.asn,            // R: ASN
    browser,            // S: Browser
    os,                 // T: Operating System
    device,             // U: Device
    isMobile ? 'Mobile' : 'Desktop', // V: Device Type
    isBotUser ? 'Bot' : 'Human',     // W: Visitor Type
    language,           // X: Language
    encoding,           // Y: Accept Encoding
    referer,            // Z: Referrer
    uaRaw,              // AA: Full User Agent
    Date.now() - startTime + 'ms' // BB: Processing Time
  ];

  // Log to Google Sheets (production) or console (development)
  if (isDevelopment) {
    // Development mode - log to console
    console.log('🧪 DEVELOPMENT MODE - Would log this data to Google Sheets:');
    console.log('📊 Data Row:', JSON.stringify(row, null, 2));
    
    const emailInfo = extractedEmail ? ` | Email: ${extractedEmail}` : '';
    console.log(`✅ DEV: Logged visitor: ${geo.city}, ${geo.country} - ${browser} on ${os}${emailInfo}`);
  } else {
    // Production mode - log to Google Sheets
    try {
      const client = await auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth: client });

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [row]
        }
      });

      const emailInfo = extractedEmail ? ` | Email: ${extractedEmail}` : '';
      console.log(`✅ PROD: Logged visitor: ${geo.city}, ${geo.country} - ${browser} on ${os}${emailInfo}`);
    } catch (err) {
      console.error('❌ Google Sheets logging failed:', err.message);
    }
  }

  // Redirect to actual resume
  res.redirect(RESUME_URL);
});

// Enhanced tracking endpoint with email parameter
app.get('/track-email', async (req, res) => {
  // This endpoint allows direct email passing via URL parameter
  // Usage: /track-email?email=recruiter@company.com&source=linkedin
  const email = req.query.email;
  const source = req.query.source || 'direct';
  
  if (email && isValidEmail(email)) {
    // Store email in temporary header for processing
    req.headers['x-provided-email'] = email;
    req.headers['x-email-source'] = source;
  }
  
  // Redirect to main tracking endpoint
  res.redirect('/track');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    mode: isDevelopment ? 'development' : 'production',
    timestamp: new Date().toISOString(),
    resumeUrl: RESUME_URL,
    googleSheetsEnabled: !isDevelopment
  });
});

// API endpoint for getting tracking stats (optional)
app.get('/stats', async (req, res) => {
  if (isDevelopment) {
    // Development mode - return mock stats
    res.json({
      mode: 'development',
      message: 'Running in development mode - no real Google Sheets data',
      totalViews: 'N/A (dev mode)',
      emailsDetected: 'N/A (dev mode)',
      emailDetectionRate: 'N/A (dev mode)',
      lastUpdate: new Date().toISOString()
    });
    return;
  }

  // Production mode - get real stats from Google Sheets
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:BB',
    });

    const rows = response.data.values || [];
    const totalViews = rows.length - 1; // Subtract header row
    
    // Count emails detected
    const emailsDetected = rows.slice(1).filter(row => 
      row[4] && row[4] !== 'Not Detected'
    ).length;
    
    res.json({
      mode: 'production',
      totalViews,
      emailsDetected,
      emailDetectionRate: totalViews > 0 ? (emailsDetected / totalViews * 100).toFixed(1) + '%' : '0%',
      lastUpdate: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Serve the HTML file for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Serve index.html explicitly
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Serve the PDF file
app.get('/resume.pdf', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'resume.pdf'));
});

// Export for Vercel
module.exports = app; 