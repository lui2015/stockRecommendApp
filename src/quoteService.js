'use strict';

/**
 * 实时行情获取服务。
 *
 * 使用腾讯公开行情接口（https://qt.gtimg.cn），无需 API Key，支持 A股/港股/美股。
 * 仅提取纯 ASCII 的数值字段（最新价、涨跌幅），因此无需 GBK 解码即可正确解析。
 *
 * 设计取舍：行情接口不可用时（网络抖动/休市/代码无效）静默回退，由调用方决定
 * 使用模型估值价兜底，保证“摇一摇”始终能出结果，不因行情查询失败而报错。
 */

const QUOTE_BASE = 'https://qt.gtimg.cn/q=';
const FETCH_TIMEOUT_MS = 5000;

/**
 * 将模型返回的股票代码 + 市场，映射为腾讯行情接口的符号。
 * A股 600519 -> sh600519；深市 000858 -> sz000858；
 * 港股 00700.HK -> hk00700；美股 AAPL -> usAAPL。
 */
function toQuoteSymbol(code, market) {
  const raw = String(code || '').trim();
  if (market === '港股' || /HK$/i.test(raw)) {
    const c = raw.replace(/\.HK$/i, '').replace(/\D/g, '').padStart(5, '0');
    return 'hk' + c;
  }
  if (market === '美股') {
    const c = raw.replace(/\.[A-Z]{2}$/, '').toUpperCase();
    return 'us' + c;
  }
  // 默认按 A股 处理：沪市主板/科创板以 60/68/9 开头，其余归深市
  const c = raw.replace(/\D/g, '');
  if (/^(60|68|9)/.test(c)) return 'sh' + c;
  return 'sz' + c;
}

async function fetchRaw(symbol) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(QUOTE_BASE + encodeURIComponent(symbol), { signal: controller.signal });
    const buf = Buffer.from(await resp.arrayBuffer());
    // 数值字段为 ASCII，用 latin1 解析即可正确切分，无需 GBK 解码
    return buf.toString('latin1');
  } finally {
    clearTimeout(timer);
  }
}

function parseQuote(text) {
  const m = text.match(/="([^"]*)"/);
  if (!m) return null;
  const fields = m[1].split('~');
  if (fields.length < 33) return null;
  const price = parseFloat(fields[3]);
  const changePercent = parseFloat(fields[32]);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    price,
    changePercent: Number.isFinite(changePercent) ? changePercent : null,
  };
}

/**
 * 获取指定代码的最新行情。
 * @param {string} code 模型返回的股票代码
 * @param {string} market 'A股'|'港股'|'美股'
 * @returns {Promise<{price:number, changePercent:?number}|null>} 获取失败返回 null
 */
async function fetchLatestQuote(code, market) {
  const symbol = toQuoteSymbol(code, market);
  const text = await fetchRaw(symbol);
  return parseQuote(text);
}

module.exports = { fetchLatestQuote, toQuoteSymbol };
