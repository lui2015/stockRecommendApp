'use strict';

(function () {
  const favList = document.getElementById('favList');
  const favLoading = document.getElementById('favLoading');
  const favEmpty = document.getElementById('favEmpty');

  // ========== 加载自选列表 ==========
  async function loadFavorites() {
    showState('loading');
    try {
      const resp = await QYP.api('api/favorites');
      const items = (resp && resp.items) || [];

      if (!items.length) {
        showState('empty');
        return;
      }

      showState('list');
      renderList(items);
    } catch (err) {
      QYP.toast(err && err.message ? err.message : '加载失败');
      showState('empty');
    }
  }

  function renderList(items) {
    favList.innerHTML = '';
    items.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'fav-item';
      el.dataset.code = item.code;

      const timeAgo = formatTimeAgo(item.addedAt);

      // 价格区域
      let priceHtml = '';
      if (item.refPrice != null) {
        priceHtml += `<span class="fav-item-ref-price">${Number(item.refPrice).toFixed(2)}</span>`;
        if (item.realtimePrice != null) {
          const diff = Number(item.realtimePrice) - Number(item.refPrice);
          const diffPct = Number(item.refPrice) > 0 ? (diff / Number(item.refPrice) * 100) : 0;
          const diffClass = diff >= 0 ? 'price-up' : 'price-down';
          const diffSign = diff >= 0 ? '+' : '';
          priceHtml += `
            <span class="fav-price-arrow">→</span>
            <span class="fav-item-real-price ${diffClass}">${Number(item.realtimePrice).toFixed(2)}</span>
            ${item.changePercent != null ? `<span class="fav-item-change ${diffClass}">(${diffSign}${Number(item.changePercent).toFixed(2)}%)</span>` : ''}
            <span class="fav-item-diff ${diffClass}">${diffSign}${diff.toFixed(2)} (${diffSign}${diffPct.toFixed(2)}%)</span>
          `;
        }
      }

      el.innerHTML = `
        <div class="fav-item-info">
          <div class="fav-item-name">${escapeHtml(item.name)}</div>
          <div class="fav-item-meta">
            <span class="fav-item-code">${escapeHtml(item.code)}</span>
            <span class="fav-item-market">${escapeHtml(item.market || 'A股')}</span>
            <span class="fav-item-time">${timeAgo}</span>
          </div>
          ${priceHtml ? `<div class="fav-item-prices">${priceHtml}</div>` : ''}
        </div>
        <div class="fav-item-actions">
          <button class="fav-item-btn fav-item-btn-analyze" data-code="${escapeHtml(item.code)}" data-name="${escapeHtml(item.name)}">深度分析</button>
          <button class="fav-item-btn fav-item-btn-remove" data-code="${escapeHtml(item.code)}" data-name="${escapeHtml(item.name)}">移除</button>
        </div>
      `;

      // 深度分析按钮
      el.querySelector('.fav-item-btn-analyze').addEventListener('click', () => {
        window.location.href = `analysis.html?code=${encodeURIComponent(item.code)}&name=${encodeURIComponent(item.name)}`;
      });

      // 移除按钮
      el.querySelector('.fav-item-btn-remove').addEventListener('click', async () => {
        if (!confirm(`确定移除「${item.name}」(${item.code}) 吗？`)) return;
        try {
          await QYP.api(`api/favorites/${encodeURIComponent(item.code)}`, { method: 'DELETE' });
          el.style.transition = 'all 0.3s ease';
          el.style.opacity = '0';
          el.style.transform = 'translateX(20px)';
          setTimeout(() => {
            el.remove();
            if (!favList.children.length) showState('empty');
          }, 300);
          QYP.toast('已移除');
        } catch (err) {
          QYP.toast(err && err.message ? err.message : '移除失败');
        }
      });

      favList.appendChild(el);
    });
  }

  // ========== 状态切换 ==========
  function showState(state) {
    favLoading.classList.toggle('hidden', state !== 'loading');
    favEmpty.classList.toggle('hidden', state !== 'empty');
    favList.classList.toggle('hidden', state !== 'list');
  }

  // ========== 工具函数 ==========
  function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatTimeAgo(isoStr) {
    if (!isoStr) return '';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    return `${Math.floor(days / 30)}个月前`;
  }

  // ========== 初始化 ==========
  loadFavorites();
})();
