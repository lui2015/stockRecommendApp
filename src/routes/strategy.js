'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const { listStrategies, getStrategy } = require('../strategyLibrary');
const { generateByStrategy } = require('../strategyService');
const { perMinuteLimiter, perDayLimiter } = require('../rateLimiter');
const { HunyuanError } = require('../hunyuanClient');

const router = express.Router();

// 复用 draws 表落库，使策略推荐结果同样可"保存到记录"、可跳转深度分析
const insertDrawStmt = db.prepare(`
  INSERT INTO draws (
    request_id, device_id, constraints_json, code, name, market, price, price_unit, tags_json,
    summary_reason, roundtable_json, risks_json, data_as_of, created_at
  ) VALUES (@requestId, @deviceId, @constraintsJson, @code, @name, @market, @price, @priceUnit, @tagsJson,
  @summaryReason, @roundtableJson, @risksJson, @dataAsOf, @createdAt)
`);

const recentCodesStmt = db.prepare(
  'SELECT code FROM draws WHERE device_id = ? ORDER BY created_at DESC LIMIT 10'
);

// 策略库列表：纯静态内容，无需限流
router.get('/strategies', (req, res) => {
  res.json(listStrategies());
});

// 单个策略详情
router.get('/strategies/:id', (req, res) => {
  const strategy = getStrategy(req.params.id);
  if (!strategy) return res.status(404).json({ error: '策略不存在' });
  res.json(strategy);
});

// 按策略选股：调用大模型，需限流（与摇一摇共享额度口径）
router.post('/strategy-recommend', perMinuteLimiter, perDayLimiter, async (req, res) => {
  try {
    const { strategyId, options } = req.body || {};
    if (!strategyId || typeof strategyId !== 'string') {
      return res.status(400).json({ error: '缺少 strategyId' });
    }
    if (!getStrategy(strategyId)) {
      return res.status(400).json({ error: '未知的选股策略' });
    }

    const deviceId = req.deviceId || 'anonymous';
    const recentCodes = recentCodesStmt.all(deviceId).map((r) => r.code).filter(Boolean);

    const result = await generateByStrategy(strategyId, options, recentCodes);

    const requestId = uuidv4();
    const createdAt = new Date().toISOString();

    // fitPoints / actionPlan 复用 roundtable 字段存档（结构兼容，便于历史记录回看）
    insertDrawStmt.run({
      requestId,
      deviceId,
      constraintsJson: JSON.stringify({
        strategyId: result.strategyId,
        strategyName: result.strategyName,
        ...result.options,
      }),
      code: result.code,
      name: result.name,
      market: result.market,
      price: result.price,
      priceUnit: result.priceUnit,
      tagsJson: JSON.stringify(result.tags || []),
      summaryReason: result.summaryReason,
      roundtableJson: JSON.stringify(
        (result.fitPoints || []).map((p) => ({
          master: `${p.indicator}（${p.match}）`,
          viewpoint: p.actual,
        }))
      ),
      risksJson: JSON.stringify(result.risks || []),
      dataAsOf: result.dataAsOf,
      createdAt,
    });

    res.json({ requestId, ...result });
  } catch (err) {
    if (err && err.code === 'INVALID_STRATEGY') {
      return res.status(400).json({ error: '未知的选股策略' });
    }
    if (err instanceof HunyuanError) {
      return res.status(502).json({ error: '策略选股失败，请稍后重试', detail: err.message });
    }
    console.error('[strategy] unexpected error:', err);
    res.status(500).json({ error: '服务异常，请稍后再试' });
  }
});

module.exports = router;
