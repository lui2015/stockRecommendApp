'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const { generateRecommendation } = require('../recommendService');
const { generateAnalysis } = require('../analysisService');
const { perMinuteLimiter, perDayLimiter } = require('../rateLimiter');
const { HunyuanError } = require('../hunyuanClient');

const router = express.Router();

const insertDrawStmt = db.prepare(`
  INSERT INTO draws (
    request_id, device_id, constraints_json, code, name, market, price, price_unit, tags_json,
    summary_reason, roundtable_json, risks_json, data_as_of, created_at
  ) VALUES (@requestId, @deviceId, @constraintsJson, @code, @name, @market, @price, @priceUnit, @tagsJson,
  @summaryReason, @roundtableJson, @risksJson, @dataAsOf, @createdAt)
`);

// 取本设备最近抽过的股票代码，传给推荐服务用于回避重复
const recentCodesStmt = db.prepare(
  'SELECT code FROM draws WHERE device_id = ? ORDER BY created_at DESC LIMIT 10'
);

// 分析报告缓存表（draw 时预生成，analysis 页直接读取）
const getAnalysisCacheStmt = db.prepare(
  "SELECT data_json FROM draw_analysis_cache WHERE code = ? ORDER BY created_at DESC LIMIT 1"
);
const upsertAnalysisCacheStmt = db.prepare(`
  INSERT INTO draw_analysis_cache (code, name, market, data_json, created_at)
  VALUES (@code, @name, @market, @dataJson, @createdAt)
  ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    market = excluded.market,
    data_json = excluded.data_json,
    created_at = excluded.created_at
`);

router.post('/draw', perMinuteLimiter, perDayLimiter, async (req, res) => {
  try {
    const deviceId = req.deviceId || 'anonymous';
    const recentRows = recentCodesStmt.all(deviceId);
    const recentCodes = recentRows.map((r) => r.code).filter(Boolean);
    const result = await generateRecommendation(req.body && req.body.constraints, recentCodes);
    const requestId = uuidv4();
    const createdAt = new Date().toISOString();

    insertDrawStmt.run({
      requestId,
      deviceId: req.deviceId || 'anonymous',
      constraintsJson: JSON.stringify(result.constraints || {}),
      code: result.code,
      name: result.name,
      market: result.market || 'A股',
      price: result.price,
      priceUnit: result.priceUnit,
      tagsJson: JSON.stringify(result.tags || []),
      summaryReason: result.summaryReason,
      roundtableJson: JSON.stringify(result.roundtable || []),
      risksJson: JSON.stringify(result.risks || []),
      dataAsOf: result.dataAsOf,
      createdAt,
    });

    // 异步预生成深度分析报告并缓存（不阻塞响应）
    (async () => {
      try {
        const cached = getAnalysisCacheStmt.get(result.code);
        if (!cached) {
          console.log(`[draw] 预生成分析报告: ${result.code} ${result.name}`);
          const analysis = await generateAnalysis(result.code, result.name, result.market || 'A股');
          upsertAnalysisCacheStmt.run({
            code: result.code,
            name: result.name,
            market: result.market || 'A股',
            dataJson: JSON.stringify(analysis),
            createdAt: new Date().toISOString(),
          });
          console.log(`[draw] 分析报告已缓存: ${result.code}`);
        }
      } catch (e) {
        console.error('[draw] 预生成分析失败(不影响主流程):', e.message);
      }
    })();

    res.json({
      requestId,
      blessing: result.blessing,
      code: result.code,
      name: result.name,
      market: result.market,
      price: result.price,
      priceUnit: result.priceUnit,
      changePercent: result.changePercent,
      priceSource: result.priceSource,
      tags: result.tags,
      summaryReason: result.summaryReason,
      reasonDetail: {
        roundtable: result.roundtable,
        risks: result.risks,
      },
      dataAsOf: result.dataAsOf,
      disclaimer: result.disclaimer,
    });
  } catch (err) {
    if (err instanceof HunyuanError) {
      return res.status(502).json({ error: '求票失败，请重新摇一摇', detail: err.message });
    }
    console.error('[draw] unexpected error:', err);
    res.status(500).json({ error: '服务异常，请稍后再试' });
  }
});

module.exports = router;
