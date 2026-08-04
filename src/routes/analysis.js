'use strict';

const express = require('express');

const db = require('../db');
const { generateAnalysis, normalizeQuery } = require('../analysisService');
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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
      return res.json(JSON.parse(drawCached.data_json));
    }

    // 2️⃣ 兜底：stock_analyses 日缓存
    const cached = getCachedStmt.get(code);
    if (cached && cached.created_at.slice(0, 10) === todayStr()) {
      return res.json(JSON.parse(cached.data_json));
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
