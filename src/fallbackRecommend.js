'use strict';

/**
 * 大模型不可用时的本地推荐。
 * 按用户选择的市场/板块/策略，从本地股票池筛选，并尽量覆盖公开行情。
 */

const STOCK_POOL = [
  { code: '600519', name: '贵州茅台', market: 'A股', cap: '大盘股', sectors: ['消费', '食品饮料'], styles: ['价值', '高股息', '红利'], tags: ['护城河', '消费', '高股息'], price: 1480, pitch: { fundamental: '品牌与渠道壁垒强，盈利质量和自由现金流长期较稳。', news: '白酒需求与渠道库存是近期核心观察点，以公司公告为准。', technical: '权重白马，波动相对题材股更缓，适合看中长期均线。' } },
  { code: '000858', name: '五粮液', market: 'A股', cap: '大盘股', sectors: ['消费', '食品饮料'], styles: ['价值'], tags: ['白酒', '消费', '品牌'], price: 128, pitch: { fundamental: '高端白酒第二梯队代表，品牌力与盈利能力仍在消费股前列。', news: '批价和经销商库存变化会直接影响短期情绪。', technical: '弹性大于茅台，反弹与回撤都更明显。' } },
  { code: '000333', name: '美的集团', market: 'A股', cap: '大盘股', sectors: ['消费', '家电'], styles: ['价值', '红利'], tags: ['家电', '价值', '分红'], price: 72, pitch: { fundamental: '家电龙头，业务多元，分红与现金流相对扎实。', news: '外销与原材料价格是近期业绩弹性来源。', technical: '走势更贴近蓝筹节奏，适合中线跟踪。' } },
  { code: '600887', name: '伊利股份', market: 'A股', cap: '大盘股', sectors: ['消费', '食品饮料'], styles: ['价值', '高股息'], tags: ['乳业', '消费', '分红'], price: 28, pitch: { fundamental: '乳制品龙头，渠道覆盖广，盈利相对稳定。', news: '原奶成本和消费复苏节奏决定短期利润。', technical: '波动中等，适合作为消费底仓观察。' } },
  { code: '600036', name: '招商银行', market: 'A股', cap: '大盘股', sectors: ['金融', '银行'], styles: ['高股息', '价值', '红利'], tags: ['银行', '高股息', '零售'], price: 38, pitch: { fundamental: '零售银行优势明显，资产质量和分红记录较稳。', news: '息差与财富管理手续费是近期主线。', technical: '大盘银行股，趋势跟随利率和风险偏好。' } },
  { code: '601318', name: '中国平安', market: 'A股', cap: '大盘股', sectors: ['金融', '保险'], styles: ['低估值', '价值'], tags: ['保险', '低估值', '综合金融'], price: 52, pitch: { fundamental: '综合金融平台，估值长期偏低，看点在寿险价值与投资端。', news: '长端利率和地产敞口仍是市场定价核心。', technical: '弹性大于银行，反弹往往跟随风险偏好回升。' } },
  { code: '601166', name: '兴业银行', market: 'A股', cap: '大盘股', sectors: ['金融', '银行'], styles: ['低估值', '高股息', '红利'], tags: ['银行', '低估值', '高股息'], price: 20, pitch: { fundamental: '对公能力强，股息率在银行股中常年靠前。', news: '资产质量和息差变化会影响估值修复节奏。', technical: '低估值高股息，更适合看分位而不是短线形态。' } },
  { code: '300750', name: '宁德时代', market: 'A股', cap: '大盘股', sectors: ['新能源', '锂电'], styles: ['成长'], tags: ['新能源', '成长', '电池'], price: 210, pitch: { fundamental: '动力电池龙头，全球份额高，资本开支与技术迭代快。', news: '装车量、海外订单和价格战是近期焦点。', technical: '成长股波动大，突破与回撤都较剧烈。' } },
  { code: '601012', name: '隆基绿能', market: 'A股', cap: '大盘股', sectors: ['新能源', '光伏'], styles: ['成长', '周期'], tags: ['光伏', '新能源', '周期'], price: 16, pitch: { fundamental: '光伏组件龙头，盈利随硅料和组件价格周期波动。', news: '产能出清和海外需求是景气拐点观察点。', technical: '典型周期成长，底部与顶部都容易过度定价。' } },
  { code: '002594', name: '比亚迪', market: 'A股', cap: '大盘股', sectors: ['汽车', '智能驾驶', '新能源'], styles: ['成长'], tags: ['新能源', '汽车', '成长'], price: 280, pitch: { fundamental: '整车+电池垂直一体化，销量与成本控制是核心竞争力。', news: '新车周期、出口和价格战决定短期预期。', technical: '成交活跃，趋势一旦形成延续性较强。' } },
  { code: '601127', name: '赛力斯', market: 'A股', cap: '中盘股', sectors: ['汽车', '智能驾驶'], styles: ['成长'], tags: ['智能驾驶', '汽车', '成长'], price: 120, pitch: { fundamental: '华为智选合作打开高端智能车市场，弹性大、确定性仍在验证。', news: '新车交付与毛利率改善是关键催化。', technical: '高波动标的，适合严格止盈止损。' } },
  { code: '002415', name: '海康威视', market: 'A股', cap: '大盘股', sectors: ['科技', '安防'], styles: ['价值', '成长'], tags: ['安防', '科技', '制造'], price: 32, pitch: { fundamental: '安防硬件与创新业务并进，现金流和分红能力不错。', news: '海外订单与创新业务占比是近期看点。', technical: '波动小于纯主题科技股。' } },
  { code: '688981', name: '中芯国际', market: 'A股', cap: '大盘股', sectors: ['科技', '半导体'], styles: ['成长'], tags: ['半导体', '科技', '国产替代'], price: 78, pitch: { fundamental: '晶圆代工龙头，产能利用率与先进制程进展决定估值。', news: '国产替代订单和资本开支节奏是主线。', technical: '主题和景气共振时波动放大。' } },
  { code: '688041', name: '海光信息', market: 'A股', cap: '中盘股', sectors: ['科技', '半导体', 'AI'], styles: ['成长'], tags: ['芯片', 'AI', '国产替代'], price: 140, pitch: { fundamental: '国产算力芯片代表，成长快但估值不便宜。', news: 'AI 服务器招标和产品迭代是催化剂。', technical: '弹性高，更适合看成交量和突破。' } },
  { code: '002230', name: '科大讯飞', market: 'A股', cap: '中盘股', sectors: ['科技', '传媒', '游戏', 'AI应用'], styles: ['成长'], tags: ['AI应用', '科技', '软件'], price: 48, pitch: { fundamental: '语音与行业大模型落地较早，收入质量仍需持续验证。', news: '政企订单和教育业务是短期情绪来源。', technical: '主题交易特征明显，回撤快。' } },
  { code: '000725', name: '京东方A', market: 'A股', cap: '大盘股', sectors: ['科技', '半导体'], styles: ['周期', '低估值'], tags: ['面板', '周期', '科技'], price: 4, pitch: { fundamental: '面板周期股，盈利随价格周期大幅波动。', news: '面板涨价与稼动率是景气信号。', technical: '低价大票，量能配合时趋势更清晰。' } },
  { code: '600276', name: '恒瑞医药', market: 'A股', cap: '大盘股', sectors: ['医药生物', '创新药'], styles: ['成长', '价值'], tags: ['创新药', '医药', '研发'], price: 48, pitch: { fundamental: '创新药转型代表，研发管线决定中长期空间。', news: '新药获批和集采影响短期利润。', technical: '医药龙头，趋势相对平滑。' } },
  { code: '300760', name: '迈瑞医疗', market: 'A股', cap: '大盘股', sectors: ['医药生物', '创新药'], styles: ['成长', '价值'], tags: ['医疗器械', '成长', '出口'], price: 250, pitch: { fundamental: '医疗器械龙头，国内医院需求+出口双轮。', news: '反腐与医院招标节奏影响订单。', technical: '优质成长，回撤后常被中线资金关注。' } },
  { code: '001979', name: '招商蛇口', market: 'A股', cap: '中盘股', sectors: ['房地产', '基建'], styles: ['低估值', '周期'], tags: ['地产', '低估值', '央企'], price: 10, pitch: { fundamental: '央企地产，土储和销售质量相对同行更好。', news: '政策松绑与销售回暖是估值修复前提。', technical: '板块贝塔强，个股常跟涨跟跌。' } },
  { code: '601668', name: '中国建筑', market: 'A股', cap: '大盘股', sectors: ['房地产', '基建'], styles: ['红利', '低估值', '高股息'], tags: ['基建', '央企', '高股息'], price: 6, pitch: { fundamental: '建筑央企，订单稳定，股息率有吸引力。', news: '基建发力和回款质量决定业绩弹性。', technical: '低波动红利股，更适合看股息而不是短线。' } },
  { code: '600893', name: '航发动力', market: 'A股', cap: '中盘股', sectors: ['军工', '航天航空'], styles: ['成长'], tags: ['军工', '航空发动机', '成长'], price: 40, pitch: { fundamental: '航空发动机核心标的，订单可见度较高。', news: '军工订单与交付节奏是主线。', technical: '主题波段特征明显。' } },
  { code: '600760', name: '中航沈飞', market: 'A股', cap: '中盘股', sectors: ['军工', '航天航空'], styles: ['成长'], tags: ['军工', '航空', '成长'], price: 55, pitch: { fundamental: '军机整机制造龙头，业绩与列装计划绑定。', news: '批产交付是最直接的催化。', technical: '军工情绪升温时弹性较大。' } },
  { code: '002624', name: '完美世界', market: 'A股', cap: '中盘股', sectors: ['传媒', '游戏', 'AI应用'], styles: ['成长'], tags: ['游戏', '传媒', '内容'], price: 12, pitch: { fundamental: '游戏研发与发行，业绩看爆款周期。', news: '新游上线和版号是短期催化剂。', technical: '事件驱动强，适合按消息波段。' } },
  { code: '600309', name: '万华化学', market: 'A股', cap: '大盘股', sectors: ['化工', '原材料'], styles: ['周期', '价值'], tags: ['化工', '周期', '材料'], price: 70, pitch: { fundamental: 'MDI 龙头，成本优势和一体化能力强。', news: '产品价格和下游开工率决定景气。', technical: '周期股，趋势跟随商品价格。' } },
  { code: '601899', name: '紫金矿业', market: 'A股', cap: '大盘股', sectors: ['化工', '原材料', '周期'], styles: ['红利', '周期', '高股息'], tags: ['资源', '周期', '红利'], price: 18, pitch: { fundamental: '金铜资源量领先，利润与金属价格高度相关。', news: '金价、铜价和矿产能释放是主线。', technical: '商品牛市中趋势性强。' } },
  { code: '000998', name: '隆平高科', market: 'A股', cap: '中盘股', sectors: ['农业', '种业'], styles: ['成长', '周期'], tags: ['种业', '农业', '成长'], price: 12, pitch: { fundamental: '种业龙头，看点和风险都在粮价与政策。', news: '种植面积和种子价格是短期变量。', technical: '板块轮动时弹性较大。' } },
  { code: '002714', name: '牧原股份', market: 'A股', cap: '大盘股', sectors: ['农业', '种业'], styles: ['周期'], tags: ['养殖', '周期', '农业'], price: 40, pitch: { fundamental: '生猪养殖龙头，成本控制能力强，利润随猪价周期大幅波动。', news: '猪价和出栏量是最直接的交易信号。', technical: '典型周期股，趋势一旦形成幅度大。' } },
  { code: '000063', name: '中兴通讯', market: 'A股', cap: '大盘股', sectors: ['通信', '5G', '6G'], styles: ['成长', '价值'], tags: ['通信', '5G', '设备'], price: 36, pitch: { fundamental: '通信设备龙头，运营商资本开支和出海决定增长。', news: '5G-A / 6G 预期和算力订单是近期主题。', technical: '主题与业绩共振时更有趋势。' } },
  { code: '600941', name: '中国移动', market: 'A股', cap: '大盘股', sectors: ['通信', '5G', '6G'], styles: ['高股息', '红利', '价值'], tags: ['运营商', '高股息', '通信'], price: 110, pitch: { fundamental: '运营商龙头，现金流和分红稳定。', news: 'ARPU 和算力/政企业务是增长看点。', technical: '低波动红利，更适合作为底仓。' } },
  { code: '300274', name: '阳光电源', market: 'A股', cap: '大盘股', sectors: ['新能源', '光伏'], styles: ['成长'], tags: ['光伏', '储能', '成长'], price: 80, pitch: { fundamental: '逆变器和储能龙头，海外收入占比高。', news: '储能招标和欧洲需求是催化。', technical: '成长股波动大，量价配合更重要。' } },
  { code: '00700.HK', name: '腾讯控股', market: '港股', cap: '大盘股', sectors: ['科技', '传媒', '游戏', 'AI应用'], styles: ['成长', '价值'], tags: ['互联网', '游戏', '成长'], price: 420, pitch: { fundamental: '游戏+广告+金融科技，自由现金流强。', news: '游戏版号、广告复苏和AI应用是主线。', technical: '港股科技龙头，跟随全球风险偏好。' } },
  { code: '09988.HK', name: '阿里巴巴', market: '港股', cap: '大盘股', sectors: ['消费', '科技'], styles: ['价值', '低估值'], tags: ['电商', '消费', '互联网'], price: 110, pitch: { fundamental: '电商基本盘仍在，云和国际化提供弹性。', news: '消费复苏和回购是近期催化剂。', technical: '估值修复交易特征明显。' } },
  { code: '03690.HK', name: '美团', market: '港股', cap: '大盘股', sectors: ['消费', '科技'], styles: ['成长'], tags: ['本地生活', '消费', '成长'], price: 130, pitch: { fundamental: '到店+到家双轮，利润率改善是核心叙事。', news: '竞争格局和补贴节奏影响短期预期。', technical: '港股互联网里弹性较大。' } },
  { code: 'AAPL', name: '苹果', market: '美股', cap: '大盘股', sectors: ['科技', '消费'], styles: ['价值', '成长'], tags: ['消费电子', '科技', '品牌'], price: 230, pitch: { fundamental: '硬件+服务生态，回购和品牌溢价支撑估值。', news: '换机周期和服务收入增速是观察点。', technical: '美股核心资产，波动相对同业更低。' } },
  { code: 'NVDA', name: '英伟达', market: '美股', cap: '大盘股', sectors: ['科技', '半导体', 'AI'], styles: ['成长'], tags: ['AI', '芯片', '成长'], price: 120, pitch: { fundamental: 'AI 算力核心供应商，成长性和估值都在高位。', news: '数据中心订单和客户资本开支指引是关键。', technical: '高波动成长，回撤幅度通常不小。' } },
  { code: 'MSFT', name: '微软', market: '美股', cap: '大盘股', sectors: ['科技', 'AI应用'], styles: ['成长', '价值'], tags: ['云计算', 'AI', '软件'], price: 420, pitch: { fundamental: '云和办公软件护城河深，AI 正在往现有产品里嵌。', news: 'Azure 增速和 AI 货币化是主线。', technical: '美股质量成长代表，回撤相对可控。' } },
];

const CATEGORY_HINT = {
  value: { styles: ['价值', '高股息', '低估值', '红利'] },
  growth: { styles: ['成长'] },
  technical: { styles: ['成长', '价值'] },
  quant: { styles: ['价值', '成长', '低估值'] },
  event: { sectors: ['科技', '传媒', '游戏', 'AI'] },
  cycle: { styles: ['周期', '红利'], sectors: ['周期', '化工', '原材料', '农业'] },
};

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[/\s、,，+]+/)
    .map((t) => t.trim())
    .filter((t) => t && t !== '不限');
}

function stockText(stock) {
  return [stock.name, stock.market, stock.cap, ...(stock.sectors || []), ...(stock.styles || []), ...(stock.tags || [])]
    .join(' ')
    .toLowerCase();
}

function scoreStock(stock, constraints, strategy) {
  let score = 1;
  if (constraints.market && stock.market !== constraints.market) return 0;
  if (constraints.cap && stock.cap && stock.cap !== constraints.cap) score -= 0.4;

  const styles = stock.styles || [];
  if (constraints.style && !styles.includes(constraints.style)) return 0;

  if (constraints.sector) {
    const tokens = tokenize(constraints.sector);
    const hay = stockText(stock);
    const hits = tokens.filter((t) => hay.includes(t)).length;
    if (!hits) return 0;
    score += hits;
  }

  if (strategy) {
    const hint = CATEGORY_HINT[strategy.category] || {};
    if (hint.styles && hint.styles.some((s) => styles.includes(s))) score += 2;
    if (hint.sectors && hint.sectors.some((s) => (stock.sectors || []).some((x) => x.includes(s) || s.includes(x)))) {
      score += 2;
    }
    if (strategy.id === 'high-dividend' && styles.includes('高股息')) score += 3;
    if (strategy.id === 'buffett-moat' && (stock.tags || []).includes('护城河')) score += 3;
    if (strategy.id === 'small-cap-factor' && stock.cap === '小盘股') score += 2;
    if (strategy.id === 'low-volatility' && styles.includes('红利')) score += 2;
    if (strategy.id === 'cyclical-timing' && styles.includes('周期')) score += 3;
  }

  if (constraints.extra) {
    const extraTokens = tokenize(constraints.extra);
    const hay = stockText(stock);
    score += extraTokens.filter((t) => hay.includes(t)).length;
  }

  return score;
}

function pickFallbackStock(constraints = {}, recentCodes = [], strategy = null) {
  const recent = new Set((recentCodes || []).map((c) => String(c).trim()));
  const ranked = STOCK_POOL
    .map((stock) => ({ stock, score: scoreStock(stock, constraints, strategy) }))
    .filter((x) => x.score > 0 && !recent.has(x.stock.code))
    .sort((a, b) => b.score - a.score);

  let pool = ranked;
  if (!pool.length) {
    pool = STOCK_POOL
      .filter((s) => !constraints.market || s.market === constraints.market)
      .filter((s) => !recent.has(s.code))
      .map((stock) => ({ stock, score: 1 }));
  }
  if (!pool.length) {
    pool = STOCK_POOL.map((stock) => ({ stock, score: 1 }));
  }

  const topScore = pool[0].score;
  const top = pool.filter((x) => x.score === topScore);
  return top[Math.floor(Math.random() * top.length)].stock;
}

function buildFallbackRecommendation(stock) {
  const { name, code, pitch } = stock;
  return {
    code,
    name,
    market: stock.market,
    price: stock.price,
    tags: (stock.tags || []).slice(0, 3),
    summaryReason: `1)【基本面】${pitch.fundamental} 2)【消息面】${pitch.news} 3)【技术面】${pitch.technical}`,
    roundtable: [
      { master: '沃伦·巴菲特', viewpoint: `${name} 更适合用护城河和长期盈利质量来观察，而不是短期涨跌。` },
      { master: '段永平', viewpoint: `先看生意是否好懂、现金是否真能赚回来，${name} 属于相对容易理解的样本。` },
      { master: '彼得·林奇', viewpoint: `按成长分类看，它更像可跟踪的行业代表，而不是需要故事驱动的题材股。` },
      { master: '本杰明·格雷厄姆', viewpoint: `安全边际取决于买入价格。本地规则给出的是候选标的，不代表当前已经便宜。` },
      { master: '查理·芒格', viewpoint: `能力圈内才谈逆向。若看不懂${name}的商业模式，就不应据此做决策。` },
      { master: '菲利普·费雪', viewpoint: `成长质量要看产品、管理和再投资效率，本地规则不能替代财报核对。` },
    ],
    risks: [
      '大模型暂不可用，本结果由本地规则筛选，财务与消息面可能过时。',
      '股市有涨有跌，本地推荐不构成投资建议，决策需独立判断。',
    ],
  };
}

function buildFallbackStrategyResult(strategy, options = {}, recentCodes = []) {
  const constraints = {
    market: options.market,
    sector: options.sector,
    cap: options.cap,
    extra: options.extra,
  };
  const stock = pickFallbackStock(constraints, recentCodes, strategy);
  const rec = buildFallbackRecommendation(stock);
  const indicators = Array.isArray(strategy.indicators) ? strategy.indicators.slice(0, 4) : [];
  const fitPoints = indicators.map((indicator, i) => ({
    indicator,
    actual: i === 0
      ? `${stock.name} 被本地规则划入「${strategy.name}」候选池，匹配其${(stock.tags || [])[0] || stock.sectors[0]}特征。`
      : `该指标需用最新财报核实；本地规则仅按行业与风格近似匹配。`,
    match: i === 0 ? '部分满足' : '部分满足',
  }));

  return {
    code: rec.code,
    name: rec.name,
    market: rec.market,
    price: rec.price,
    tags: rec.tags,
    summaryReason: `按「${strategy.name}」本地规则，从${stock.market}${stock.sectors[0] || ''}股票池选出${stock.name}。${stock.pitch.fundamental}`,
    fitPoints,
    actionPlan: (strategy.steps || []).slice(0, 3),
    risks: [
      '大模型暂不可用，本结果为本地策略近似匹配，不是完整回测筛选。',
      strategy.risk || '策略失效时可能连续回撤，需独立判断。',
    ],
    strategyFitScore: 72,
  };
}

function scaleAround(base, yearOffset) {
  const factor = 0.82 + yearOffset * 0.06;
  const median = Number((base * factor).toFixed(2));
  return {
    year: String(2021 + yearOffset),
    median,
    high: Number((median * 1.18).toFixed(2)),
    low: Number((median * 0.78).toFixed(2)),
    tradingDays: 242,
  };
}

function findPoolStock(code) {
  const raw = String(code || '').trim().toUpperCase();
  return STOCK_POOL.find((s) => s.code.toUpperCase() === raw) || null;
}

function buildFallbackAnalysis(query, quote) {
  const stock = findPoolStock(query.code);
  const name = query.name;
  const code = query.code;
  const market = query.market;
  const price = quote && Number.isFinite(quote.price) ? quote.price : (stock ? stock.price : 100);
  const changePercent = quote && quote.changePercent != null ? quote.changePercent : 0;
  const medianTable = [0, 1, 2, 3, 4].map((i) => scaleAround(price, i));
  const fiveYearMedian = Number((medianTable.reduce((s, r) => s + r.median, 0) / medianTable.length).toFixed(2));
  const pitch = stock ? stock.pitch : {
    fundamental: `${name} 的主营与财务需以最新年报为准。`,
    news: '消息面未接入实时资讯，请自行核对公告。',
    technical: '技术面仅作页面结构演示。',
  };

  return {
    code,
    name,
    market,
    industry: stock && stock.sectors ? stock.sectors.join('/') : '本地推荐',
    listDate: '',
    chairman: '',
    price: price.toFixed(2),
    changePercent,
    snapshot: {
      marketCap: '—',
      peTtm: '—',
      turnover: '—',
      turnoverRate: '—',
      week52High: Number((price * 1.25).toFixed(2)),
      week52Low: Number((price * 0.75).toFixed(2)),
    },
    medianTable,
    fiveYearMedian,
    medianNote: `当前参考价 ${price.toFixed(2)}，近五年中位数为本地估算 ${fiveYearMedian}，仅供页面展示。`,
    profitTable: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({
      year: String(year),
      netProfit: `${(80 + i * 12).toFixed(1)}亿`,
      yoy: `+${(6 + i).toFixed(1)}%`,
      revenue: `${(400 + i * 40).toFixed(0)}亿`,
      revenueYoy: `+${(8 + i).toFixed(1)}%`,
      grossMargin: `${(32 + i).toFixed(1)}%`,
      netMargin: `${(12 + i * 0.4).toFixed(1)}%`,
      roe: `${(14 + i * 0.3).toFixed(1)}%`,
    })),
    dividendTable: [2021, 2022, 2023, 2024, 2025].map((year) => ({
      year: String(year),
      dividendPerShare: '0.00',
      dividendYield: '0%',
      payoutRatio: '0%',
      specialDividend: '无',
    })),
    dividendSummary: '分红数据未接入真实财报，请以公司公告为准。',
    macro: {
      indices: [{ name: market === '美股' ? '纳斯达克' : market === '港股' ? '恒生指数' : '上证指数', value: '—', changePercent: '0' }],
      points: [
        '大模型暂不可用，本页由本地推荐规则生成示意报告。',
        pitch.news,
        '无实时宏观数据源，整体环境按中性处理。',
      ],
    },
    roundtable: {
      trend: {
        framework: '从产业链驱动力与持续性观察，不依赖单一主题故事。',
        keyNumbers: '本地规则，非实时产业统计。',
        points: [pitch.fundamental, '短期主题催化不等于长期产业趋势。'],
        attitude: '产业方向需持续验证，短期保持观察。',
        attitudeLevel: 'neutral',
      },
      valuation: {
        framework: '宏观仓位、行业景气、个股估值分位分层看。',
        keyNumbers: `参考价 ${price.toFixed(2)}，估值字段为占位。`,
        points: ['没有真实 PE/PEG 前，不应给出买点。', '价格带与分位需用最新财报重算。'],
        attitude: '估值结论不足，先当样本看结构。',
        attitudeLevel: 'watch',
      },
      fundamental: {
        framework: '行业体感 → 财报核对 → 管理层与现金流。',
        keyNumbers: `${code} 的利润表数字为示意值。`,
        points: [pitch.fundamental, '负债、毛利率和自由现金流要以年报为准。'],
        attitude: '基本面需要真实财报复核后再谈仓位。',
        attitudeLevel: 'neutral',
      },
      signal: {
        framework: '政策、产业、资讯、资金四层对齐。',
        keyNumbers: '信号层暂无实时数据源。',
        signals: {
          policy: '⚠️ 中性 未接入实时政策扫描',
          industry: '⚠️ 中性 产业数据为本地规则',
          news: '⚠️ 中性 请自行核对公告',
          fund: '⚠️ 中性 未接入资金流',
        },
        points: [pitch.news, pitch.technical],
        attitude: '信号不足，建议等待可验证信息。',
        attitudeLevel: 'watch',
      },
    },
    summary: {
      oneLineForBeginners: `${name} 由本地推荐规则给出，用来保证页面可用，不是买卖建议。`,
      route: [
        { title: '如果你更看重交互体验', content: '可以继续浏览报告结构，了解产品会如何呈现一份分析。' },
        { title: '如果你更担心误导', content: '请忽略示意数字，等大模型恢复后再生成。' },
        { title: '拿不准', content: '以交易所公告和最新财报为唯一可验证来源。' },
      ],
      keyPrediction: '大模型恢复后，才能生成针对该股的正式分析。',
      keyRisk: '把本地规则结果当成真实财务或行情结论。',
    },
  };
}

module.exports = {
  pickFallbackStock,
  buildFallbackRecommendation,
  buildFallbackAnalysis,
  buildFallbackStrategyResult,
};
