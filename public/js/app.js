'use strict';

(function () {
  // ========== 导航侧边栏 ==========
  const menuBtn = document.getElementById('menuBtn');
  const navDrawer = document.getElementById('navDrawer');
  const navOverlay = document.getElementById('navOverlay');

  function openNav() {
    navDrawer.classList.add('open');
    navOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeNav() {
    navDrawer.classList.remove('open');
    navOverlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  menuBtn.addEventListener('click', openNav);
  navOverlay.addEventListener('click', closeNav);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navDrawer.classList.contains('open')) closeNav();
  });

  // ========== 老虎机元素 ==========
  const slotWrapper = document.getElementById('slotWrapper');
  const slotArea = document.getElementById('slotArea');
  const slotLights = document.getElementById('slotLights');
  const digits = Array.from(slotArea.querySelectorAll('.slot-digit'));
  const resultCard = document.getElementById('resultCard');
  const resultName = document.getElementById('resultName');
  const resultCode = document.getElementById('resultCode');
  const resultPrice = document.getElementById('resultPrice');
  const resultReason = document.getElementById('resultReason');
  const constraintSelect = document.getElementById('constraintSelect');
  const sectorSelect = document.getElementById('sectorSelect');
  const tagsSection = document.getElementById('tagsSection');
  const drawBtn = document.getElementById('drawBtn');
  const saveBtn = document.getElementById('saveBtn');
  const confettiContainer = document.getElementById('confettiContainer');
  const reasonModal = document.getElementById('reasonModal');
  const reasonModalBody = document.getElementById('reasonModalBody');
  const reasonModalClose = document.getElementById('reasonModalClose');

  let lastResult = null;
  let lightChaseTimer = null;
  let rollingTimers = [];

  // ---------- 初始化顶部装饰灯条 ----------
  function initSlotLights() {
    slotLights.innerHTML = '';
    for (let i = 0; i < 12; i++) {
      const dot = document.createElement('div');
      dot.className = 'slot-light-dot';
      slotLights.appendChild(dot);
    }
  }
  initSlotLights();

  // ---------- 灯条追逐动画 ----------
  function startLightChase() {
    stopLightChase();
    const dots = slotLights.querySelectorAll('.slot-light-dot');
    let idx = 0;
    function chase() {
      dots.forEach((d, i) => d.classList.remove('lit'));
      if (dots[idx]) dots[idx].classList.add('lit');
      idx = (idx + 1) % dots.length;
      lightChaseTimer = setTimeout(chase, 60);
    }
    chase();
  }

  function stopLightChase() {
    if (lightChaseTimer) {
      clearTimeout(lightChaseTimer);
      lightChaseTimer = null;
    }
    slotLights.querySelectorAll('.slot-light-dot').forEach(d => d.classList.remove('lit'));
  }

  // 空闲时缓慢闪烁
  function idleLightBlink() {
    stopLightChase();
    const dots = slotLights.querySelectorAll('.slot-light-dot');
    let idx = 0;
    function blink() {
      dots.forEach(d => d.classList.remove('lit'));
      if (dots[idx]) dots[idx].classList.add('lit');
      idx = (idx + 1) % dots.length;
      lightChaseTimer = setTimeout(blink, 400 + Math.random() * 300);
    }
    blink();
  }
  idleLightBlink();

  // ---------- 数字设置 ----------
  function setDigits(text) {
    const padded = (text || '------').padEnd(6, '-').slice(0, 6).split('');
    digits.forEach((d, i) => { d.textContent = padded[i] || '-'; });
  }

  // ---------- 摇号中动画文案（DOM 构建，不用 innerHTML）----------
  function renderRollingText() {
    resultName.textContent = '';
    const wrap = document.createElement('span');
    wrap.className = 'rolling-text';

    '摇号中'.split('').forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'rt-char';
      s.textContent = ch;
      s.style.animationDelay = `${i * 0.12}s`;
      wrap.appendChild(s);
    });

    const dots = document.createElement('span');
    dots.className = 'rt-dots';
    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement('i');
          dot.style.animationDelay = `${i * 0.18}s`;
      dots.appendChild(dot);
    }
    wrap.appendChild(dots);

    resultName.appendChild(wrap);
  }

  // ---------- 开始滚动 ----------
  function startRolling() {
    // 清除之前的定时器
    rollingTimers.forEach(t => clearInterval(t));
    rollingTimers = [];

    digits.forEach((d) => {
      d.classList.remove('stopped');
      d.classList.add('rolling');
    });

    resultCard.classList.remove('has-result');
    resultCard.classList.add('drawing');
    slotWrapper.classList.remove('jackpot');
    slotWrapper.classList.add('shaking');
    startLightChase();

    renderRollingText();
    resultCode.textContent = '------';
    resultPrice.textContent = '';
    resultReason.textContent = '';
    tagsSection.innerHTML = '';
    saveBtn.disabled = true;
    lastResult = null;

    // 快速随机滚动
    digits.forEach((d) => {
      const t = setInterval(() => {
        d.textContent = String(Math.floor(Math.random() * 10));
      }, 50);
      rollingTimers.push(t);
    });
  }

  // ---------- 停止滚动（逐列弹性停止）----------
  function stopRolling(finalText) {
    slotWrapper.classList.remove('shaking');
    stopLightChase();

    // 清除快速滚动定时器
    rollingTimers.forEach(t => clearInterval(t));
    rollingTimers = [];

    const chars = (finalText || '').padEnd(6, '-').slice(0, 6).split('');

    chars.forEach((ch, i) => {
      const d = digits[i];
      if (!d) return;

      // 每列延迟递增，从左到右依次停止
      const delay = i * 280; // 每列间隔 280ms
      const rollDuration = 800 + i * 200; // 越右边的列滚得越久

      setTimeout(() => {
        let count = 0;
        const maxCount = Math.floor(rollDuration / 55);

        const interval = setInterval(() => {
          d.textContent = String(Math.floor(Math.random() * 10));
          count++;
          if (count >= maxCount) {
            clearInterval(interval);
            // 最终定格
            d.classList.remove('rolling');
            d.classList.add('stopped');
            d.textContent = ch || '-';
            // 移除 stopped 类（保留动画效果）
            setTimeout(() => d.classList.remove('stopped'), 400);
          }
        }, 55);
      }, delay);
    });
  }

  // ---------- 庆祝粒子效果 ----------
  function fireConfetti() {
    const colors = ['#ff3b3b', '#ff2020', '#ffd700', '#ff6b6b', '#ff4444', '#ffaa00', '#ff8800'];
    const container = confettiContainer;
    container.innerHTML = '';

    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = '-10px';
      p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      p.style.width = (5 + Math.random() * 8) + 'px';
      p.style.height = (5 + Math.random() * 8) + 'px';
      p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      p.style.animationDuration = (1.5 + Math.random() * 2) + 's';
      p.style.animationDelay = (Math.random() * 0.6) + 's';
      container.appendChild(p);
    }

    // 清理
    setTimeout(() => { container.innerHTML = ''; }, 4000);
  }

  // ---------- 显示结果 ----------
  function showResult(data) {
    // 触发中奖庆祝
    slotWrapper.classList.add('jackpot');
    fireConfetti();

    resultCard.classList.remove('drawing');
    resultCard.classList.add('has-result');
    resultName.textContent = data.name || '--';
    resultCode.textContent = data.code || '--';

    // 股价 + 货币单位 + 涨跌幅（红涨绿跌）+ 实时标识
    let priceHtml = '';
    if (data.price) {
      priceHtml = `${data.price}<span class="unit">${data.priceUnit || '元'}</span>`;
      if (data.changePercent != null && !Number.isNaN(Number(data.changePercent))) {
        const cp = Number(data.changePercent);
        const cls = cp > 0 ? 'up' : (cp < 0 ? 'down' : 'flat');
        const sign = cp > 0 ? '+' : '';
        priceHtml += ` <span class="change ${cls}">${sign}${cp.toFixed(2)}%</span>`;
      }
      if (data.priceSource === 'realtime') {
        priceHtml += ' <span class="realtime-badge">实时</span>';
      }
    }
    resultPrice.innerHTML = priceHtml;
    resultReason.textContent = data.summaryReason || '';

    // 点击提示
    const existingHint = document.getElementById('detailHint');
    if (existingHint) existingHint.remove();
    const hint = document.createElement('div');
    hint.id = 'detailHint';
    hint.style.cssText = 'margin-top:14px;font-size:12px;color:var(--text-muted);text-align:center;display:flex;align-items:center;justify-content:center;gap:5px;';
    hint.innerHTML = '<span style="font-size:15px;">👆</span> 点击卡片查看深度分析报告';
    resultCard.appendChild(hint);

    tagsSection.innerHTML = '';
    if (Array.isArray(data.tags) && data.tags.length) {
      tagsSection.style.display = '';
      data.tags.forEach((t) => {
        const s = document.createElement('span');
        s.className = 'tag-chip';
        s.textContent = t;
        tagsSection.appendChild(s);
      });
    } else {
      tagsSection.style.display = 'none';
    }

    saveBtn.disabled = false;
    lastResult = data;

    // 恢复空闲灯效
    setTimeout(idleLightBlink, 2000);
  }

  // ---------- 推荐理由点击弹框 ----------
  function openReasonModal(text) {
    if (!text) return;
    reasonModalBody.textContent = text;
    reasonModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeReasonModal() {
    reasonModal.classList.add('hidden');
    document.body.style.overflow = '';
  }
  resultReason.addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止冒泡到卡片跳转
    const text = (lastResult && lastResult.summaryReason) || resultReason.textContent;
    if (text) openReasonModal(text);
  });
  reasonModalClose.addEventListener('click', closeReasonModal);
  reasonModal.querySelector('.modal-mask').addEventListener('click', closeReasonModal);

  // ---------- 点击结果卡片查看深度分析 ----------
  resultCard.addEventListener('click', () => {
    if (!lastResult || !lastResult.code) return;
    const params = new URLSearchParams({
      code: lastResult.code,
      name: lastResult.name || '',
      market: lastResult.market || 'A股',
    });
    window.location.href = 'analysis.html?' + params.toString();
  });

  // ---------- 摇一摇请求 ----------
  async function handleDraw() {
    drawBtn.classList.add('btn-loading');
    drawBtn.disabled = true;
    startRolling();

    try {
      const constraints = {};
      const v = (constraintSelect.value || '').trim();
      if (v) constraints.market = v;
      const s = (sectorSelect.value || '').trim();
      if (s) constraints.sector = s;

      const resp = await QYP.api('api/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ constraints }),
      });

      // 先停止老虎机滚动（带动画），再显示结果
      stopRolling(resp.code || '');
      // 等待所有数字停止后显示结果（最后一列延迟约 1400ms + 滚动时间）
      setTimeout(() => showResult(resp), 2200);
    } catch (err) {
      // 出错恢复
      rollingTimers.forEach(t => clearInterval(t));
      rollingTimers = [];
      digits.forEach((d) => {
        d.classList.remove('rolling', 'stopped');
      });
      slotWrapper.classList.remove('shaking', 'jackpot');
      resultCard.classList.remove('drawing');
      stopLightChase();
      idleLightBlink();

      setDigits('ERR!!!');
      resultName.textContent = '请求失败';
      resultReason.textContent = err && err.message ? err.message : '网络异常，请稍后重试';
      QYP.toast(err && err.message ? err.message : '请求失败');
    } finally {
      drawBtn.classList.remove('btn-loading');
      drawBtn.disabled = false;
    }
  }

  drawBtn.addEventListener('click', () => {
    closeNav();
    handleDraw();
  });

  // ========== 保存结果 ==========
  saveBtn.addEventListener('click', async () => {
    if (!lastResult) return;
    try {
      await QYP.api('api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastResult),
      });
      QYP.toast('已保存到记录');
      saveBtn.disabled = true;
    } catch (err) {
      QYP.toast(err && err.message ? err.message : '保存失败');
    }
  });
})();
