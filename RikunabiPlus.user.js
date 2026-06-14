// ==UserScript==
// @name         Rikunabi Plus
// @namespace    https://job.rikunabi.com/
// @version      1.4.0
// @author       yonagatsuki
// @description  リクナビの求人検索ページをより便利にするユーザースクリプトです
// @homepageURL  https://github.com/yonagatsuki/Rikunabi-Plus
// @supportURL   https://github.com/yonagatsuki/Rikunabi-Plus/issues
// @updateURL    https://raw.githubusercontent.com/yonagatsuki/Rikunabi-Plus/main/RikunabiPlus.user.js
// @downloadURL  https://raw.githubusercontent.com/yonagatsuki/Rikunabi-Plus/main/RikunabiPlus.user.js
// @match        https://job.rikunabi.com/*/job_search/*
// @match        https://job.rikunabi.com/*/company_search/*
// @match        https://job.rikunabi.com/*/search/*
// @match        https://job.rikunabi.com/selection/job_search/*
// @grant        GM_xmlhttpRequest
// @connect      job.rikunabi.com
// ==/UserScript==

(() => {
  'use strict';

  const CONCURRENCY = 4;
  const CACHE_PREFIX = 'rikunabi_salary_v4:';
  const HIDDEN_PREFIX = 'rikunabi_plus_hidden_v1:';
  const HIDDEN_INDEX_KEY = 'rikunabi_plus_hidden_jobs_v1';
  const visibleCardsByUrl = new Map();

  const salaryLabelRe = /(給与|初任給|賃金|基本給|月給|年俸|時給|日給|報酬|待遇)/;
  const moneyRe = /(月給|年俸|時給|日給|基本給|[0-9０-９][0-9０-９,，.．]*(?:円|万円)|[¥￥]\s*[0-9０-９])/;
  const navTextRe = /(ログイン|会員登録|ヘルプ|検索条件|トップ|マイページ|ナビ|メニュー|お気に入り|説明会|インターン)/;

  const style = document.createElement('style');
  style.textContent = `
    .rk-salary-box {
      margin: 8px 0;
      padding: 8px 10px;
      border-left: 4px solid #e65a24;
      background: #fff7f2;
      color: #222;
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
    }
    .rk-salary-box b {
      color: #d9480f;
      margin-right: 4px;
    }
    .rk-salary-loading {
      color: #666;
      background: #f7f7f7;
      border-left-color: #aaa;
    }
    .rk-plus-actions {
      display: flex;
      justify-content: flex-end;
      margin: 6px 0;
    }
    .rk-plus-hide-button {
      appearance: none;
      border: 1px solid #d6d6d6;
      border-radius: 4px;
      background: #fff;
      color: #444;
      cursor: pointer;
      font-size: 12px;
      line-height: 1.3;
      padding: 4px 8px;
    }
    .rk-plus-hide-button:hover {
      border-color: #999;
      background: #f5f5f5;
    }
    .rk-plus-floating-button {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 9999;
      appearance: none;
      border: 1px solid #d04a17;
      border-radius: 4px;
      background: #e65a24;
      color: #fff;
      cursor: pointer;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.3;
      padding: 9px 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    }
    .rk-plus-floating-button:hover {
      background: #d04a17;
    }
    .rk-plus-panel-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.35);
    }
    .rk-plus-panel {
      position: fixed;
      right: 16px;
      bottom: 64px;
      z-index: 10001;
      width: min(420px, calc(100vw - 32px));
      max-height: min(560px, calc(100vh - 96px));
      overflow: auto;
      border: 1px solid #ddd;
      border-radius: 6px;
      background: #fff;
      color: #222;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
      font-size: 13px;
    }
    .rk-plus-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid #eee;
      padding: 12px;
      font-weight: 700;
    }
    .rk-plus-panel-close,
    .rk-plus-restore-button,
    .rk-plus-restore-all-button {
      appearance: none;
      border: 1px solid #d6d6d6;
      border-radius: 4px;
      background: #fff;
      color: #333;
      cursor: pointer;
      font-size: 12px;
      line-height: 1.3;
      padding: 4px 8px;
    }
    .rk-plus-panel-close:hover,
    .rk-plus-restore-button:hover,
    .rk-plus-restore-all-button:hover {
      background: #f5f5f5;
      border-color: #999;
    }
    .rk-plus-panel-body {
      padding: 12px;
    }
    .rk-plus-hidden-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .rk-plus-hidden-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      border: 1px solid #eee;
      border-radius: 4px;
      padding: 8px;
    }
    .rk-plus-hidden-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rk-plus-empty {
      color: #666;
      margin: 0;
    }
  `;
  document.head.appendChild(style);

  function cleanText(text) {
    return (text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function textOf(el) {
    return cleanText(el ? el.innerText || el.textContent : '');
  }

  function normalizeUrl(href) {
    try {
      const url = new URL(href, location.href);
      url.hash = '';
      return url.href;
    } catch {
      return null;
    }
  }

  function isLikelySearchPage() {
    return /job_search|company_search|search/.test(location.pathname);
  }

  function isLikelyDetailUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname !== location.hostname) return false;
      if (/job_search|company_search|search/.test(u.pathname)) return false;

      return [
        /\/company\//,
        /\/companies\//,
        /\/employment\//,
        /\/job\//,
        /\/jobs\//,
        /\/selection\//,
        /\/company\/r\d+/,
      ].some(re => re.test(u.pathname));
    } catch {
      return false;
    }
  }

  function compactSalary(text) {
    text = cleanText(text);
    if (!text) return '';

    const lines = text
      .split('\n')
      .map(cleanText)
      .filter(Boolean);

    const useful = lines.filter(line => salaryLabelRe.test(line) || moneyRe.test(line));
    const result = useful.length ? useful.join('\n') : text;

    return result.length > 320 ? result.slice(0, 320) + '...' : result;
  }

  function extractSalary(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rowCandidates = [];

    doc.querySelectorAll('tr').forEach(tr => {
      const cells = [...tr.children].map(textOf).filter(Boolean);
      if (cells.length >= 2 && salaryLabelRe.test(cells[0])) {
        rowCandidates.push(cells.join('\n'));
      }
    });

    doc.querySelectorAll('dt').forEach(dt => {
      const label = textOf(dt);
      if (!salaryLabelRe.test(label)) return;

      const dd = dt.nextElementSibling;
      if (dd && dd.tagName.toLowerCase() === 'dd') {
        rowCandidates.push(`${label}\n${textOf(dd)}`);
      }
    });

    const fromRows = rowCandidates
      .map(compactSalary)
      .find(s => s && moneyRe.test(s));

    if (fromRows) return fromRows;

    const blocks = [...doc.querySelectorAll('section, article, table, dl, div, li, p')]
      .map(textOf)
      .filter(t => t.length >= 8 && t.length <= 3000);

    const labeled = blocks.find(t => salaryLabelRe.test(t) && moneyRe.test(t));
    if (labeled) return compactSalary(labeled);

    const moneyLines = textOf(doc.body)
      .split('\n')
      .map(cleanText)
      .filter(line => salaryLabelRe.test(line) || moneyRe.test(line))
      .slice(0, 8);

    return moneyLines.length ? compactSalary(moneyLines.join('\n')) : '';
  }

  function requestText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 20000,
        onload: res => {
          if (res.status >= 200 && res.status < 400) resolve(res.responseText);
          else reject(new Error(`HTTP ${res.status}`));
        },
        ontimeout: () => reject(new Error('タイムアウト')),
        onerror: () => reject(new Error('通信エラー')),
      });
    });
  }

  function findResultCards() {
    const anchors = [...document.querySelectorAll('a[href]')]
      .map(a => ({ a, url: normalizeUrl(a.href) }))
      .filter(x => x.url && isLikelyDetailUrl(x.url) && textOf(x.a).length > 0);

    const seenUrls = new Set();
    const seenCards = new Set();
    const cards = [];

    for (const { a, url } of anchors) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      const card =
        a.closest('[class*="cassette"]') ||
        a.closest('[class*="result"]') ||
        a.closest('[class*="job"]') ||
        a.closest('[class*="company"]') ||
        a.closest('article') ||
        a.closest('li');

      if (!card) continue;
      if (seenCards.has(card)) continue;
      if (card.querySelector('.rk-salary-box')) continue;

      const cardText = textOf(card);

      if (cardText.length < 80) continue;
      if (navTextRe.test(cardText) && cardText.length < 250) continue;

      visibleCardsByUrl.set(url, card);

      if (isHiddenJob(url)) {
        card.style.display = 'none';
        continue;
      }

      addHideButton(card, url);

      seenCards.add(card);
      cards.push({ card, url });
    }

    return cards;
  }

  function isHiddenJob(url) {
    try {
      return localStorage.getItem(HIDDEN_PREFIX + url) === '1';
    } catch {
      return false;
    }
  }

  function hideJob(card, url) {
    const title = getJobTitle(card);
    try {
      localStorage.setItem(HIDDEN_PREFIX + url, '1');
      saveHiddenJob(url, title);
    } catch {
      // localStorage が利用できない場合でも、現在のページでは非表示にする。
    }
    card.style.display = 'none';
    updateHiddenManagerButton();
  }

  function restoreJob(url) {
    try {
      localStorage.removeItem(HIDDEN_PREFIX + url);
      removeHiddenJob(url);
    } catch {
      // localStorage が利用できない場合でも、現在のページでは再表示する。
    }

    const card = visibleCardsByUrl.get(url);
    if (card) {
      card.style.display = '';
      addHideButton(card, url);
    }

    updateHiddenManagerButton();
    renderHiddenPanel();
  }

  function getJobTitle(card) {
    const titleLink = card.querySelector('a[href]');
    const title = textOf(titleLink);
    return title || textOf(card).split('\n').find(Boolean) || '求人';
  }

  function getHiddenJobs() {
    const jobs = new Map();

    try {
      const raw = localStorage.getItem(HIDDEN_INDEX_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        parsed.forEach(job => {
          if (job && job.url) jobs.set(job.url, job);
        });
      }

      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(HIDDEN_PREFIX)) continue;
        const url = key.slice(HIDDEN_PREFIX.length);
        if (!jobs.has(url)) jobs.set(url, { url, title: '求人', hiddenAt: 0 });
      }
    } catch {
      return [];
    }

    return [...jobs.values()].sort((a, b) => (b.hiddenAt || 0) - (a.hiddenAt || 0));
  }

  function saveHiddenJob(url, title) {
    const jobs = getHiddenJobs().filter(job => job.url !== url);
    jobs.unshift({
      url,
      title: title.length > 120 ? title.slice(0, 120) + '...' : title,
      hiddenAt: Date.now(),
    });
    localStorage.setItem(HIDDEN_INDEX_KEY, JSON.stringify(jobs));
  }

  function removeHiddenJob(url) {
    const jobs = getHiddenJobs().filter(job => job.url !== url);
    localStorage.setItem(HIDDEN_INDEX_KEY, JSON.stringify(jobs));
  }

  function ensureHiddenManager() {
    if (document.querySelector('.rk-plus-floating-button')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rk-plus-floating-button';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openHiddenPanel();
    });

    document.body.appendChild(button);
    updateHiddenManagerButton();
  }

  function updateHiddenManagerButton() {
    const button = document.querySelector('.rk-plus-floating-button');
    if (!button) return;

    const count = getHiddenJobs().length;
      button.textContent = `表示しない求人 (${count})`;
  }

  function openHiddenPanel() {
    closeHiddenPanel();

    const backdrop = document.createElement('div');
    backdrop.className = 'rk-plus-panel-backdrop';
    backdrop.addEventListener('click', closeHiddenPanel);

    const panel = document.createElement('div');
    panel.className = 'rk-plus-panel';
    panel.innerHTML = `
      <div class="rk-plus-panel-header">
        <span>表示しない求人</span>
        <button type="button" class="rk-plus-panel-close">閉じる</button>
      </div>
      <div class="rk-plus-panel-body"></div>
    `;

    panel.querySelector('.rk-plus-panel-close').addEventListener('click', closeHiddenPanel);

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    renderHiddenPanel();
  }

  function closeHiddenPanel() {
    document.querySelector('.rk-plus-panel-backdrop')?.remove();
    document.querySelector('.rk-plus-panel')?.remove();
  }

  function renderHiddenPanel() {
    const body = document.querySelector('.rk-plus-panel-body');
    if (!body) return;

    const jobs = getHiddenJobs();
    if (!jobs.length) {
      body.innerHTML = '<p class="rk-plus-empty">表示しない求人はありません。</p>';
      return;
    }

    body.innerHTML = `
      <button type="button" class="rk-plus-restore-all-button">すべて表示する</button>
      <ul class="rk-plus-hidden-list"></ul>
    `;

    body.querySelector('.rk-plus-restore-all-button').addEventListener('click', () => {
      getHiddenJobs().forEach(job => restoreJob(job.url));
    });

    const list = body.querySelector('.rk-plus-hidden-list');
    jobs.forEach(job => {
      const item = document.createElement('li');
      item.className = 'rk-plus-hidden-item';

      const title = document.createElement('span');
      title.className = 'rk-plus-hidden-title';
      title.textContent = job.title || '求人';
      title.title = job.title || '求人';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rk-plus-restore-button';
      button.textContent = '表示する';
      button.addEventListener('click', () => restoreJob(job.url));

      item.appendChild(title);
      item.appendChild(button);
      list.appendChild(item);
    });
  }

  function addHideButton(card, url) {
    if (card.querySelector('.rk-plus-hide-button')) return;

    const actions = document.createElement('div');
    actions.className = 'rk-plus-actions';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rk-plus-hide-button';
    button.textContent = '表示しない';
    button.title = 'この求人を表示しないようにします';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      hideJob(card, url);
    });

    actions.appendChild(button);

    const titleLink = card.querySelector('a[href]');
    if (titleLink && titleLink.parentElement) {
      titleLink.parentElement.insertAdjacentElement('afterend', actions);
    } else {
      card.prepend(actions);
    }
  }

  function insertBox(card) {
    const box = document.createElement('div');
    box.className = 'rk-salary-box rk-salary-loading';
    box.textContent = '給与：取得中...';

    const titleLink = card.querySelector('a[href]');
    if (titleLink && titleLink.parentElement) {
      titleLink.parentElement.insertAdjacentElement('afterend', box);
    } else {
      card.prepend(box);
    }

    return box;
  }

  function render(box, salary) {
    if (!salary || salary === '給与情報が見つかりませんでした') {
      box.remove();
      return;
    }

    box.className = 'rk-salary-box';
    box.innerHTML = `<b>給与</b>${escapeHtml(salary)}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  async function loadSalary({ url, box }) {
    const cacheKey = CACHE_PREFIX + url;

    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        render(box, cached);
        return;
      }

      const html = await requestText(url);
      const salary = extractSalary(html) || '給与情報が見つかりませんでした';

      sessionStorage.setItem(cacheKey, salary);
      render(box, salary);
    } catch {
      box.remove();
    }
  }

  async function runQueue(items) {
    let index = 0;

    async function worker() {
      while (index < items.length) {
        await loadSalary(items[index++]);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker)
    );
  }

  function main() {
    if (!isLikelySearchPage()) return;

    ensureHiddenManager();

    const items = findResultCards().map(({ card, url }) => ({
      url,
      box: insertBox(card),
    }));

    if (items.length) runQueue(items);
  }

  main();

  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(main, 1000);
  }).observe(document.body, { childList: true, subtree: true });
})();
