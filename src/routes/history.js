'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

const getDrawStmt = db.prepare('SELECT * FROM draws WHERE request_id = ?');
const insertHistoryStmt = db.prepare(
  'INSERT INTO history (request_id, device_id, saved_at) VALUES (?, ?, ?)'
);
const listHistoryStmt = db.prepare(`
  SELECT h.id as history_id, h.saved_at, d.*
  FROM history h
  JOIN draws d ON d.request_id = h.request_id
  WHERE h.device_id = ?
  ORDER BY h.id DESC
  LIMIT ? OFFSET ?
`);
const getHistoryOwnerStmt = db.prepare('SELECT device_id FROM history WHERE id = ?');
const deleteHistoryStmt = db.prepare('DELETE FROM history WHERE id = ? AND device_id = ?');

function requireDeviceId(req, res, next) {
  if (!req.deviceId) {
    return res.status(400).json({ error: '缺少合法的设备标识（X-Device-Id）' });
  }
  next();
}

// 保存本次“求票”结果：仅允许引用服务端已生成的 draws记录，前端不能自行伪造推荐内容
router.post('/history', requireDeviceId, (req, res) => {
  const { requestId } = req.body || {};
  if (!requestId || typeof requestId !== 'string') {
    return res.status(400).json({ error: '缺少 requestId' });
  }

  const draw = getDrawStmt.get(requestId);
  if (!draw) {
    return res.status(404).json({ error: '找不到对应的求票结果，可能已过期' });
  }

  const savedAt = new Date().toISOString();
  const info = insertHistoryStmt.run(requestId, req.deviceId, savedAt);
  res.json({ success: true, historyId: info.lastInsertRowid });
});

// 获取当前设备保存的求票记录列表（分页）
router.get('/history', requireDeviceId, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const rows = listHistoryStmt.all(req.deviceId, limit, offset);
  const items = rows.map((row) => ({
    historyId: row.history_id,
    savedAt: row.saved_at,
    requestId: row.request_id,
    code: row.code,
    name: row.name,
    market: row.market || 'A股',
    price: row.price,
    priceUnit: row.price_unit || '元',
    tags: JSON.parse(row.tags_json || '[]'),
    summaryReason: row.summary_reason,
    reasonDetail: {
      roundtable: JSON.parse(row.roundtable_json || '[]'),
      risks: JSON.parse(row.risks_json || '[]'),
    },
    constraints: JSON.parse(row.constraints_json || '{}'),
    dataAsOf: row.data_as_of,
    createdAt: row.created_at,
  }));

  res.json({ items });
});

// 删除单条记录：必须校验归属（device_id 匹配），防止越权删除他人记录
router.delete('/history/:id', requireDeviceId, (req, res) => {
  const historyId = Number(req.params.id);
  if (!Number.isInteger(historyId) || historyId <= 0) {
    return res.status(400).json({ error: '非法的记录 ID' });
  }

  const owner = getHistoryOwnerStmt.get(historyId);
  if (!owner) {
    return res.status(404).json({ error: '记录不存在' });
  }
  if (owner.device_id !== req.deviceId) {
    return res.status(403).json({ error: '无权删除该记录' });
  }

  deleteHistoryStmt.run(historyId, req.deviceId);
  res.json({ success: true });
});

module.exports = router;
