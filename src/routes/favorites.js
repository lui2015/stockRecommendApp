'use strict';

const express = require('express');
const db = require('../db');
const { fetchLatestQuote, toQuoteSymbol } = require('../quoteService');

const router = express.Router();

const insertStmt = db.prepare(
  'INSERT OR IGNORE INTO favorites (device_id, code, name, market, price, added_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const listStmt = db.prepare(`
  SELECT id, code, name, market, price, added_at
  FROM favorites
  WHERE device_id = ?
  ORDER BY added_at DESC
`);
const deleteStmt = db.prepare('DELETE FROM favorites WHERE device_id = ? AND code = ?');
const checkStmt = db.prepare('SELECT 1 FROM favorites WHERE device_id = ? AND code = ? LIMIT 1');

function requireDeviceId(req, res, next) {
  if (!req.deviceId) {
    return res.status(400).json({ error: '缺少合法的设备标识（X-Device-Id）' });
  }
  next();
}

// 添加自选
router.post('/favorites', requireDeviceId, (req, res) => {
  const { code, name, market, price } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: '缺少股票代码' });
  }

  const priceNum = Number(price);
  const info = insertStmt.run(
    req.deviceId,
    code.trim(),
    (name || '').trim() || '未知',
    (market || 'A股').trim(),
    (Number.isFinite(priceNum) && priceNum > 0) ? priceNum : null,
    new Date().toISOString()
  );
  // INSERT OR IGNORE：changes=0 表示已存在
  const existed = info.changes === 0;
  res.json({ success: true, existed });
});

// 获取自选列表（含实时行情）
router.get('/favorites', requireDeviceId, async (req, res) => {
  try {
    const rows = listStmt.all(req.deviceId);

    // 并发获取所有自选股的实时行情
    const itemsWithQuote = await Promise.all(
      rows.map(async (r) => {
        let realtimePrice = null;
        let changePercent = null;
        try {
          const quote = await fetchLatestQuote(r.code, r.market);
          if (quote && Number.isFinite(quote.price)) {
            realtimePrice = quote.price;
            changePercent = quote.changePercent;
          }
        } catch (e) {
          /* 行情获取失败，静默 */
        }

        return {
          id: r.id,
          code: r.code,
          name: r.name,
          market: r.market,
          refPrice: r.price,     // 推荐时的参考价
          realtimePrice,          // 当前实时价
          changePercent,          // 实时涨跌幅 %
          addedAt: r.added_at,
        };
      })
    );

    res.json({ items: itemsWithQuote });
  } catch (err) {
    console.error('[favorites] list error:', err.message);
    // 降级：返回无实时行情的列表
    const rows = listStmt.all(req.deviceId);
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        market: r.market,
        refPrice: r.price,
        realtimePrice: null,
        changePercent: null,
        addedAt: r.added_at,
      })),
    });
  }
});

// 删除自选
router.delete('/favorites/:code', requireDeviceId, (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).json({ error: '缺少股票代码' });

  deleteStmt.run(req.deviceId, code);
  res.json({ success: true });
});

// 检查是否已自选
router.get('/favorites/check/:code', requireDeviceId, (req, res) => {
  const row = checkStmt.get(req.deviceId, req.params.code);
  res.json({ isFavorite: !!row });
});

module.exports = router;
