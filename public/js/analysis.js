'use strict';

(function () {
  const params = new URLSearchParams(window.location.search);
  const code = (params.get('code') || '').trim();
  const name = (params.get('name') || '').trim();
  const market = (params.get('market') || '').trim();

  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const errorMsgEl = document.getElementById('errorMsg');
  const retryBtn = document.getElementById('retryBtn');
  const backBtn = document.getElementById('backBtn');
  const reportContainer = document.getElementById('reportContainer');

  backBtn.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'index.html';
    }
  });

  function showState(name2) {
    loadingState.classList.toggle('hidden', name2 !== 'loading');
    errorState.classList.toggle('hidden', name2 !== 'error');
    reportContainer.classList.toggle('hidden', name2 !== 'report');
  }

  function parseNum(v) {
    if (typeof v === 'number') return v;
    const m = String(v == null ? '' : v).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
  }

  function signClass(v) {
    return parseNum(v) < 0 ? 'down' : 'up';
  }

  function niceMax(v) {
    if (!v || v <= 0) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    let f;
    if (n <= 1) f = 1;
    else if (n <= 2) f = 2;
    else if (n <= 5) f = 5;
    else f = 10;
    return f * pow;
  }

  // ---------- 各区块渲染（严格使用 textContent，杜绝对 AI 生成文本做innerHTML 拼接）----------

  function renderHeader(data) {
    const rptName = document.getElementById('rptName');
    rptName.textContent = data.name;
    const codeTag = document.createElement('span');
    codeTag.className = 'code-tag';
    codeTag.textContent = data.code;
    rptName.appendChild(codeTag);

    const subParts = [data.industry, data.listDate ? `${data.listDate} 上市` : '', data.chairman ? `董事长：${data.chairman}` : ''].filter(Boolean);
    document.getElementById('rptSub').textContent = subParts.join(' · ');

    document.getElementById('rptPrice').textContent = data.price;
    const rptPrice = document.getElementById('rptPrice');
    rptPrice.className = 'price ' + signClass(data.changePercent);

    const changeEl = document.getElementById('rptChange');
    const changeNum = parseNum(data.changePercent);
    changeEl.textContent = `${changeNum > 0 ? '+' : ''}${data.changePercent}%`;
    changeEl.className = 'change ' + signClass(data.changePercent);
  }

  function snapCard(label, val) {
    const card = document.createElement('div');
    card.className = 'snap-card';
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'val';
    v.textContent = val == null ? '--' : val;
    card.appendChild(l);
    card.appendChild(v);
    return card;
  }

  function renderSnapshot(data) {
    const grid = document.getElementById('snapshotGrid');
    grid.innerHTML = '';
    const s = data.snapshot || {};
    grid.appendChild(snapCard('市值', s.marketCap));
    grid.appendChild(snapCard('PE(TTM)', s.peTtm));
    grid.appendChild(snapCard('成交额', s.turnover));
    grid.appendChild(snapCard('换手率', s.turnoverRate));
    grid.appendChild(snapCard(`52周高`, s.week52High));
    grid.appendChild(snapCard(`52周低`, s.week52Low));
    document.getElementById('dataNote').textContent = `*以上数据为AI估算，数据截止：${data.dataAsOf ||''}`;
  }

  function renderMedianTable(data) {
    const tbody = document.getElementById('medianTbody');
    tbody.innerHTML = '';
    (data.medianTable || []).forEach((row) => {
      const tr = document.createElement('tr');
      [row.year, row.median, row.high, row.low, row.tradingDays].forEach((val, idx) => {
        const td = document.createElement('td');
        if (idx === 1) td.className = 'highlight';
        td.textContent = val == null ? '--' : val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    const tfoot = document.getElementById('medianTfoot');
    tfoot.innerHTML = '';
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = '5年整体';
    tdLabel.appendChild(strong);
    const tdMedian = document.createElement('td');
    tdMedian.className = 'highlight';
    tdMedian.textContent = data.fiveYearMedian;
    const tdEmpty1 = document.createElement('td');
    tdEmpty1.textContent = '—';
    const tdEmpty2 = document.createElement('td');
    tdEmpty2.textContent = '—';
    const tdEmpty3 = document.createElement('td');
    tdEmpty3.textContent = '—';
    tr.appendChild(tdLabel);
    tr.appendChild(tdMedian);
    tr.appendChild(tdEmpty1);
    tr.appendChild(tdEmpty2);
    tr.appendChild(tdEmpty3);
    tfoot.appendChild(tr);

    document.getElementById('medianNote').textContent = data.medianNote || '';
  }

  function renderProfitTable(data) {
    const tbody = document.getElementById('profitTbody');
    tbody.innerHTML = '';
    (data.profitTable || []).forEach((row) => {
      const tr = document.createElement('tr');
      [row.year, row.netProfit, row.yoy, row.revenue, row.grossMargin, row.roe].forEach((val, idx) => {
        const td = document.createElement('td');
        if (idx === 1) td.className = 'highlight';
        if ((idx === 1 || idx === 2) && typeof val === 'string') {
          td.classList.add(signClass(val));
        }
        td.textContent = val == null ? '--' : val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  // ========== 近五年分红数据 ==========
  function renderDividendSection(data) {
    const section = document.getElementById('dividendSection');
    if (!section) return;
    const table = data.dividendTable || [];
    const summaryEl = document.getElementById('dividendSummary');
    if (summaryEl) {
      summaryEl.textContent = data.dividendSummary || '';
    }
    // 渲染表格
    const tbody = document.querySelector('#dividendTable tbody');
    if (tbody) {
      tbody.innerHTML = '';
      table.forEach((row) => {
        const tr = document.createElement('tr');
        ['year', 'dividendPerShare', 'dividendYield', 'payoutRatio', 'specialDividend'].forEach((key) => {
          const td = document.createElement('td');
          td.textContent = row[key] == null ? '--' : row[key];
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    // 画柱状图（每股分红）— 延后到 showState('report') 之后绘制，
    // 否则容器 clientWidth 为 0，canvas 会被 CSS 拉伸导致变形
  }

  function drawDividendChartLater(data) {
    const table = data.dividendTable || [];
    const canvas = document.getElementById('dividendChart');
    if (canvas && table.length) {
      drawDividendChart(canvas, table);
    }
  }

  // Canvas 圆角矩形辅助函数
  function roundRect(ctx, x, y, w, h, r) {
    if (h <= 0 || w <= 0) return;
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }

  function drawDividendChart(canvas, table) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = (canvas.parentElement && canvas.parentElement.clientWidth) ? canvas.parentElement.clientWidth - 32 : 300;
    const H = 220;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 清空画布
    ctx.clearRect(0, 0, W, H);

    const pad = { t: 30, r: 20, b: 40, l: 50 };
    const cw = Math.max(W - pad.l - pad.r, 100);
    const ch = Math.max(H - pad.t - pad.b, 60);

    // 解析数值
    const vals = table.map((r) => parseNum(r.dividendPerShare));
    const maxVal = Math.max(...vals.map(Math.abs), 0.01);
    const yMax = Math.ceil(maxVal * 1.15 * 10) / 10;

    // 背景网格 + Y轴刻度（从上到下递减）
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.font = '10px SF Mono, Consolas, monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ch * (i / 4);
      const val = yMax * (1 - i / 4);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(val.toFixed(2), pad.l - 6, y + 3);
    }

    // 柱子
    const barW = Math.min(cw / table.length * 0.55, 44);
    const gap = (cw - barW * table.length) / (table.length + 1);
    table.forEach((r, i) => {
      const v = Math.max(0, vals[i]);
      const x = pad.l + gap + i * (barW + gap);
      const barH = (v / yMax) * ch;
      const barY = pad.t + ch - barH;

      if (barH > 0.5) {
        const grad = ctx.createLinearGradient(x, barY, x, pad.t + ch);
        grad.addColorStop(0, '#fbbf24');
        grad.addColorStop(1, '#d97706');
        roundRect(ctx, x, barY, barW, barH, 3);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // 数值标签（柱顶上方）
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 11px SF Mono, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(r.dividendPerShare || '0'), x + barW / 2, barY - 6);

      // 年份（X轴下方）
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(String(r.year || ''), x + barW / 2, pad.t + ch + 18);
    });

    // Y轴标题（竖排）
    ctx.save();
    ctx.translate(14, pad.t + ch / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(251,191,36,0.7)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('每股分红(元)', 0, 0);
    ctx.restore();
  }

  function macroSpan(idx) {
    const span = document.createElement('span');
    const strong = document.createElement('strong');
    strong.className = signClass(idx.changePercent);
    const changeNum = parseNum(idx.changePercent);
    strong.textContent = `${idx.value} ${changeNum > 0 ? '+' : ''}${idx.changePercent}%`;
    span.appendChild(document.createTextNode(`${idx.name} `));
    span.appendChild(strong);
    return span;
  }

  function renderMacro(data) {
    const box = document.getElementById('macroBox');
    box.innerHTML = '';
    const macro = data.macro || {};
    if (Array.isArray(macro.indices) && macro.indices.length) {
      const row = document.createElement('div');
      row.className = 'macro-indices';
      macro.indices.forEach((idx) => row.appendChild(macroSpan(idx)));
      box.appendChild(row);
    }
    const ul = document.createElement('ul');
    ul.className = 'point-list';
    (macro.points || []).forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p;
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function sigClass(text) {
    if (typeof text !== 'string') return '';
    if (text.indexOf('✅') === 0) return 'sig-ok';
    if (text.indexOf('⚠') === 0) return 'sig-warn';
    if (text.indexOf('❌') === 0) return 'sig-bad';
    return '';
  }

  function anchorBlock(label, content) {
    const block = document.createElement('div');
    block.className = 'anchor-block';
    const l = document.createElement('div');
    l.className = 'anchor-label';
    l.textContent = label;
    const c = document.createElement('div');
    c.className = 'anchor-content';
    c.textContent = content;
    block.appendChild(l);
    block.appendChild(c);
    return block;
  }

  const EXPERT_META = {
    trend: { name: '产业趋势派', tag: '· 产业链拆解', icon: '🌊' },
    valuation: { name: '估值派', tag: '· 估值定价', icon: '🧮' },
    fundamental: { name: '基本面派', tag: '· 财报审查', icon: '🔬' },
    signal: { name: '信号派', tag: '· 四层信号', icon: '📡' },
  };
  const SIGNAL_LABELS = { policy: '政策信号', industry: '产业信号', news: '资讯信号', fund: '资金信号' };

  function renderExpertCard(key, expert) {
    const meta = EXPERT_META[key];
    const card = document.createElement('div');
    card.className = `expert-card ${key}`;

    const header = document.createElement('div');
    header.className = 'expert-header';
    const icon = document.createElement('div');
    icon.className = 'expert-icon';
    icon.textContent = meta.icon;
    const nameWrap = document.createElement('div');
    const nameEl = document.createElement('span');
    nameEl.className = 'expert-name';
    nameEl.textContent = meta.name;
    const tagEl = document.createElement('span');
    tagEl.className = 'expert-tag';
    tagEl.textContent = meta.tag;
    nameWrap.appendChild(nameEl);
    nameWrap.appendChild(tagEl);
    header.appendChild(icon);
    header.appendChild(nameWrap);
    card.appendChild(header);

    card.appendChild(anchorBlock('【分析框架】', expert.framework));
    card.appendChild(anchorBlock('【关键数字】', expert.keyNumbers));

    if (key === 'signal' && expert.signals) {
      const grid = document.createElement('div');
      grid.className = 'signal-grid';
      ['policy', 'industry', 'news', 'fund'].forEach((k) => {
        const text = expert.signals[k];
        if (!text) return;
        const div = document.createElement('div');
        div.className = 'sig';
        const cls = sigClass(text);
        div.textContent = `${SIGNAL_LABELS[k]}：${text}`;
        if (cls) div.classList.add(cls);
        grid.appendChild(div);
      });
      card.appendChild(grid);
    }

    const ul = document.createElement('ul');
    ul.className = 'point-list';
    (expert.points || []).forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p;
      ul.appendChild(li);
    });
    card.appendChild(ul);

    const attitude = document.createElement('div');
    attitude.className = `attitude-bar ${expert.attitudeLevel || 'neutral'}`;
    attitude.textContent = expert.attitude;
    card.appendChild(attitude);

    return card;
  }

  function renderRoundtable(data) {
    const box = document.getElementById('roundtableBox');
    box.innerHTML = '';
    const rt = data.roundtable || {};
    ['trend', 'valuation', 'fundamental', 'signal'].forEach((key) => {
      if (rt[key]) box.appendChild(renderExpertCard(key, rt[key]));
    });
  }

  const ATTITUDE_LABELS = {
    bullish: '🔴 看多',
    'neutral-bull': '🟠 中性偏多',
    neutral: '🟡 中性观望',
    watch: '🔵 等待信号',
    bearish: '🟢 看空',
  };

  function summaryItem(key, expert) {
    const meta = EXPERT_META[key];
    const item = document.createElement('div');
    item.className = 'summary-item';
    const label = document.createElement('div');
    label.className = 'si-label';
    label.textContent = `${meta.icon} ${meta.name}`;
    const val = document.createElement('div');
    val.className = 'si-val ' + (expert.attitudeLevel || '');
    val.textContent = ATTITUDE_LABELS[expert.attitudeLevel] || '中性观望';
    const summary = document.createElement('div');
    summary.className = 'si-summary';
    summary.textContent = expert.attitude || '';
    item.appendChild(label);
    item.appendChild(val);
    item.appendChild(summary);
    return item;
  }

  function routeBox(title, buildContent) {
    const box = document.createElement('div');
    box.className = 'route-box';
    const t = document.createElement('div');
    t.className = 'route-title';
    t.textContent = title;
    box.appendChild(t);
    buildContent(box);
    return box;
  }

  function renderSummary(data) {
    const card = document.getElementById('summaryCard');
    card.innerHTML = '';
    const summary = data.summary || {};
    const rt = data.roundtable || {};

    const grid = document.createElement('div');
    grid.className = 'summary-grid';
    ['trend', 'valuation', 'fundamental', 'signal'].forEach((key) => {
      if (rt[key]) grid.appendChild(summaryItem(key, rt[key]));
    });
    card.appendChild(grid);

    card.appendChild(
      routeBox('💡 给小白的一句话', (box) => {
        const p = document.createElement('div');
        p.className = 'big-line';
        p.textContent = summary.oneLineForBeginners || '';
        box.appendChild(p);
      })
    );

    card.appendChild(
      routeBox('🛤️ 操作路线图', (box) => {
        (summary.route || []).forEach((r) => {
          const div = document.createElement('div');
          div.className = 'route-item';
          const strong = document.createElement('strong');
          strong.textContent = r.title;
          div.appendChild(strong);
          div.appendChild(document.createTextNode(`：${r.content}`));
          box.appendChild(div);
        });
      })
    );

    card.appendChild(
      routeBox('🔬 最值得验证的预测', (box) => {
        const div = document.createElement('div');
        div.className = 'route-item';
        div.textContent = summary.keyPrediction || '';
        box.appendChild(div);
      })
    );

    card.appendChild(
      routeBox('⚠️ 最值得重视的风险', (box) => {
        const div = document.createElement('div');
        div.className = 'route-item';
        div.textContent = summary.keyRisk || '';
        box.appendChild(div);
      })
    );
  }

  // ---------- Canvas 图表 ----------

  function setupCanvas(canvas, heightCss) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(rect.width, 260);
    canvas.width = width * dpr;
    canvas.height = heightCss * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = heightCss + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, width, height: heightCss };
  }

  function drawMedianChart(data) {
    const canvas = document.getElementById('medianChart');
    if (!canvas) return;
    const rows = data.medianTable || [];
    if (!rows.length) return;
    const { ctx, width: W, height: H } = setupCanvas(canvas, 200);

    const maxHigh = Math.max.apply(null, rows.map((r) => parseNum(r.high)));
    const maxVal = niceMax(maxHigh * 1.15);
    const pad = { top: 34, right: 14, bottom: 30, left: 42 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const groupW = chartW / rows.length;
    const barW = Math.min(28, groupW * 0.5);

    ctx.strokeStyle = '#2a2d3a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i += 1) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = '#8b8fa3';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), pad.left - 5, y + 3);
    }

    rows.forEach((r, i) => {
      const cx = pad.left + groupW * i + groupW / 2;
      const barX = cx - barW / 2;
      const high = parseNum(r.high);
      const low = parseNum(r.low);
      const median = parseNum(r.median);
      const yHigh = pad.top + chartH * (1 - high / maxVal);
      const yLow = pad.top + chartH * (1 - low / maxVal);
      ctx.fillStyle = 'rgba(79,140,255,0.15)';
      ctx.fillRect(barX, yHigh, barW, Math.max(yLow - yHigh, 1));
      ctx.strokeStyle = 'rgba(79,140,255,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, yHigh, barW, Math.max(yLow - yHigh, 1));

      const yMed = pad.top + chartH * (1 - median / maxVal);
      ctx.fillStyle = '#4f8cff';
      ctx.fillRect(barX + 3, yMed, Math.max(barW - 6, 2), 3);
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(median.toFixed(0), cx, yMed - 5);

      ctx.fillStyle = '#8b8fa3';
      ctx.font = '10px sans-serif';
      ctx.fillText(String(r.year), cx, H - pad.bottom + 16);
    });

    const price = parseNum(data.price);
    const yPrice = pad.top + chartH * (1 - price / maxVal);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#ff4d4f';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pad.left, yPrice);
    ctx.lineTo(W - pad.right, yPrice);
    ctx.stroke();

    const fiveYearMedian = parseNum(data.fiveYearMedian);
    const y5y = pad.top + chartH * (1 - fiveYearMedian / maxVal);
    ctx.setLineDash([6, 3]);
    ctx.strokeStyle = '#fadb14';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y5y);
    ctx.lineTo(W - pad.right, y5y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 参考线图例固定在图表顶部空白区，避免与柱子上的数字标签重叠碰撞
    ctx.textAlign = 'right';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = '#ff4d4f';
    ctx.fillText(`▬ 今日 ${price}`, W - pad.right, 11);
    ctx.fillStyle = '#fadb14';
    ctx.fillText(`▬ 5年中位数 ${fiveYearMedian}`, W - pad.right, 24);
  }

  function drawProfitChart(data) {
    const canvas = document.getElementById('profitChart');
    if (!canvas) return;
    const rows = data.profitTable || [];
    if (!rows.length) return;
    const { ctx, width: W, height: H } = setupCanvas(canvas, 200);

    const values = rows.map((r) => parseNum(r.netProfit));
    const maxAbs = niceMax(Math.max.apply(null, values.map(Math.abs)) * 1.25);
    const pad = { top: 22, right: 14, bottom: 34, left: 42 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const groupW = chartW / rows.length;
    const barW = Math.min(30, groupW * 0.5);
    const zeroY = pad.top + chartH / 2;

    ctx.strokeStyle = '#2a2d3a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(W - pad.right, zeroY);
    ctx.stroke();
    ctx.fillStyle = '#8b8fa3';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('0', pad.left - 5, zeroY + 3);
    ctx.fillText(maxAbs.toFixed(0), pad.left - 5, pad.top + 4);
    ctx.fillText(`-${maxAbs.toFixed(0)}`, pad.left - 5, pad.top + chartH);

    rows.forEach((r, i) => {
      const cx = pad.left + groupW * i + groupW / 2;
      const barX = cx - barW / 2;
      const val = parseNum(r.netProfit);
      const barH = (Math.abs(val) / maxAbs) * (chartH / 2);
      const positive = val >= 0;
      ctx.fillStyle = positive ? '#ff4d4f' : '#52c41a';
      if (positive) {
        ctx.fillRect(barX, zeroY - barH, barW, barH);
      } else {
        ctx.fillRect(barX, zeroY, barW, barH);
      }
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(r.netProfit, cx, positive ? zeroY - barH - 5 : zeroY + barH + 12);

      ctx.fillStyle = '#8b8fa3';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(r.year), cx, H - pad.bottom + 15);

      const yoyNum = parseNum(r.yoy);
      ctx.font = '9px sans-serif';
      ctx.fillStyle = yoyNum < 0 ? '#52c41a' : '#ff4d4f';
      ctx.fillText(r.yoy || '', cx, H - pad.bottom + 27);
    });
  }

  // ---------- 加载与流程控制 ----------

  async function loadAnalysis() {
    if (!code || !name) {
      errorMsgEl.textContent = '缺少股票信息，请返回重新求票后再查看分析';
      retryBtn.classList.add('hidden');
      showState('error');
      return;
    }
    showState('loading');
    try {
      const qs = new URLSearchParams({ code, name, market: market || 'A股' }).toString();
      const data = await QYP.api(`api/analysis?${qs}`, { method: 'GET' });
      renderHeader(data);
      renderSnapshot(data);
      renderMedianTable(data);
      renderProfitTable(data);
      renderDividendSection(data);
      renderMacro(data);
      renderRoundtable(data);
      renderSummary(data);
      document.getElementById('disclaimerText').textContent = `⚠️ ${data.disclaimer || ''}`;
      showState('report');
      requestAnimationFrame(() => {
        drawMedianChart(data);
        drawProfitChart(data);
        drawDividendChartLater(data);
      });
      window.addEventListener('resize', () => {
        drawMedianChart(data);
        drawProfitChart(data);
        drawDividendChartLater(data);
      });
    } catch (err) {
      errorMsgEl.textContent = (err && err.message) || '分析生成失败，请重试';
      retryBtn.classList.remove('hidden');
      showState('error');
    }
  }

  retryBtn.addEventListener('click', loadAnalysis);

  loadAnalysis();
})();
