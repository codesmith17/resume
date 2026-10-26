/**
 * Database client and pool for YugabyteDB / PostgreSQL.
 * Handles SSL certificates, connection pooling, and resilient queries.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function loadLocalEnv() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.resolve(__dirname, '../../.env.local');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = v.replace(/\\n/g, '\n');
    }
  }
}
loadLocalEnv();

let pool = null;

function isConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function getSslConfig() {
  const ca = process.env.DATABASE_CA_CERT;
  if (ca) {
    return {
      rejectUnauthorized: true,
      ca: ca.replace(/\\n/g, '\n'),
    };
  }
  return { rejectUnauthorized: false };
}

function getPool() {
  if (!isConfigured()) return null;
  if (!pool) {
    const url = process.env.DATABASE_URL;
    const connectionString = url.split('?')[0];

    pool = new Pool({
      connectionString,
      ssl: getSslConfig(),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    });

    pool.on('error', (err) => {
      console.error('[db] Unexpected pool error on idle client:', err.message);
    });
  }
  return pool;
}

async function query(text, params = []) {
  const activePool = getPool();
  if (!activePool) {
    console.warn('[db] DATABASE_URL not set — query ignored in mock/dev mode');
    return { rows: [], rowCount: 0 };
  }
  return await activePool.query(text, params);
}

module.exports = {
  isConfigured,
  getPool,
  query,
};
