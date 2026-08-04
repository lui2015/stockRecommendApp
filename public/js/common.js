'use strict';

/**
 * 匿名设备标识：用于关联“求票记录”的归属，存于localStorage，不含任何个人身份信息。
 */
const QYP = (function () {
  const DEVICE_KEY = 'qyp_device_id';

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    //兼容降级：简单伪随机 ID（非加密用途，仅作匿名归属标识）
    return 'dev-' + Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uuid().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  async function api(path, options = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId() },
      options.headers || {}
    );
    const resp = await fetch(path, Object.assign({}, options, { headers }));
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(data.error || `请求失败（${resp.status}）`);
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // 防XSS：所有来自后端/AI 的文本必须通过 textContent 或本函数转义后再插入 DOM
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  return { getDeviceId, api, escapeHtml, toast };
})();
