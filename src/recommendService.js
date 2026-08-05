'use strict';

/**
 * 荐股推荐编排服务。
 *
 * 说明（重要，供后续维护者理解设计取舍）：
 * 「荐股 Skill」（stock-recommend-skill）本质是运行在 WorkBuddy/CodeBuddy Agent 环境里的技能，
 * 它依赖平台内置的 westock-tool / westock-data（真实行情与财务数据查询）以及 stock-analysis
 * （可视化报告生成）等 Agent 工具——这些工具没有对外开放的 HTTP API，普通 Node 后端服务无法直接
 * "调用"这个 Skill。
 *
 * 因此本服务采用的落地方案是：把 Skill README 中公开的"六位投资大师分析框架"和输出规范固化为
 * 系统提示词（System Prompt），由后端直接调用腾讯混元大模型完成"筛选与理由生成"的语言层工作，
 * 并强制模型以结构化 JSON 返回，服务端做严格解析与兜底校验。
 *
 * 重要局限（务必让用户知晓，并已体现在前端免责声明中）：
 * 本方案没有接入真实行情/财务数据源，模型给出的行情数据基于其训练知识，可能不是最新/准确数据，
 * 仅供娱乐参考。若后续部署环境具备调用 westock-tool/westock-data 的能力，应替换本文件为真实数据
 * 查询 + 大模型仅做文本组织的方案，以符合 Skill 原始设计（"数字说话，禁止用模型记忆补数据"）。
 */

const { chatCompletion, HunyuanError } = require('./hunyuanClient');
const { fetchLatestQuote } = require('./quoteService');

const ALLOWED_MARKETS = ['A股', '港股', '美股'];
const ALLOWED_STYLES = ['价值', '成长', '高股息', '低估值', '红利'];
const MAX_FREE_TEXT_LEN = 20;
const MAX_SUMMARY_LEN = 200;

const BLESSINGS = ['恭喜发财', '好运连连', '万事顺遂', '喜从天降', '心想事成'];

const MARKET_CURRENCY = { A股: '元', 港股: '港元', 美股: '美元' };

const SYSTEM_PROMPT = `你是"求一票"App 的选股引擎，融合六位投资大师的分析视角，从股票市场中挑选出恰好一只标的并给出理由。

六位大师的分析框架（必须逐一体现）：
1. 沃伦·巴菲特：护城河（毛利率水平与稳定性、ROE连续性）
2. 段永平：生意模式（经营现金流/净利润比、资本开支强度）
3. 彼得·林奇：成长分类（成长股/周期股/困境反转等归属、PEG）
4. 本杰明·格雷厄姆：安全边际（PE/PB历史分位、股息率）
5. 查理·芒格：能力圈与反向思考（主营是否清晰易懂、可能亏钱的路径）
6. 菲利普·费雪：成长质量与管理层（研发投入转化、分红连续性）

硬性规则：
- 只输出一只股票，不给并列候选。
- 必须包含至少 2 条具体的反面风险提示，不能只说好话。
- 不得使用"必涨""稳赚""目标价必达""内幕""跟庄"等承诺性/诱导性用语。
- 不得编造无法自证的具体财务数字为确凿事实，如涉及数据请使用"据公开资料"等表述并保持谨慎、克制的语气。
- 严格只输出 JSON，不要输出任何 JSON 之外的文字、不要使用代码块围栏。

JSON 输出格式（字段必须齐全）：
{
  "code": "股票代码（如 600519 或 00700.HK）",
  "name": "股票名称",
  "market": "A股/港股/美股 之一",
  "price": "当前参考股价的数值（如 1680.00），不含货币单位，基于你的训练知识给出合理估算即可",
  "tags": ["1~3个核心标签，如 高股息、低估值、AI概念、高送转"],
  "summaryReason": "推荐理由，80~150字，必须从以下三个维度展开分析：1)【基本面】公司核心业务、盈利能力（ROE/毛利率）、估值水平（PE/PB分位）、现金流状况等；2)【消息面】近期行业政策、公司公告、市场热点或催化剂事件；3)【技术面】股价走势形态、关键支撑/压力位、量价关系、均线系统等。用通俗语言组织，让普通投资者能快速理解为什么选这只股票",
  "roundtable": [
    {"master": "沃伦·巴菲特", "viewpoint": "……"},
    {"master": "段永平", "viewpoint": "……"},
    {"master": "彼得·林奇", "viewpoint": "……"},
    {"master": "本杰明·格雷厄姆", "viewpoint": "……"},
    {"master": "查理·芒格", "viewpoint": "……"},
    {"master": "菲利普·费雪", "viewpoint": "……"}
  ],
  "risks": ["风险提示1", "风险提示2"]
}`;

function sanitizeFreeText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[\r\n"'`{}<>]/g, '').trim().slice(0, MAX_FREE_TEXT_LEN);
}

/**
 * 校验并规整用户传入的约束条件，防止 prompt injection 与超长输入。
 */
function normalizeConstraints(raw) {
  const constraints = raw && typeof raw === 'object' ? raw : {};
  const market = ALLOWED_MARKETS.includes(constraints.market) ? constraints.market : undefined;
  const style = ALLOWED_STYLES.includes(constraints.style) ? constraints.style : undefined;
  const sector = sanitizeFreeText(constraints.sector) || undefined;
  return { market, sector, style };
}

function buildUserPrompt(constraints, recentCodes = []) {
  const parts = ['请给我推荐一只股票。'];
  if (constraints.market) parts.push(`市场限定：${constraints.market}。`);
  if (constraints.sector) parts.push(`板块偏好：${constraints.sector}。`);
  if (constraints.style) parts.push(`风格偏好：${constraints.style}。`);
  if (Array.isArray(recentCodes) && recentCodes.length) {
    parts.push(
      `为了避免重复，本次【绝对不要】选择以下最近已经推荐过的股票代码：${recentCodes.join('、')}。请挑选一只不同的标的。`
    );
  }
  parts.push('请严格按约定的 JSON 格式输出。');
  return parts.join('');
}

function extractJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  // 兼容模型仍然包裹了 ```json ... ``` 代码块的情况
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

function validateResult(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.code !== 'string' || !obj.code.trim()) return false;
  if (typeof obj.name !== 'string' || !obj.name.trim()) return false;
  if (!(typeof obj.price === 'string' || typeof obj.price === 'number')) return false;
  if (!Number.isFinite(Number(obj.price)) || Number(obj.price) <= 0) return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.summaryReason !== 'string' || !obj.summaryReason.trim()) return false;
  if (!Array.isArray(obj.roundtable) || obj.roundtable.length < 3) return false;
  if (!obj.roundtable.every((r) => r && typeof r.master === 'string' && typeof r.viewpoint === 'string')) return false;
  if (!Array.isArray(obj.risks) || obj.risks.length < 2) return false;
  return true;
}

/**
 * 生成一次"求票"推荐结果。
 * @param {object} rawConstraints 前端传入的约束（market/sector/style）
 * @returns {Promise<object>} 结构化推荐结果（未落库，不含 requestId）
 */
async function generateRecommendation(rawConstraints, recentCodes = []) {
  const constraints = normalizeConstraints(rawConstraints);
  const userPrompt = buildUserPrompt(constraints, recentCodes);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let parsed = null;
  let lastValid = null;
  let lastRawContent = '';

  // 最多重试 4 次：兼顾 JSON 合法性校验与"避免重复最近抽过的标的"
  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      messages.push({
        role: 'user',
        content: '你上一次的输出不是合法 JSON、字段不完整，或又重复了刚推荐过的股票。请重新只输出符合要求且【不同于最近推荐】的 JSON，不要有多余文字。',
      });
    }
    const content = await chatCompletion(messages, { temperature: 0.9 });
    lastRawContent = content;
    const candidate = extractJson(content);
    if (!candidate || !validateResult(candidate)) continue;
    lastValid = candidate;
    const code = candidate.code.trim();
    if (!recentCodes.length || !recentCodes.includes(code)) {
      parsed = candidate;
      break;
    }
  }

  // 兜底：若模型始终抽到最近重复标的，仍返回最后一次合法结果，避免直接报错让用户摇不出
  if (!parsed) {
    if (lastValid) {
      parsed = lastValid;
    } else {
      throw new HunyuanError(`模型未能返回合法的推荐结果：${lastRawContent.slice(0, 200)}`);
    }
  }

  const blessing = BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)];
  const market = ALLOWED_MARKETS.includes(parsed.market) ? parsed.market : (constraints.market || 'A股');

  // 尝试用真实行情覆盖模型估算的股价；行情不可用时回退到模型估值，保证始终能出结果
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
    // 行情获取失败，静默回退到模型估值价
  }

  const priceDisclaimer =
    priceSource === 'realtime'
      ? '股价为腾讯实时行情接口数据；其余分析内容由AI大模型基于训练知识生成，仅供娱乐参考，不构成投资建议。'
      : '股价由AI大模型基于训练知识估算，可能非实时/准确；其余内容仅供娱乐参考，不构成投资建议。';

  return {
    blessing,
    code: parsed.code.trim(),
    name: parsed.name.trim(),
    market,
    price: priceNum.toFixed(2),
    priceUnit: MARKET_CURRENCY[market] || '元',
    changePercent: changePercent != null ? Number(changePercent).toFixed(2) : null,
    priceSource,
    tags: parsed.tags.filter((t) => typeof t === 'string').slice(0, 3),
    summaryReason: parsed.summaryReason.trim().slice(0, MAX_SUMMARY_LEN),
    roundtable: parsed.roundtable.map((r) => ({ master: String(r.master), viewpoint: String(r.viewpoint) })),
    risks: parsed.risks.filter((r) => typeof r === 'string'),
    constraints,
    dataAsOf: new Date().toISOString().slice(0, 10),
    disclaimer: priceDisclaimer,
  };
}

module.exports = { generateRecommendation, normalizeConstraints };
