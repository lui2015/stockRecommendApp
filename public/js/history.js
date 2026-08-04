'use strict';

(function () {
  const listEl = document.getElementById('historyList');
  const emptyEl = document.getElementById('historyEmpty');

  const detailModal = document.getElementById('detailModal');
  const modalMask = document.getElementById('modalMask');
  const modalClose = document.getElementById('modalClose');
  const roundtableListEl = document.getElementById('roundtableList');
  const risksListEl = document.getElementById('risksList');

  function openDetailModal(item) {
    const { roundtable = [], risks = [] } = item.reasonDetail || {};
    roundtableListEl.innerHTML = '';
    roundtable.forEach((r) => {
      const div = document.createElement('div');
      div.className = 'roundtable-item';
      const master = document.createElement('div');
      master.className = 'roundtable-master';
      master.textContent = r.master;
      const viewpoint = document.createElement('div');
      viewpoint.className = 'roundtable-viewpoint';
      viewpoint.textContent = r.viewpoint;
      div.appendChild(master);
      div.appendChild(viewpoint);
      roundtableListEl.appendChild(div);
    });
    risksListEl.innerHTML = '';
    risks.forEach((r) => {
      const li = document.createElement('li');
      li.textContent = r;
      risksListEl.appendChild(li);
    });
    detailModal.classList.remove('hidden');
  }

  modalClose.addEventListener('click', () => detailModal.classList.add('hidden'));
  modalMask.addEventListener('click', () => detailModal.classList.add('hidden'));

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return iso;
    }
  }

  function renderItem(item) {
    const div = document.createElement('div');
    div.className = 'history-item';

    const top = document.createElement('div');
    top.className = 'history-item-top';
    const name = document.createElement('span');
    name.className = 'history-item-name';
    name.textContent = item.name;
    const time = document.createElement('span');
    time.className = 'history-item-time';
    time.textContent = formatTime(item.savedAt);
    top.appendChild(name);
    top.appendChild(time);

    const code = document.createElement('div');
    code.className = 'history-item-code';
    code.textContent = item.price ? `${item.code} · ${item.price} ${item.priceUnit || '元'}` : item.code;

    const tags = document.createElement('div');
    tags.className = 'history-item-tags';
    (item.tags || []).forEach((t) => {
      const span = document.createElement('span');
      span.className = 'tag-chip';
      span.textContent = t;
      tags.appendChild(span);
    });

    const summary = document.createElement('p');
    summary.style.fontSize = '13px';
    summary.style.color = '#5a4a44';
    summary.textContent = item.summaryReason || '';

    const actions = document.createElement('div');
    actions.className = 'history-item-actions';
    const detailBtn = document.createElement('button');
    detailBtn.textContent = '查看理由';
    detailBtn.addEventListener('click', () => openDetailModal(item));
    const delBtn = document.createElement('button');
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => removeItem(item.historyId, div));
    actions.appendChild(detailBtn);
    actions.appendChild(delBtn);

    div.appendChild(top);
    div.appendChild(code);
    div.appendChild(tags);
    div.appendChild(summary);
    div.appendChild(actions);
    return div;
  }

  async function removeItem(historyId, el) {
    if (!confirm('确定删除这条求票记录吗？')) return;
    try {
      await QYP.api(`api/history/${historyId}`, { method: 'DELETE' });
      el.remove();
      if (!listEl.children.length) emptyEl.classList.remove('hidden');
      QYP.toast('已删除');
    } catch (err) {
      QYP.toast(err.message || '删除失败');
    }
  }

  async function loadHistory() {
    try {
      const data = await QYP.api('api/history?limit=50');
      listEl.innerHTML = '';
      if (!data.items || !data.items.length) {
        emptyEl.classList.remove('hidden');
        return;
      }
      emptyEl.classList.add('hidden');
      data.items.forEach((item) => listEl.appendChild(renderItem(item)));
    } catch (err) {
      QYP.toast(err.message || '加载失败');
    }
  }

  loadHistory();
})();
