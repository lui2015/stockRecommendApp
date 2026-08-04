'use strict';

const rateLimit = require('express-rate-limit');

const PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE || 5);
const PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY || 30);

// 每分钟限流：基于 IP，防止脚本瞬时刷量
const perMinuteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '手速太快啦，请稍后再摇一次' },
});

// 每日限流：基于 IP + 设备ID 组合 key，防止长时间脚本刷量消耗大模型额度
const dailyCounters = new Map(); // key: `${dateStr}:${identity}` -> count

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function perDayLimiter(req, res, next) {
  const identity = req.deviceId || req.ip;
  const key = `${todayStr()}:${identity}`;
  const count = dailyCounters.get(key) || 0;
  if (count >= PER_DAY) {
    return res.status(429).json({ error: '今日求票次数已达上限，明天再来吧' });
  }
  dailyCounters.set(key, count + 1);
  next();
}

// 简单的定时清理，避免 Map 无限增长（每小时清一次前一天及更早的 key）
setInterval(() => {
  const today = todayStr();
  for (const key of dailyCounters.keys()) {
    if (!key.startsWith(today)) {
      dailyCounters.delete(key);
    }
  }
}, 60 * 60 * 1000);

module.exports = { perMinuteLimiter, perDayLimiter };
