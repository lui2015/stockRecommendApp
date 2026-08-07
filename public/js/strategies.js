'use strict';

(function () {
  // ========== 导航侧边栏 ==========
  const menuBtn = document.getElementById('menuBtn');
  const navDrawer = document.getElementById('navDrawer');
  const navOverlay = document.getElementById('navOverlay');

  function openNav() {
    navDrawer.classList.add('open');
    navOverlay.classList.add('show');
  }
  function closeNav() {
    navDrawer.classList.remove('open');
    navOverlay.classList.remove('show');
  }
  if (menuBtn) menuBtn.addEventListener('click', openNav);
  if (navOverlay) navOverlay.addEventListener('click', closeNav);

  // ========== 元素引用 ==========
  const stgCatBar = document.getElementById('stgCatBar');
  const stgLoading = document.getElementById('stgLoading');
  const stgGroups = document.getElementById('stgGroups');
  const stgCount = document.getElementById('stgCount');

  const stgModal = document.getElementById('stgModal');
  const stgModalMask = document.getElementById('stgModalMask');
  const stgModalClose = document.getElementById('stgModalClose');
  const stgDetail = document.getElementById('stgDetail');
  const stgForm = document.getElementById('stgForm');
  const stgRunning = document.getElementById('stgRunning');
  const stgRunSubtext = document.getElementById('stgRunSubtext');
  const stgResult = document.getElementById('stgResult');
  const stgRunBtn = document.getElementById('stgRunBtn');

  let categories = [];
  let strategies = [];
  let activeCat = 'all';
  let currentStrategy = null;
  let runSubtextTimer = null;

  const esc = (s) => QYP.escapeHtml(s == null ? '' : String(s));

  // ========== 加载策略库 ==========
  async function loadStrategies() {
    try {
      const resp = await QYP.api('api/strategies');
      categories = (resp && resp.categories) || [];
      strategies = (resp && resp.strategies) || [];

      stgCount.textContent = strategies.length;
      renderCatBar();
      renderGroups();

      stgLoading.classList.add('hidden');
      stgGroups.classList.remove('hidden');
    } catch (err) {
      stgLoading.innerHTML = '<p>策略库加载失败，请刷新重试</p>';
      QYP.toast(err && err.message ? err.message : '加载失败');
    }
  }

  // ========== 分类筛选条 ==========
  function renderCatBar() {
    const chips = [{ id: 'all', name: '全部', icon: '🗂️' }].concat(categories);
    stgCatBar.innerHTML = chips
      .map(
        (c) =>
          `<button class="stg-cat-chip${c.id === activeCat ? ' active' : ''}" data-cat="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</button>`
      )
      .join('');

    stgCatBar.querySelectorAll('.stg-cat-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCat = btn.dataset.cat;
        renderCatBar();
        renderGroups();
      });
    });
  }

  // ========== 策略分组列表 ==========
  function renderGroups() {
    const shown = activeCat === 'all' ? categories : categories.filter((c) => c.id === activeCat);

    stgGroups.innerHTML = shown
      .map((cat) => {
        const list = strategies.filter((s) => s.category === cat.id);
        if (!list.length) return '';
        return `
          <section class="stg-group">
            <div class="stg-group-head">
              <span class="stg-group-icon">${esc(cat.icon)}</span>
              <span class="stg-group-name">${esc(cat.name)}</span>
              <span class="stg-group-count">${list.length} 种</span>
            </div>
            <p class="stg-group-desc">${esc(cat.desc)}</p>
            <div class="stg-cards">
              ${list.map(cardHtml).join('')}
            </div>
          </section>`;
      })
      .join('');

    stgGroups.querySelectorAll('.stg-card').forEach((card) => {
      card.addEventListener('click', () => openStrategy(card.dataset.id));
    });
  }

  function cardHtml(s) {
    return `
      <div class="stg-card" data-id="${esc(s.id)}">
        <div class="stg-card-head">
          <span class="stg-card-icon">${esc(s.icon)}</span>
          <span class="stg-card-name">${esc(s.name)}</span>
        </div>
        <p class="stg-card-tagline">${esc(s.tagline)}</p>
        <div class="stg-card-meta">
          <span class="stg-meta-item">⏳ ${esc(s.horizon)}</span>
          <span class="stg-meta-item stg-diff">${'★'.repeat(s.difficulty)}${'☆'.repeat(5 - s.difficulty)}</span>
        </div>
        <div class="stg-card-cta">查看攻略并按此选股 →</div>
      </div>`;
  }

  // ========== 打开策略详情 ==========
  function openStrategy(id) {
    const s = strategies.find((x) => x.id === id);
    if (!s) return;
    currentStrategy = s;

    stgDetail.innerHTML = `
      <div class="stg-detail-head">
        <span class="stg-detail-icon">${esc(s.icon)}</span>
        <span class="stg-detail-name">${esc(s.name)}</span>
      </div>
      <p class="stg-detail-tagline">${esc(s.tagline)}</p>
      <div class="stg-detail-badges">
        <span class="stg-badge">⏳ ${esc(s.horizon)}</span>
        <span class="stg-badge">难度 ${'★'.repeat(s.difficulty)}${'☆'.repeat(5 - s.difficulty)}</span>
        <span class="stg-badge">👤 ${esc((s.masters || []).join('、'))}</span>
      </div>

      <div class="stg-sec">
        <div class="stg-sec-title">💡 核心逻辑</div>
        <div class="stg-sec-body">${esc(s.core)}</div>
      </div>

      <div class="stg-sec">
        <div class="stg-sec-title">📐 关键指标</div>
        <ul class="stg-sec-list">${(s.indicators || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      </div>

      <div class="stg-sec">
        <div class="stg-sec-title">🪜 执行步骤</div>
        <ul class="stg-sec-list">${(s.steps || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      </div>

      <div class="stg-sec">
        <div class="stg-sec-title">🎯 适合谁 / 什么行情</div>
        <div class="stg-sec-body">${esc(s.suitable)}</div>
      </div>

      <div class="stg-sec stg-sec-risk">
        <div class="stg-sec-title">⚠️ 主要风险与失效场景</div>
        <div class="stg-sec-body">${esc(s.risk)}</div>
      </div>`;

    // 重置为表单态
    stgForm.classList.remove('hidden');
    stgRunning.classList.add('hidden');
    stgResult.classList.add('hidden');
    stgResult.innerHTML = '';

    stgModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    stgModal.querySelector('.modal-content').scrollTop = 0;
  }

  function closeModal() {
    stgModal.classList.add('hidden');
    document.body.style.overflow = '';
    stopRunSubtext();
  }
  stgModalClose.addEventListener('click', closeModal);
  stgModalMask.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !stgModal.classList.contains('hidden')) closeModal();
  });

  // ========== 选股中的滚动文案 ==========
  const RUN_STEPS = [
    '对照关键指标，评估匹配度',
    '筛查基本面数据与财务质量',
    '扫描近期消息面与催化剂',
    '核对技术形态与量价关系',
    '汇总风险提示与操作建议',
  ];
  function startRunSubtext() {
    stopRunSubtext();
    let i = 0;
    runSubtextTimer = setInterval(() => {
      i = (i + 1) % RUN_STEPS.length;
      stgRunSubtext.style.opacity = '0';
      setTimeout(() => {
        stgRunSubtext.textContent = RUN_STEPS[i];
        stgRunSubtext.style.opacity = '0.75';
      }, 260);
    }, 2600);
  }
  function stopRunSubtext() {
    if (runSubtextTimer) { clearInterval(runSubtextTimer); runSubtextTimer = null; }
  }

  // ========== 按策略选股 ==========
  stgRunBtn.addEventListener('click', async () => {
    if (!currentStrategy) return;

    const options = {
      market: document.getElementById('stgMarket').value || undefined,
      cap: document.getElementById('stgCap').value || undefined,
      horizon: document.getElementById('stgHorizon').value || undefined,
      risk: document.getElementById('stgRisk').value || undefined,
      sector: document.getElementById('stgSector').value.trim() || undefined,
      extra: document.getElementById('stgExtra').value.trim() || undefined,
    };

    stgForm.classList.add('hidden');
    stgResult.classList.add('hidden');
    stgRunning.classList.remove('hidden');
    stgRunSubtext.textContent = RUN_STEPS[0];
    startRunSubtext();

    try {
      const resp = await QYP.api('api/strategy-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: currentStrategy.id, options }),
      });
      renderResult(resp);
    } catch (err) {
      stgRunning.classList.add('hidden');
      stgForm.classList.remove('hidden');
      QYP.toast(err && err.message ? err.message : '选股失败，请稍后重试');
    } finally {
      stopRunSubtext();
    }
  });

  // ========== 渲染选股结果 ==========
  function renderResult(d) {
    stgRunning.classList.add('hidden');

    const cp = d.changePercent != null ? Number(d.changePercent) : null;
    const cpCls = cp == null ? 'flat' : (cp > 0 ? 'up' : (cp < 0 ? 'down' : 'flat'));
    const cpTxt = cp == null ? '' : `${cp > 0 ? '+' : ''}${cp.toFixed(2)}%`;

    const matchMark = (m) => (m === '满足' ? '✅' : (m === '不满足' ? '❌' : '➖'));
    const matchCls = (m) => (m === '满足' ? 'ok' : (m === '不满足' ? 'no' : 'part'));

    stgResult.innerHTML = `
      <div class="stg-res-card">
        <div class="stg-res-top">
          <div>
            <div class="stg-res-name">${esc(d.name)}</div>
            <div class="stg-res-codes">
              <span class="stg-res-code">${esc(d.code)}</span>
              <span class="stg-res-price">${esc(d.price)}<span class="unit">${esc(d.priceUnit)}</span></span>
              ${cpTxt ? `<span class="stg-res-chg ${cpCls}">${esc(cpTxt)}</span>` : ''}
              ${d.priceSource === 'realtime' ? '<span class="stg-res-live">实时</span>' : ''}
            </div>
          </div>
          <div class="stg-fit">
            <div class="stg-fit-ring" style="--pct:${Number(d.strategyFitScore) || 80}%"><span>${Number(d.strategyFitScore) || 80}</span></div>
            <div class="stg-fit-label">策略匹配度</div>
          </div>
        </div>

        ${(d.tags || []).length ? `<div class="stg-res-tags">${d.tags.map((t) => `<span class="stg-res-tag">${esc(t)}</span>`).join('')}</div>` : ''}

        <div class="stg-res-reason">${esc(d.summaryReason)}</div>
      </div>

      ${(d.fitPoints || []).length ? `
      <div class="stg-sec">
        <div class="stg-sec-title">📐 指标逐条匹配</div>
        <div class="stg-fitlist">
          ${d.fitPoints.map((p) => `
            <div class="stg-fitrow">
              <span class="stg-fitrow-mark">${matchMark(p.match)}</span>
              <div class="stg-fitrow-body">
                <div class="stg-fitrow-ind">${esc(p.indicator)}</div>
                <div class="stg-fitrow-act">${esc(p.actual)}</div>
              </div>
              <span class="stg-fitrow-badge ${matchCls(p.match)}">${esc(p.match)}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${(d.actionPlan || []).length ? `
      <div class="stg-sec">
        <div class="stg-sec-title">🪜 操作建议</div>
        <ul class="stg-sec-list">${d.actionPlan.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      </div>` : ''}

      ${(d.risks || []).length ? `
      <div class="stg-sec stg-sec-risk">
        <div class="stg-sec-title">⚠️ 风险提示</div>
        <ul class="stg-sec-list">${d.risks.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>` : ''}

      <div class="stg-res-actions">
        <a class="stg-res-btn stg-res-btn-primary" id="stgGoAnalysis">📊 深度分析</a>
        <button class="stg-res-btn stg-res-btn-ghost" id="stgAddFav">☆ 加入自选</button>
        <button class="stg-res-btn stg-res-btn-ghost" id="stgRetry">🔄 换一只</button>
      </div>

      <p class="disclaimer" style="margin-top:14px;">${esc(d.disclaimer)}</p>`;

    stgResult.classList.remove('hidden');
    stgModal.querySelector('.modal-content').scrollTop = 0;

    // 深度分析
    const params = new URLSearchParams({ code: d.code, name: d.name, market: d.market || 'A股' });
    document.getElementById('stgGoAnalysis').href = 'analysis.html?' + params.toString();

    // 加入自选
    const favBtn = document.getElementById('stgAddFav');
    checkFav(d.code, favBtn);
    favBtn.addEventListener('click', () => toggleFav(d, favBtn));

    // 换一只
    document.getElementById('stgRetry').addEventListener('click', () => stgRunBtn.click());
  }

  // ========== 自选 ==========
  async function checkFav(code, btn) {
    try {
      const r = await QYP.api(`api/favorites/check/${encodeURIComponent(code)}`);
      setFavUI(btn, !!r.isFavorite);
    } catch (e) { /* 静默 */ }
  }

  function setFavUI(btn, on) {
    btn.dataset.on = on ? '1' : '0';
    btn.textContent = on ? '★ 已自选' : '☆ 加入自选';
    btn.classList.toggle('favorited', on);
  }

  async function toggleFav(d, btn) {
    const on = btn.dataset.on === '1';
    try {
      if (on) {
        await QYP.api(`api/favorites/${encodeURIComponent(d.code)}`, { method: 'DELETE' });
        setFavUI(btn, false);
        QYP.toast('已取消自选');
      } else {
        await QYP.api('api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: d.code, name: d.name, market: d.market || 'A股', price: d.price }),
        });
        setFavUI(btn, true);
        QYP.toast('已加入自选 ★');
      }
    } catch (err) {
      QYP.toast(err && err.message ? err.message : '操作失败');
    }
  }

  // ========== 初始化 ==========
  loadStrategies();
})();
