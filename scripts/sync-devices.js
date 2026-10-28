/**
 * Downloads and compiles Google Play's official Certified Android Devices catalog
 * (https://storage.googleapis.com/play_public/supported_devices.csv)
 * into a compact, ultra-fast O(1) hash map: data/device_models.json
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const GOOGLE_CSV_URL = 'https://storage.googleapis.com/play_public/supported_devices.csv';
const OUTPUT_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'device_models.json');

async function syncDeviceModels() {
  console.log('[sync-devices] Downloading official Google Play supported devices list...');
  const start = Date.now();

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    https.get(GOOGLE_CSV_URL, res => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Google server returned status code: ${res.statusCode}`));
      }

      // Google CSV is UTF-16LE encoded with BOM
      res.setEncoding('utf16le');
      const rl = readline.createInterface({ input: res, crlfDelay: Infinity });

      let lineCount = 0;
      let modelCount = 0;
      const deviceMap = {};

      rl.on('line', line => {
        lineCount++;
        if (lineCount === 1) return; // skip header line

        const trimmed = line.trim();
        if (!trimmed.startsWith('"')) return;

        // Split "Retail Branding","Marketing Name","Device","Model"
        const parts = trimmed.slice(1, -1).split('","');
        if (parts.length >= 4) {
          const brand = parts[0].trim();
          const name = parts[1].trim();
          const model = parts[3].trim();

          if (model && (name || brand)) {
            // Keep the cleanest marketing name
            if (!deviceMap[model]) {
              modelCount++;
              deviceMap[model] = [brand, name || model];
            } else if (!deviceMap[model][1] && name) {
              deviceMap[model] = [brand, name];
            }
          }
        }
      });

      rl.on('close', () => {
        const elapsed = ((Date.now() - start) / 1000).toFixed(2);
        console.log(`[sync-devices] Processed ${lineCount.toLocaleString()} CSV lines in ${elapsed}s.`);
        console.log(`[sync-devices] Mapped ${modelCount.toLocaleString()} unique hardware models.`);

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(deviceMap));
        const fileSizeMB = (fs.statSync(OUTPUT_FILE).size / (1024 * 1024)).toFixed(2);
        console.log(`[sync-devices] Saved compiled dictionary to ${OUTPUT_FILE} (${fileSizeMB} MB).`);

        // Verification test
        const testModel = 'CPH2467';
        console.log(`[sync-devices] Verified ${testModel} ->`, deviceMap[testModel]);
        resolve({ modelCount, fileSizeMB });
      });
    }).on('error', reject);
  });
}

if (require.main === module) {
  syncDeviceModels().catch(err => {
    console.error('[sync-devices] Failed:', err);
    process.exit(1);
  });
}

module.exports = { syncDeviceModels };
