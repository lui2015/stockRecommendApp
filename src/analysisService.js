'use strict';

/**
 * 个股深度分析编排服务。
 *
 * 说明（重要，供后续维护者理解设计取舍）：
 * 参考并落地了 stock-analysis Skill（https://github.com/lui2015/STOCK_ANALYSIS_SKILL）
 * 公开的“产业趋势派/ 估值派 / 基本面派 / 信号派”四派圆桌分析框架与可视化报告结构。
 *
 * 该 Skill 原始设计依赖 westock-data 等 Agent 内置工具查询真实行情/财务/资金面数据——这些工具
 * 没有对外开放的 HTTP API，普通 Node 后端服务无法直接调用（与 recommendService.js 面临的局限一致）。
 *
 * 因此本服务的落地方案是：把 Skill 的四派分析框架、报告结构（实时快照/近五年股价中位数/近五年
 * 净利润变化/宏观快扫/四派圆桌/总结路线图）固化为系统提示词，由后端调用腾讯混元大模型完成数据
 * 估算与文本组织，并强制模型以结构化 JSON 返回，服务端做校验与兜底。
 *
 * 重要局限（已体现在页面免责声明中）：本方案没有接入真实行情/财务数据源，所有数字均为模型基于
 * 训练知识的合理估算，可能非最新/准确数据，仅供娱乐参考，不构成投资建议。若后续部署环境具备调用
 * westock-data 的能力，应替换为真实数据查询 + 大模型仅做文本组织的方案，以符合 Skill 原始设计
 * （“数字说话，禁止用模型记忆补数据”）。
 */

const { chatCompletion, HunyuanError } = require('./hunyuanClient');
const { fetchLatestQuote } = require('./quoteService');

const ALLOWED_MARKETS = ['A股', '港股', '美股'];
const MARKET_CURRENCY = { A股: '元', 港股: '港元', 美股: '美元' };
const ATTITUDE_LEVELS = ['bullish', 'neutral-bull', 'neutral', 'watch', 'bearish'];
const MAX_NAME_LEN = 20;
const MAX_CODE_LEN = 12;

const SYSTEM_PROMPT = `你是“求一票”App的个股深度分析引擎，落地了 stock-analysis Skill 的“四派圆桌讨论”框架，
为用户指定的一只股票生成一份结构化的深度分析报告数据。

四派分析框架（必须逐一体现，只用流派名称，不得使用任何专家个人姓名）：
1. 产业趋势派：拆产业链找当前驱动力（资源涨价/扩产升级/路线未定/看不准）与最受益环节，结合估值硬约束（PE+动态PE）判断产业持续性。
2. 估值派：宏观层（当前宏观状态→权益仓位建议）、中观层（行业景气度+选估值工具PEG或PE Bands+理由）、微观层（具体PE/PEG/分位/价格带数字）、资金面校验（大股东减持/外资/监管）。
3. 基本面派：行业趋势体感→数据验证、管理层历史周期判断、财报检查（营收/净利润/毛利率/负债率）、估值分位、建仓/跟踪建议。
4. 信号派：四层信号对齐——政策/产业/资讯/资金各给 ✅通过/ ⚠️中性 / ❌不通过 三档之一，说明当前落入哪种组合与建议动作。

硬性规则：
- 不得使用专家个人姓名（如巴菲特等），只用“产业趋势派/估值派/基本面派/信号派”这四个流派名称。
- 至少给出 1 条明确的核心风险提示（keyRisk），不能只说好话；不得使用“必涨”“稳赚”“内幕”“跟庄”等承诺性/诱导性用语。
- 增速>20%时估值派用 PEG，增速<15%时改用 PE Bands（价格带），并在framework 中说明选择理由。
- 涨跌颜色遵循中国市场惯例：changePercent/PE 等指标里，若某数值上涨用正号，若下跌用负号，供前端据符号自行配色（涨红跌绿），不要在文本里自行描述颜色。
- 净利润为负的年份，netProfit 字符串前加负号；同比增速 yoy 为负时同样加负号。
- 所有具体数字（市值/PE/股价/净利润等）均基于你的训练知识给出合理估算，不要声称是实时数据；snapshot 与图表数字要内部自洽（如中位数应落在当年最高最低之间）。
- **时间基准：当前是2026年**。medianTable 和 profitTable 必须覆盖最近5年，年份应为 2021、2022、2023、2024、2025（或最后一条用 2026(至今) 表示当年进行中）。绝对不要使用 2019、2020 等过早年份。
- 严格只输出 JSON，不要输出任何 JSON 之外的文字、不要使用代码块围栏、不要在字符串里嵌套 HTML 标签。

JSON 输出格式（字段必须齐全，attitudeLevel 只能是 bullish/neutral-bull/neutral/watch/bearish 之一）：
{
  "code": "股票代码",
  "name": "股票名称",
  "market": "A股/港股/美股 之一",
  "industry": "所属行业，如 消费电子",
  "listDate": "上市日期，如 2020-08-24（不确定可给大致年份+估）",
  "chairman": "董事长/实控人姓名（不确定可留空字符串）",
  "price": "当前参考股价数值，如 129.68",
  "changePercent": "当日涨跌幅数值（可带正负号），如 -4.93",
  "snapshot": {
    "marketCap": "市值，如 695亿",
    "peTtm": "PE(TTM)，如 27.6",
    "turnover": "成交额，如 7.29亿",
    "turnoverRate": "换手率，如 1.82%",
    "week52High": "52周最高价数值",
    "week52Low": "52周最低价数值"
  },
  "medianTable": [
    {"year": "年份，如 2021 或 2026(至今)", "median": 数值, "high": 数值, "low": 数值, "tradingDays": 数值}
    // 恰好5条，按年份从早到晚排列，覆盖最近5年，当前是2026年，应为2021/2022/2023/2024/2025或含2026(至今)
  ],
  "fiveYearMedian": 数值,
  "medianNote": "一句话说明当前价相对5年中位数、去年中位数的偏离幅度",
  "profitTable": [
    {"year": "年份，如 2021", "netProfit": "归母净利润，如 25.45亿或-3.2亿", "yoy": "同比增速，如 +12.3%或-8.1%", "revenue": "营业收入，如 305亿", "revenueYoy": "营收同比，如 +18%", "grossMargin": "毛利率，如 38.5%", "netMargin": "净利率，如 8.3%", "roe": "加权ROE，如 15.2%"}
    // 恰好5条，按年份从早到晚排列，覆盖最近5年完整财年，当前是2026年，应为2021/2022/2023/2024/2025
  ],
  "dividendTable": [
    {"year": "年份，如 2021", "dividendPerShare": "每股分红（元），如 0.35或0", "dividendYield": "股息率（%），如 3.2%或0%", "payoutRatio": "分红率/派息比例（%），如 35%或0", "specialDividend": "是否有特别分红，如 '无' 或 '10送3' 等"}
    // 恰好5条，按年份从早到晚排列，覆盖最近5年完整财年，当前是2026年，应为2021/2022/2023/2024/2025
  ],
  "dividendSummary": "一句话总结该股近五年分红特点（如：连续5年稳定分红、高股息蓝筹、从不分红等）",
  "macro": {
    "indices": [ {"name": "上证/沪深300/恒指等，按market选相关指数", "value": "点位数值", "changePercent": "涨跌幅数值，可带正负号"} ],
    "points": ["宏观/行业要闻1", "宏观/行业要闻2", "宏观/行业要闻3", "无重大系统性风险信号，整体环境XX（如中性偏暖/中性偏冷）"]
  },
  "roundtable": {
    "trend": {"framework": "分析框架说明", "keyNumbers": "关键数字一句话", "points": ["要点1","要点2","要点3"], "attitude": "一句话结论（如：产业方向对，但短期负面消化未完）", "attitudeLevel": "bullish/neutral-bull/neutral/watch/bearish"},
    "valuation": {"framework": "...", "keyNumbers": "...", "points": ["...", "..."], "attitude": "...", "attitudeLevel": "..."},
    "fundamental": {"framework": "...", "keyNumbers": "...", "points": ["...", "..."], "attitude": "...", "attitudeLevel": "..."},
    "signal": {"framework": "...", "keyNumbers": "...", "signals": {"policy": "✅/⚠️/❌ 一句话", "industry": "✅/⚠️/❌ 一句话", "news": "✅/⚠️/❌ 一句话", "fund": "✅/⚠️/❌ 一句话"}, "points": ["...", "..."], "attitude": "...", "attitudeLevel": "..."}
  },
  "summary": {
    "oneLineForBeginners": "给小白的一句话总结",
    "route": [
      {"title": "如果你更看重XX", "content": "具体建议"},
      {"title": "如果你更担心XX", "content": "具体建议"},
      {"title": "拿不准", "content": "给一个可验证的观察指标"}
    ],
    "keyPrediction": "最值得验证的预测，含时间窗口",
    "keyRisk": "最值得重视的风险"
  }
}`;

function sanitizeFreeText(text, maxLen) {
  if (typeof text !== 'string') return '';
  return text.replace(/[\r\n"'`{}<>]/g, '').trim().slice(0, maxLen);
}

function normalizeQuery(rawCode, rawName, rawMarket) {
  const code = sanitizeFreeText(rawCode, MAX_CODE_LEN).toUpperCase();
  const name = sanitizeFreeText(rawName, MAX_NAME_LEN);
  const market = ALLOWED_MARKETS.includes(rawMarket) ? rawMarket : 'A股';
  return { code, name, market };
}

function buildUserPrompt({ code, name, market }) {
  return `请对「${name}」（代码：${code}，市场：${market}）做一次结构化深度分析，严格按约定的 JSON 格式输出，货币单位按${market} 对应的 ${MARKET_CURRENCY[market]} 计（数字部分不要带货币符号）。`;
}

function extractJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null;
  }
  text = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateExpert(expert, requireSignals) {
  if (!expert || typeof expert !== 'object') return false;
  if (!isNonEmptyString(expert.framework)) return false;
  if (!isNonEmptyString(expert.keyNumbers)) return false;
  if (!Array.isArray(expert.points) || expert.points.length < 2) return false;
  if (!expert.points.every((p) => isNonEmptyString(p))) return false;
  if (!isNonEmptyString(expert.attitude)) return false;
  if (!ATTITUDE_LEVELS.includes(expert.attitudeLevel)) return false;
  if (requireSignals) {
    const s = expert.signals;
    if (!s || typeof s !== 'object') return false;
    if (!['policy', 'industry', 'news', 'fund'].every((k) => isNonEmptyString(s[k]))) return false;
  }
  return true;
}

function validateResult(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (!isNonEmptyString(obj.code) || !isNonEmptyString(obj.name)) return false;
  if (!(typeof obj.price === 'string' || typeof obj.price === 'number')) return false;
  if (!obj.snapshot || typeof obj.snapshot !== 'object') return false;

  if (!Array.isArray(obj.medianTable) || obj.medianTable.length < 4) return false;
  if (!obj.medianTable.every((r) => r && Number.isFinite(Number(r.median)) && Number.isFinite(Number(r.high)) && Number.isFinite(Number(r.low)))) return false;
  if (!Number.isFinite(Number(obj.fiveYearMedian))) return false;
  if (!isNonEmptyString(obj.medianNote)) return false;

  if (!Array.isArray(obj.profitTable) || obj.profitTable.length < 4) return false;
  if (!obj.profitTable.every((r) => r && isNonEmptyString(r.year) && isNonEmptyString(r.netProfit))) return false;

  // dividendTable 可选（兼容旧缓存），有则校验格式
  if (obj.dividendTable != null) {
    if (!Array.isArray(obj.dividendTable)) return false;
    if (obj.dividendTable.length > 0 && !obj.dividendTable.every((r) => r && isNonEmptyString(r.year))) return false;
  }

  if (!obj.macro || typeof obj.macro !== 'object' || !Array.isArray(obj.macro.points) || obj.macro.points.length < 2) return false;

  const rt = obj.roundtable;
  if (!rt || typeof rt !== 'object') return false;
  if (!validateExpert(rt.trend, false)) return false;
  if (!validateExpert(rt.valuation, false)) return false;
  if (!validateExpert(rt.fundamental, false)) return false;
  if (!validateExpert(rt.signal, true)) return false;

  const summary = obj.summary;
  if (!summary || typeof summary !== 'object') return false;
  if (!isNonEmptyString(summary.oneLineForBeginners)) return false;
  if (!Array.isArray(summary.route) || summary.route.length < 2) return false;
  if (!summary.route.every((r) => r && isNonEmptyString(r.title) && isNonEmptyString(r.content))) return false;
  if (!isNonEmptyString(summary.keyPrediction)) return false;
  if (!isNonEmptyString(summary.keyRisk)) return false;

  return true;
}

/**
 * 生成一份个股深度分析报告数据（未落库）。
 * @param {string} rawCode
 * @param {string} rawName
 * @param {string} rawMarket
 * @returns {Promise<object>}
 */
async function generateAnalysis(rawCode, rawName, rawMarket) {
  const query = normalizeQuery(rawCode, rawName, rawMarket);
  if (!query.code || !query.name) {
    throw new HunyuanError('缺少合法的股票代码或名称');
  }
  const userPrompt = buildUserPrompt(query);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let parsed = null;
  let lastRawContent = '';

  for (let attempt = 0; attempt < 2 && !parsed; attempt += 1) {
    if (attempt === 1) {
      messages.push({
        role: 'user',
        content: '你上一次的输出不是合法 JSON 或字段不完整/attitudeLevel 取值不对，请重新只输出符合要求的完整 JSON，不要有多余文字。',
      });
    }
    const content = await chatCompletion(messages);
    lastRawContent = content;
    const candidate = extractJson(content);
    if (candidate && validateResult(candidate)) {
      parsed = candidate;
    }
  }

  if (!parsed) {
    throw new HunyuanError(`模型未能返回合法的分析结果：${lastRawContent.slice(0, 200)}`);
  }

  const market = ALLOWED_MARKETS.includes(parsed.market) ? parsed.market : query.market;

  // 用真实行情覆盖模型估算的股价/涨跌幅；不可用时回退模型估值
  let priceNum = Number(parsed.price);
  let changePercent = parsed.changePercent;
  let priceSource = 'model';
  try {
    const quote = await fetchLatestQuote(query.code, market);
    if (quote && Number.isFinite(quote.price) && quote.price > 0) {
      priceNum = quote.price;
      if (quote.changePercent != null) changePercent = quote.changePercent;
      priceSource = 'realtime';
    }
  } catch (e) {
    // 行情获取失败，静默回退
  }

  return {
    code: query.code,
    name: sanitizeFreeText(parsed.name, MAX_NAME_LEN) || query.name,
    market,
    priceUnit: MARKET_CURRENCY[market] || '元',
    industry: sanitizeFreeText(parsed.industry, 30),
    listDate: sanitizeFreeText(parsed.listDate, 20),
    chairman: sanitizeFreeText(parsed.chairman, 20),
    price: priceNum.toFixed(2),
    changePercent,
    priceSource,
    snapshot: parsed.snapshot,
    medianTable: parsed.medianTable,
    fiveYearMedian: Number(parsed.fiveYearMedian),
    medianNote: parsed.medianNote,
    profitTable: parsed.profitTable,
    dividendTable: parsed.dividendTable && parsed.dividendTable.length > 0 ? parsed.dividendTable : generateFallbackDividendTable(parsed.name),
    dividendSummary: sanitizeFreeText(parsed.dividendSummary, 120) || '该股近五年分红数据有限，建议查阅公司公告获取详细信息。',
    macro: parsed.macro,
    roundtable: parsed.roundtable,
    summary: parsed.summary,
    dataAsOf: new Date().toISOString().slice(0, 10),
    disclaimer: '以上分析由AI大模型基于训练知识生成，并非真实行情/财务数据的实时查询结果，可能不准确，仅供娱乐参考，不构成投资建议。股市有风险，投资决策需独立判断。',
  };
}

function generateFallbackDividendTable(name) {
  const baseYear = 2021;
  return Array.from({ length: 5 }, (_, i) => ({
    year: String(baseYear + i),
    dividendPerShare: '0',
    dividendYield: '0%',
    payoutRatio: '0%',
    specialDividend: '无',
  }));
}

const DIVIDEND_SYSTEM_PROMPT = `你是A股/港股/美股分红数据查询助手。根据你的训练知识，给出指定股票近五年（2021-2025）的现金分红数据。

规则：
- 恰好输出 5 条，年份为 2021/2022/2023/2024/2025，按从早到晚排列。
- dividendPerShare 为每股现金分红（税前，单位元/港元/美元），保留2位小数；确实未分红的年份填 "0"。
- dividendYield 为按当年均价计算的股息率，如 "3.25%"；未分红填 "0%"。
- payoutRatio 为分红占归母净利润的比例，如 "35%"；未分红填 "0%"。
- specialDividend 填特别分红/送转信息，如 "无"、"10转3"。
- summary 一句话总结分红特点（不超过60字）。
- 数字基于训练知识合理估算，不要声称是实时数据。
- 严格只输出 JSON，不要代码块围栏，不要任何额外文字。

输出格式：
{
  "dividendTable": [
    {"year": "2021", "dividendPerShare": "0.35", "dividendYield": "3.2%", "payoutRatio": "35%", "specialDividend": "无"}
  ],
  "summary": "一句话总结"
}`;

/**
 * 单独补全某只股票的近五年分红数据（用于旧缓存缺失分红字段时按需补全）。
 * @param {string} rawCode
 * @param {string} rawName
 * @param {string} rawMarket
 * @returns {Promise<{dividendTable: Array, dividendSummary: string}|null>} 失败返回 null
 */
async function generateDividendData(rawCode, rawName, rawMarket) {
  const query = normalizeQuery(rawCode, rawName, rawMarket);
  if (!query.code || !query.name) return null;

  const messages = [
    { role: 'system', content: DIVIDEND_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `请给出「${query.name}」（代码：${query.code}，市场：${query.market}）近五年的现金分红数据，货币单位为${MARKET_CURRENCY[query.market]}（数字不带货币符号）。`,
    },
  ];

  try {
    const content = await chatCompletion(messages);
    const parsed = extractJson(content);
    if (!parsed || !Array.isArray(parsed.dividendTable) || parsed.dividendTable.length === 0) {
      return null;
    }
    const table = parsed.dividendTable
      .filter((r) => r && (r.year != null))
      .slice(0, 5)
      .map((r) => ({
        year: sanitizeFreeText(String(r.year), 12),
        dividendPerShare: sanitizeFreeText(String(r.dividendPerShare == null ? '0' : r.dividendPerShare), 12),
        dividendYield: sanitizeFreeText(String(r.dividendYield == null ? '0%' : r.dividendYield), 12),
        payoutRatio: sanitizeFreeText(String(r.payoutRatio == null ? '0%' : r.payoutRatio), 12),
        specialDividend: sanitizeFreeText(String(r.specialDividend == null ? '无' : r.specialDividend), 20) || '无',
      }));
    if (table.length === 0) return null;
    return {
      dividendTable: table,
      dividendSummary: sanitizeFreeText(parsed.summary, 120) || '',
    };
  } catch (err) {
    return null;
  }
}

module.exports = { generateAnalysis, generateDividendData, normalizeQuery, ALLOWED_MARKETS };
