const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../../config.env' });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'tick_system',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z'
};

const pool = mysql.createPool(dbConfig);

// --- PERF instrumentation (enable with PERF_LOG=1) ---
const PERF_LOG = process.env.PERF_LOG === '1';
const PERF_DB_SLOW_MS = Number(process.env.PERF_DB_SLOW_MS || 800);
const PERF_DB_LOG_ALL = process.env.PERF_DB_LOG_ALL === '1';

const shortSql = (sql) => {
  const s = String(sql || '').replace(/\s+/g, ' ').trim();
  return s.length > 180 ? `${s.slice(0, 180)}…` : s;
};

const wrapPoolTiming = (p) => {
  if (!PERF_LOG || p.__perfWrapped) return p;
  p.__perfWrapped = true;

  const wrap = (fnName) => {
    const orig = p[fnName]?.bind(p);
    if (typeof orig !== 'function') return;
    p[fnName] = async (sql, params) => {
      const start = process.hrtime.bigint();
      try {
        return await orig(sql, params);
      } finally {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        if (PERF_DB_LOG_ALL || ms >= PERF_DB_SLOW_MS) {
          const hasParams = params != null && (Array.isArray(params) ? params.length > 0 : true);
          console.log(`[perf][db] ${fnName} ${ms.toFixed(1)}ms ${shortSql(sql)}${hasParams ? ' [params]' : ''}`);
        }
      }
    };
  };

  wrap('query');
  wrap('execute');
  return p;
};

wrapPoolTiming(pool);

const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

module.exports = {
  pool,
  testConnection,
  dbConfig
}; 