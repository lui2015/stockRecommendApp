'use strict';

const express = require('express');

const db = require('../db');
const { generateAnalysis, generateDividendData, normalizeQuery } = require('../analysisService');
const { perMinuteLimiter } = require('../rateLimiter');
const { HunyuanError } = require('../hunyuanClient');

const router = express.Router();

// 优先从 draw 时预生成的缓存读取（秒开）
const getDrawCacheStmt = db.prepare(
  "SELECT data_json FROM draw_analysis_cache WHERE code = ? ORDER BY created_at DESC LIMIT 1"
);
// 原有的 stock_analyses 表缓存（兜底）
const getCachedStmt = db.prepare('SELECT * FROM stock_analyses WHERE code = ?');
const upsertStmt = db.prepare(`
  INSERT INTO stock_analyses (code, name, market, data_json, created_at)
  VALUES (@code, @name, @market, @dataJson, @createdAt)
  ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    market = excluded.market,
    data_json = excluded.data_json,
    created_at = excluded.created_at
`);
// 回写 draw 缓存里补全后的分红数据，避免每次访问都重复调用大模型
const updateDrawCacheStmt = db.prepare(
  'UPDATE draw_analysis_cache SET data_json = ? WHERE code = ?'
);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function lacksDividend(data) {
  if (!data) return false;
  if (!Array.isArray(data.dividendTable) || data.dividendTable.length === 0) return true;
  // 全 0 也视为缺失（旧兜底数据）
  return data.dividendTable.every((r) => {
    const v = parseFloat(String(r && r.dividendPerShare != null ? r.dividendPerShare : '0'));
    return !Number.isFinite(v) || v === 0;
  });
}

const FALLBACK_DIVIDEND_SUMMARY = '暂无法获取该股近五年分红数据，建议查阅公司公告核实。';

/**
 * 兼容旧缓存：分红字段缺失时按需调用大模型补全，成功则回写缓存。
 * 补全失败不影响主流程，用占位数据保证前端可渲染。
 */
async function withDividend(data, { code, name, market }, writeBack) {
  if (!data || !lacksDividend(data)) return data;

  const filled = await generateDividendData(code, data.name || name, data.market || market);
  if (filled) {
    data.dividendTable = filled.dividendTable;
    data.dividendSummary = filled.dividendSummary || data.dividendSummary || '';
    if (typeof writeBack === 'function') {
      try {
        writeBack(data);
      } catch (e) {
        console.warn('[analysis] 分红数据回写缓存失败:', e.message);
      }
    }
    return data;
  }

  // 补全失败：给占位数据，前端不至于空表
  if (!Array.isArray(data.dividendTable) || data.dividendTable.length === 0) {
    const baseYear = 2021;
    data.dividendTable = Array.from({ length: 5 }, (_, i) => ({
      year: String(baseYear + i),
      dividendPerShare: '--',
      dividendYield: '--',
      payoutRatio: '--',
      specialDividend: '--',
    }));
  }
  data.dividendSummary = data.dividendSummary || FALLBACK_DIVIDEND_SUMMARY;
  return data;
}

// 个股深度分析详情：优先读 draw 预生成缓存 → 再查 stock_analyses 日缓存 → 最后调大模型
router.get('/analysis', perMinuteLimiter, async (req, res) => {
  try {
    const { code, name, market } = normalizeQuery(req.query.code, req.query.name, req.query.market);
    if (!code || !name) {
      return res.status(400).json({ error: '缺少合法的股票代码或名称' });
    }

    // 1️⃣ 优先：draw 时预生成的缓存（摇一摇时已生成好，秒开）
    const drawCached = getDrawCacheStmt.get(code);
    if (drawCached && drawCached.data_json) {
      console.log(`[analysis] 命中 draw 预生成缓存: ${code}`);
      const data = await withDividend(JSON.parse(drawCached.data_json), { code, name, market }, (d) => {
        updateDrawCacheStmt.run(JSON.stringify(d), code);
      });
      return res.json(data);
    }

    // 2️⃣ 兜底：stock_analyses 日缓存
    const cached = getCachedStmt.get(code);
    if (cached && cached.created_at.slice(0, 10) === todayStr()) {
      const data = await withDividend(JSON.parse(cached.data_json), { code, name, market }, (d) => {
        upsertStmt.run({
          code: cached.code,
          name: cached.name,
          market: cached.market,
          dataJson: JSON.stringify(d),
          createdAt: cached.created_at,
        });
      });
      return res.json(data);
    }

    // 3️⃣ 最终：调大模型生成
    const result = await generateAnalysis(code, name, market);
    upsertStmt.run({
      code: result.code,
      name: result.name,
      market: result.market,
      dataJson: JSON.stringify(result),
      createdAt: new Date().toISOString(),
    });
    res.json(result);
  } catch (err) {
    if (err instanceof HunyuanError) {
      return res.status(502).json({ error: '分析生成失败，请稍后重试', detail: err.message });
    }
    console.error('[analysis] unexpected error:', err);
    res.status(500).json({ error: '服务异常，请稍后再试' });
  }
});

module.exports = router;
