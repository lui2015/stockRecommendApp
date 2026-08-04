'use strict';

const DEVICE_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * 读取前端自带的匿名设备标识（localStorage 生成的 UUID），用作“求票记录”的归属键。
 * 未携带或格式不合法时，仅生成一个仅本次请求内使用的临时 ID（不落库归属，避免污染数据）。
 */
function deviceIdMiddleware(req, res, next) {
  const header = req.get('X-Device-Id');
  if (header && DEVICE_ID_RE.test(header)) {
    req.deviceId = header;
  } else {
    req.deviceId = null;
  }
  next();
}

module.exports = { deviceIdMiddleware, DEVICE_ID_RE };
