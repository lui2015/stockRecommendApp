'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'qiuyipiao.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// draws：每一次“求票”生成的结果快照，作为唯一可信来源（history 只引用不重复存内容）
db.exec(`
  CREATE TABLE IF NOT EXISTS draws (
    request_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    constraints_json TEXT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    tags_json TEXT,
    summary_reason TEXT,
    roundtable_json TEXT,
    risks_json TEXT,
    data_as_of TEXT,
    created_at TEXT NOT NULL
  );
`);

// 兼容旧库：补充 price/price_unit/market 字段（早期版本无当前参考价格与市场字段）
const drawsColumns = db.prepare('PRAGMA table_info(draws)').all().map((c) => c.name);
if (!drawsColumns.includes('price')) {
  db.exec('ALTER TABLE draws ADD COLUMN price TEXT;');
}
if (!drawsColumns.includes('price_unit')) {
  db.exec("ALTER TABLE draws ADD COLUMN price_unit TEXT DEFAULT '元';");
}
if (!drawsColumns.includes('market')) {
  db.exec("ALTER TABLE draws ADD COLUMN market TEXT DEFAULT 'A股';");
}

// history：用户主动“保存”的记录，仅存引用关系，做归属校验
db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    saved_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES draws(request_id)
  );
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_draws_device ON draws(device_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_history_device ON history(device_id);`);

// stock_analyses：个股深度分析报告缓存（按股票代码去重，同一天内命中缓存直接返回，避免重复调用大模型）
db.exec(`
  CREATE TABLE IF NOT EXISTS stock_analyses (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    market TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// draw_analysis_cache：摇一摇时异步预生成的深度分析报告缓存（analysis 页优先读取，实现秒开）
db.exec(`
  CREATE TABLE IF NOT EXISTS draw_analysis_cache (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    market TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// favorites：用户自选股列表，按设备隔离
db.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    market TEXT DEFAULT 'A股',
    price REAL,
    added_at TEXT NOT NULL,
    UNIQUE(device_id, code)
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_favorites_device ON favorites(device_id);`);

module.exports = db;
