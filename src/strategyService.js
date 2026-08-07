'use strict';

/**
 * 基于「选股策略」的推荐服务。
 *
 * 与 recommendService（随机摇号）的区别：
 * - 这里由用户主动选定一个经典策略（如高股息、突破新高、多因子等），并可补充市场/板块/
 *   市值/持有周期/风险偏好等条件；
 * - 后端把该策略的核心逻辑与关键指标固化进 System Prompt，要求大模型「严格按该策略的
 *   标准」筛选标的，并逐条说明匹配情况，让推荐结果可解释、可复盘。
 *
 * 局限（同recommendService）：未接入真实行情/财务数据源，模型给出的数据基于训练知识，
 * 仅供娱乐与方法论学习参考，不构成投资建议。股价会尽量用实时行情接口覆盖。
 */

const { chatCompletion, HunyuanError } = require('./hunyuanClient');
const { fetchLatestQuote } = require('./quoteService');
const { getStrategy } = require('./strategyLibrary');

const ALLOWED_MARKETS = ['A股', '港股', '美股'];
const ALLOWED_CAPS = ['不限', '大盘股', '中盘股', '小盘股'];
const ALLOWED_HORIZONS = ['不限', '短线（数周）', '中线（数月）', '长线（1年以上）'];
const ALLOWED_RISKS = ['不限', '保守', '平衡', '进取'];

const MAX_FREE_TEXT_LEN = 60;
const MAX_SUMMARY_LEN = 260;
const MARKET_CURRENCY = { A股: '元', 港股: '港元', 美股: '美元' };

function sanitizeFreeText(text, maxLen = MAX_FREE_TEXT_LEN) {
  if (typeof text !== 'string') return '';
  // 去掉换行与引号等可能干扰 prompt 结构的字符，防 prompt injection
  return text.replace(/[\r\n"'`{}<>]/g, '').trim().slice(0, maxLen);
}

function pickEnum(value, allowed) {
  return allowed.includes(value) ? value : undefined;
}

/**
 * 校验并规整用户补充条件。
 */
function normalizeOptions(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    market: pickEnum(o.market, ALLOWED_MARKETS),
    cap: pickEnum(o.cap, ALLOWED_CAPS.filter((c) => c !== '不限')),
    horizon: pickEnum(o.horizon, ALLOWED_HORIZONS.filter((c) => c !== '不限')),
    risk: pickEnum(o.risk, ALLOWED_RISKS.filter((c) => c !== '不限')),
    sector: sanitizeFreeText(o.sector, 20) || undefined,
    extra: sanitizeFreeText(o.extra, MAX_FREE_TEXT_LEN) || undefined,
  };
}

function buildSystemPrompt(strategy) {
  return `你是"求一票"App的策略选股引擎。用户已经明确选择了一种经典选股策略，你必须【严格按照该策略的方法论】挑选恰好一只标的，并逐条说明它如何满足该策略的关键指标。

===== 本次使用的策略 =====
策略名称：${strategy.name}
所属流派：${strategy.category}
一句话概括：${strategy.tagline}
核心逻辑：${strategy.core}
关键指标（必须逐条对照）：
${strategy.indicators.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}
典型执行步骤：
${strategy.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}
适用场景：${strategy.suitable}
已知风险与失效场景：${strategy.risk}
代表人物：${strategy.masters.join('、')}
建议持有周期：${strategy.horizon}
==========================

硬性规则：
- 只输出一只股票，不给并列候选。
- 选出的标的必须真实存在，代码与名称要对应正确。
- fitPoints 必须逐条对应上面列出的「关键指标」，逐项说明该股票的实际情况以及是否满足（满足/部分满足/不满足都要如实写），条数与关键指标条数一致。
- 必须包含至少 2 条针对该股票的具体风险提示，且需体现该策略本身的失效场景，不能只说好话。
- 不得使用"必涨""稳赚""目标价必达""内幕""跟庄"等承诺性/诱导性用语。
-涉及具体财务/行情数字时使用"据公开资料""约"等谨慎表述，不得声称是实时精确数据。
- 严格只输出 JSON，不要输出任何 JSON 之外的文字、不要使用代码块围栏。

JSON 输出格式（字段必须齐全）：
{
  "code": "股票代码（如 600519 或 00700.HK 或 AAPL）",
  "name": "股票名称",
  "market": "A股/港股/美股 之一",
  "price": "当前参考股价数值（如 1680.00），不含货币单位，基于训练知识合理估算",
  "tags": ["1~3个核心标签，如 高股息、低估值、AI概念"],
  "strategyFitScore": 该股票与本策略的匹配度评分，整数 60~95,
  "summaryReason": "推荐理由，120~200字，说明为什么这只股票是该策略下的典型标的，需覆盖基本面、消息面/催化剂、技术面三个角度",
  "fitPoints": [
    {"indicator": "对应的关键指标原文", "actual": "该股票的实际情况（据公开资料的估算）", "match": "满足/部分满足/不满足"}
  ],
  "actionPlan": ["按该策略的执行步骤，给出针对这只股票的3~4条可操作建议，如买点观察条件、止损/止盈参考、需要持续跟踪的数据"],
  "risks": ["风险提示1", "风险提示2"]
}`;
}

function buildUserPrompt(strategy, options) {
  const parts = [`请按「${strategy.name}」策略，为我筛选一只股票。`];
  if (options.market) parts.push(`市场限定：${options.market}。`);
  if (options.sector) parts.push(`板块偏好：${options.sector}。`);
  if (options.cap) parts.push(`市值偏好：${options.cap}。`);
  if (options.horizon) parts.push(`计划持有周期：${options.horizon}。`);
  if (options.risk) parts.push(`风险偏好：${options.risk}。`);
  if (options.extra) parts.push(`补充要求：${options.extra}。`);
  parts.push('请严格按约定的 JSON 格式输出，fitPoints 要逐条对照该策略的关键指标。');
  return parts.join('');
}

function extractJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  try {
    return JSON.parse(text.slice(first, last + 1));
  } catch (err) {
    return null;
  }
}

function validateResult(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.code !== 'string' || !obj.code.trim()) return false;
  if (typeof obj.name !== 'string' || !obj.name.trim()) return false;
  if (!(typeof obj.price === 'string' || typeof obj.price === 'number')) return false;
  if (!Number.isFinite(Number(obj.price)) || Number(obj.price) <= 0) return false;
  if (typeof obj.summaryReason !== 'string' || !obj.summaryReason.trim()) return false;
  if (!Array.isArray(obj.fitPoints) || obj.fitPoints.length < 2) return false;
  if (!obj.fitPoints.every((p) => p && typeof p.indicator === 'string' && typeof p.actual === 'string')) return false;
  if (!Array.isArray(obj.risks) || obj.risks.length < 2) return false;
  return true;
}

/**
 * 按指定策略生成一只推荐标的。
 * @param {string} strategyId 策略 ID（必须存在于 strategyLibrary）
 * @param {object} rawOptions 用户补充条件
 * @param {string[]} recentCodes 最近已推荐过的代码（用于回避重复）
 */
async function generateByStrategy(strategyId, rawOptions, recentCodes = []) {
  const strategy = getStrategy(strategyId);
  if (!strategy) {
    const err = new Error('未知的选股策略');
    err.code = 'INVALID_STRATEGY';
    throw err;
  }

  const options = normalizeOptions(rawOptions);
  const messages = [
    { role: 'system', content: buildSystemPrompt(strategy) },
    { role: 'user', content: buildUserPrompt(strategy, options) },
  ];

  if (Array.isArray(recentCodes) && recentCodes.length) {
    messages.push({
      role: 'user',
      content: `为避免重复，请不要选择以下最近已经推荐过的代码：${recentCodes.slice(0, 10).join('、')}。`,
    });
  }

  let parsed = null;
  let lastRaw = '';
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      messages.push({
        role: 'user',
        content: '你上一次的输出不是合法 JSON 或字段不完整（尤其是 fitPoints / risks）。请重新只输出符合要求的 JSON，不要有多余文字。',
      });
    }
    const content = await chatCompletion(messages, { temperature: 0.7 });
    lastRaw = content;
    const candidate = extractJson(content);
    if (candidate && validateResult(candidate)) {
      parsed = candidate;
      break;
    }
  }

  if (!parsed) {
    throw new HunyuanError(`模型未能返回合法的策略选股结果：${lastRaw.slice(0, 200)}`);
  }

  const market = ALLOWED_MARKETS.includes(parsed.market) ? parsed.market : (options.market || 'A股');

  // 尝试用真实行情覆盖模型估算股价
  let priceNum = Number(parsed.price);
  let changePercent = null;
  let priceSource = 'model';
  try {
    const quote = await fetchLatestQuote(parsed.code.trim(), market);
    if (quote && Number.isFinite(quote.price) && quote.price > 0) {
      priceNum = quote.price;
      changePercent = quote.changePercent;
      priceSource = 'realtime';
    }
  } catch (e) {
    /* 行情失败静默回退模型估值 */
  }

  const fitScore = Number(parsed.strategyFitScore);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    strategyIcon: strategy.icon,
    code: parsed.code.trim(),
    name: parsed.name.trim(),
    market,
    price: priceNum.toFixed(2),
    priceUnit: MARKET_CURRENCY[market] || '元',
    changePercent: changePercent != null ? Number(changePercent).toFixed(2) : null,
    priceSource,
    strategyFitScore: Number.isFinite(fitScore) ? Math.min(Math.max(Math.round(fitScore), 50), 99) : 80,
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === 'string').slice(0, 3) : [],
    summaryReason: parsed.summaryReason.trim().slice(0, MAX_SUMMARY_LEN),
    fitPoints: parsed.fitPoints.slice(0, 8).map((p) => ({
      indicator: String(p.indicator).slice(0, 120),
      actual: String(p.actual).slice(0, 200),
      match: ['满足', '部分满足', '不满足'].includes(p.match) ? p.match : '部分满足',
    })),
    actionPlan: Array.isArray(parsed.actionPlan)
      ? parsed.actionPlan.filter((s) => typeof s === 'string').slice(0, 5).map((s) => s.slice(0, 200))
      : [],
    risks: parsed.risks.filter((r) => typeof r === 'string').slice(0, 5).map((r) => r.slice(0, 200)),
    options,
    dataAsOf: new Date().toISOString().slice(0, 10),
    disclaimer:
      priceSource === 'realtime'
        ? '股价为实时行情接口数据；策略分析内容由AI大模型基于训练知识生成，仅供方法论学习与娱乐参考，不构成投资建议。'
        : '股价与分析内容均由AI大模型基于训练知识估算，可能非实时/准确，仅供方法论学习与娱乐参考，不构成投资建议。',
  };
}

module.exports = { generateByStrategy, normalizeOptions };
