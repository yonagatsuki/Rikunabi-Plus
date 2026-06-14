// ==UserScript==
// @name         Rikunabi Plus
// @namespace    https://job.rikunabi.com/
// @version      1.6.3
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
  const CACHE_PREFIX = 'rikunabi_salary_v11:';
  const HIDDEN_PREFIX = 'rikunabi_plus_hidden_v1:';
  const HIDDEN_INDEX_KEY = 'rikunabi_plus_hidden_jobs_v1';
  const SALARY_FILTER_KEY = 'rikunabi_plus_min_monthly_salary_v1';
  const visibleCardsByUrl = new Map();
  const salaryTextByUrl = new Map();
  const salaryQueuedUrls = new Set();

  const salaryLabelRe = /(給与|給与詳細|初任給|賃金|基本給|月給|年俸|時給|日給|報酬|待遇)/;
  const moneyRe = /(月給|年俸|時給|日給|基本給|[0-9０-９][0-9０-９,，.．]*(?:円|万円)|[¥￥]\s*[0-9０-９])/;
  const navTextRe = /(ログイン|会員登録|ヘルプ|検索条件|トップ|マイページ|ナビ|メニュー|お気に入り|説明会|インターン)/;
  const actionTextRe = /(求人|詳細|詳しく見る|見る|表示しない|表示する|エントリー|説明会|予約|検討リスト|気になる|お気に入り|ログイン|会員登録)/;

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
    .rk-salary-content {
      display: block;
      margin-top: 2px;
    }
    .rk-salary-toggle {
      appearance: none;
      border: 1px solid #d6d6d6;
      border-radius: 4px;
      background: #fff;
      color: #333;
      cursor: pointer;
      font-size: 12px;
      line-height: 1.3;
      margin-top: 6px;
      padding: 4px 8px;
    }
    .rk-salary-toggle:hover {
      background: #f5f5f5;
      border-color: #999;
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
    .rk-plus-salary-filter {
      position: fixed;
      right: 16px;
      bottom: 58px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 6px;
      border: 1px solid #ddd;
      border-radius: 6px;
      background: #fff;
      color: #222;
      padding: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
      font-size: 12px;
    }
    .rk-plus-salary-filter label {
      font-weight: 700;
      white-space: nowrap;
    }
    .rk-plus-salary-filter input {
      box-sizing: border-box;
      width: 72px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 12px;
      padding: 4px 6px;
    }
    .rk-plus-salary-filter button {
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
    .rk-plus-salary-filter button:hover {
      background: #f5f5f5;
      border-color: #999;
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
    .rk-plus-hidden-title-link {
      color: #0645ad;
      overflow: hidden;
      text-decoration: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rk-plus-hidden-title-link:hover {
      text-decoration: underline;
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

  function formatSalaryForDisplay(text) {
    const lines = cleanText(text)
      .split('\n')
      .map(cleanText)
      .filter(Boolean)
      .filter(line => !/^(給与|初任給|賃金)$/.test(line));

    const result = lines.join('\n');
    return result.length > 1200 ? result.slice(0, 1200) + '...' : result;
  }

  function extractSalary(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rowCandidates = [];

    const salaryArticle = extractSalaryArticle(doc);
    if (salaryArticle) return salaryArticle;

    const salarySection = extractSalarySection(textOf(doc.body));
    if (salarySection) return salarySection;

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

    if (fromRows) return formatSalaryForDisplay(fromRows);

    const labeledByText = extractSalaryNearLabel(textOf(doc.body));
    if (labeledByText) return labeledByText;

    const blocks = [...doc.querySelectorAll('section, article, table, dl, div, li, p')]
      .map(textOf)
      .filter(t => t.length >= 8 && t.length <= 3000);

    const labeled = blocks.find(t => salaryLabelRe.test(t) && moneyRe.test(t));
    if (labeled) return formatSalaryForDisplay(compactSalary(labeled));

    const moneyLines = textOf(doc.body)
      .split('\n')
      .map(cleanText)
      .filter(line => salaryLabelRe.test(line) || moneyRe.test(line))
      .slice(0, 8);

    return moneyLines.length ? formatSalaryForDisplay(compactSalary(moneyLines.join('\n'))) : '';
  }

  function extractSalaryArticle(doc) {
    for (const article of doc.querySelectorAll('article')) {
      const heading = textOf(article.querySelector('[class*="heading"], h1, h2, h3, h4'));
      if (!/^(給与|初任給|賃金)$/.test(heading)) continue;

      const text = htmlToPlainText(article.innerHTML);
      if (moneyRe.test(text)) return formatSalaryForDisplay(text);
    }

    return '';
  }

  function htmlToPlainText(html) {
    const withoutScripts = String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

    const withBreaks = withoutScripts
      .replace(/<(br|\/p|\/div|\/section|\/article|\/li|\/tr|\/dt|\/dd|\/h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<(p|div|section|article|li|tr|dt|dd|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');

    const textarea = document.createElement('textarea');
    textarea.innerHTML = withBreaks;
    return cleanText(textarea.value);
  }

  function extractSalarySection(text) {
    const normalized = cleanText(text)
      .replace(/\s+(給与|初任給|賃金)\s*(?=(?:月給|年俸|時給|日給|給与詳細|基本給|[0-9０-９]))/g, '\n$1\n')
      .replace(/(給与)\s*(月給|年俸|時給|日給)/g, '$1\n$2')
      .replace(/(給与詳細)/g, '\n$1')
      .replace(/(職種と仕事内容|配属職種について|勤務地|勤務時間|休日・休暇|福利厚生|喫煙所情報|試用期間|職場情報|募集概要)/g, '\n$1');

    const keywordMatch = extractSalaryByKeyword(normalized);
    if (keywordMatch) return keywordMatch;

    const sectionMatch = normalized.match(/(?:^|\n)(給与|初任給|賃金)\n?([\s\S]{0,2400}?)(?=\n(?:職種と仕事内容|配属職種について|勤務地|勤務時間|休日・休暇|福利厚生|喫煙所情報|試用期間|職場情報|募集概要)|$)/);
    if (sectionMatch && moneyRe.test(sectionMatch[2])) {
      return formatSalaryForDisplay(sectionMatch[2]);
    }

    const lines = normalized
      .split('\n')
      .map(cleanText)
      .filter(Boolean);

    for (let i = 0; i < lines.length; i += 1) {
      if (!/^(給与|初任給|賃金)$/.test(lines[i])) continue;

      const section = [];
      for (let j = i + 1; j < lines.length && section.length < 24; j += 1) {
        if (/^(職種と仕事内容|配属職種について|勤務地|勤務時間|休日・休暇|福利厚生|喫煙所情報|試用期間|職場情報|募集概要)$/.test(lines[j])) break;
        section.push(lines[j]);
      }

      const joined = section.join('\n');
      if (moneyRe.test(joined)) return formatSalaryForDisplay(joined);
    }

    return '';
  }

  function extractSalaryByKeyword(text) {
    const normalized = cleanText(text);
    const stopRe = /(職種と仕事内容|配属職種について|勤務地|勤務時間|勤務時間詳細|休日・休暇|福利厚生|喫煙所情報|試用期間|職場情報|募集概要|エントリー画面へ行く)/g;
    const labelRe = /(給与|初任給|賃金)/g;
    let match;

    while ((match = labelRe.exec(normalized)) !== null) {
      const start = match.index + match[0].length;
      let section = normalized.slice(start, start + 2600);
      const stop = section.search(stopRe);
      if (stop >= 0) section = section.slice(0, stop);

      if (!moneyRe.test(section)) continue;

      const firstMoney = section.search(/(月給|年俸|時給|日給|基本給|[0-9０-９][0-9０-９,，.．]*(?:円|万円))/);
      if (firstMoney > 260) continue;

      return formatSalaryForDisplay(section);
    }

    return '';
  }

  function extractSalaryNearLabel(text) {
    const lines = cleanText(text)
      .split('\n')
      .map(cleanText)
      .filter(Boolean);

    for (let i = 0; i < lines.length; i += 1) {
      if (!/^給与$|^初任給$|^賃金$/.test(lines[i])) continue;

      const nearby = lines.slice(i, i + 8).join('\n');
      if (moneyRe.test(nearby)) return formatSalaryForDisplay(nearby);
    }

    const compact = lines.join('\n');
    const match = compact.match(/(?:給与|初任給|賃金)\n?([\s\S]{0,900}?(?:月給|基本給)[\s\S]{0,900}?(?:円|万円))/);
    return match ? formatSalaryForDisplay(match[0]) : '';
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

      const card = getResultCard(a, url);

      if (!card) continue;
      if (seenCards.has(card)) continue;

      const cardText = textOf(card);
      const isSelectionJob = isSelectionJobDescriptionUrl(url);

      if (!isSelectionJob && cardText.length < 80) continue;
      if (!isSelectionJob && navTextRe.test(cardText) && cardText.length < 250) continue;

      seenUrls.add(url);
      visibleCardsByUrl.set(url, card);

      addHideButton(card, url);
      updateCardVisibility(url);

      seenCards.add(card);
      cards.push({ card, url });
    }

    return cards;
  }

  function getResultCard(anchor, url) {
    try {
      const path = new URL(url).pathname;
      if (/\/selection\/job_descriptions\//.test(path)) {
        return anchor.closest('li') || anchor;
      }
    } catch {
      // URL の解析に失敗した場合は通常の候補に進む。
    }

    return (
      anchor.closest('li') ||
      anchor.closest('article') ||
      anchor.closest('[class*="cassette"]') ||
      anchor.closest('[class*="card"]') ||
      anchor.closest('[class*="result"]') ||
      anchor.closest('[class*="company"]') ||
      anchor
    );
  }

  function isSelectionJobDescriptionUrl(url) {
    try {
      return /\/selection\/job_descriptions\//.test(new URL(url).pathname);
    } catch {
      return false;
    }
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
    updateCardVisibility(url);
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
      addHideButton(card, url);
      updateCardVisibility(url);
    }

    updateHiddenManagerButton();
    renderHiddenPanel();
  }

  function getJobTitle(card) {
    const candidates = [];

    card.querySelectorAll('h1, h2, h3, h4, [class*="title"], [class*="name"], [class*="company"]').forEach(el => {
      const text = textOf(el);
      if (text) candidates.push(text);
    });

    card.querySelectorAll('a[href]').forEach(link => {
      const text = textOf(link);
      if (text) candidates.push(text);
    });

    textOf(card).split('\n').forEach(line => {
      const text = cleanText(line);
      if (text) candidates.push(text);
    });

    const normalized = candidates
      .map(text => cleanText(text).replace(/\s+/g, ' '))
      .filter(Boolean)
      .filter(text => text.length >= 4 && text.length <= 120)
      .filter(text => !actionTextRe.test(text))
      .filter(text => !salaryLabelRe.test(text))
      .filter(text => !moneyRe.test(text));

    const companyLike = normalized.find(text => /(株式会社|有限会社|合同会社|\(株\)|（株）)/.test(text));
    if (companyLike) return companyLike;

    return normalized[0] || 'タイトル未取得';
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

  function ensureSalaryFilter() {
    if (document.querySelector('.rk-plus-salary-filter')) return;

    const filter = document.createElement('div');
    filter.className = 'rk-plus-salary-filter';
    filter.innerHTML = `
      <label for="rk-plus-min-salary">最低月給</label>
      <input id="rk-plus-min-salary" type="number" min="0" step="1" inputmode="numeric" placeholder="万円">
      <span>万円</span>
      <button type="button" class="rk-plus-salary-clear">解除</button>
    `;

    const input = filter.querySelector('input');
    input.value = getMinMonthlySalaryMan() || '';
    input.addEventListener('input', () => {
      setMinMonthlySalaryMan(input.value);
      applySalaryFilter();
      scheduleScan(50);
    });

    filter.querySelector('.rk-plus-salary-clear').addEventListener('click', () => {
      input.value = '';
      setMinMonthlySalaryMan('');
      applySalaryFilter();
      scheduleScan(50);
    });

    document.body.appendChild(filter);
  }

  function getMinMonthlySalaryMan() {
    try {
      return localStorage.getItem(SALARY_FILTER_KEY) || '';
    } catch {
      return '';
    }
  }

  function setMinMonthlySalaryMan(value) {
    try {
      const normalized = String(value || '').trim();
      if (normalized) localStorage.setItem(SALARY_FILTER_KEY, normalized);
      else localStorage.removeItem(SALARY_FILTER_KEY);
    } catch {
      // localStorage が利用できない場合は何もしない。
    }
  }

  function getMinMonthlySalaryYen() {
    const value = Number(getMinMonthlySalaryMan());
    return Number.isFinite(value) && value > 0 ? value * 10000 : 0;
  }

  function parseMonthlySalaryYen(text) {
    const normalized = String(text || '')
      .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/[，,]/g, '')
      .replace(/[．]/g, '.')
      .replace(/[〜～−ー―-]/g, '~');

    const monthlyLine = normalized
      .split('\n')
      .map(line => line.trim())
      .find(line => /(月給|基本給|初任給|給与)/.test(line) && /([0-9]+(?:\.[0-9]+)?\s*万\s*[0-9]*\s*円|[0-9]+(?:\.[0-9]+)?\s*万円|[0-9]{5,}\s*円)/.test(line));

    const target = monthlyLine || normalized;
    const values = extractYenValues(target);
    if (!values.length) return 0;

    return Math.min(...values);
  }

  function extractYenValues(text) {
    const values = [];
    let rest = String(text || '');

    rest = rest.replace(/([0-9]+(?:\.[0-9]+)?)\s*万\s*([0-9]{1,4})\s*円/g, (_match, man, yenPart) => {
      const value = Number(man) * 10000 + Number(yenPart);
      if (Number.isFinite(value)) values.push(value);
      return ' ';
    });

    rest = rest.replace(/([0-9]+(?:\.[0-9]+)?)\s*万円/g, (_match, man) => {
      const value = Number(man) * 10000;
      if (Number.isFinite(value)) values.push(value);
      return ' ';
    });

    rest = rest.replace(/([0-9]{5,})\s*円/g, (_match, yen) => {
      const value = Number(yen);
      if (Number.isFinite(value)) values.push(value);
      return ' ';
    });

    return values.filter(value => value > 0);
  }

  function updateCardVisibility(url) {
    const card = visibleCardsByUrl.get(url);
    if (!card) return;

    if (isHiddenJob(url)) {
      card.style.display = 'none';
      return;
    }

    const minMonthlySalary = getMinMonthlySalaryYen();
    if (minMonthlySalary > 0) {
      if (!salaryTextByUrl.has(url)) {
        card.style.display = 'none';
        return;
      }

      const salary = parseMonthlySalaryYen(salaryTextByUrl.get(url));
      card.style.display = salary >= minMonthlySalary ? '' : 'none';
      return;
    }

    card.style.display = '';
  }

  function applySalaryFilter() {
    visibleCardsByUrl.forEach((_, url) => updateCardVisibility(url));
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
      const currentCard = visibleCardsByUrl.get(job.url);
      const currentTitle = currentCard ? getJobTitle(currentCard) : '';
      const displayTitle = currentTitle && currentTitle !== 'タイトル未取得' ? currentTitle : job.title;

      const item = document.createElement('li');
      item.className = 'rk-plus-hidden-item';

      const title = document.createElement('a');
      title.className = 'rk-plus-hidden-title-link';
      title.href = job.url;
      title.target = '_blank';
      title.rel = 'noopener noreferrer';
      title.textContent = displayTitle || 'タイトル未取得';
      title.title = displayTitle || 'タイトル未取得';

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
    const current = card.querySelector('.rk-salary-box');
    if (current) return current;

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

  function renderSalaryForUrl(url, salary) {
    const card = visibleCardsByUrl.get(url);
    if (!card) return;

    const box = insertBox(card);
    render(box, salary);
    updateCardVisibility(url);
  }

  function render(box, salary) {
    if (!salary || salary === '給与情報が見つかりませんでした') {
      box.remove();
      return;
    }

    box.className = 'rk-salary-box';
    box.textContent = '';

    const label = document.createElement('b');
    label.textContent = '給与';

    const content = document.createElement('span');
    content.className = 'rk-salary-content';

    const summary = summarizeSalary(salary);
    content.textContent = summary.text;

    box.appendChild(label);
    box.appendChild(content);

    if (summary.collapsible) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rk-salary-toggle';
      button.textContent = '詳細を表示';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        const expanded = button.dataset.expanded === 'true';
        button.dataset.expanded = expanded ? 'false' : 'true';
        content.textContent = expanded ? summary.text : salary;
        button.textContent = expanded ? '詳細を表示' : '閉じる';
      });
      box.appendChild(button);
    }
  }

  function summarizeSalary(salary) {
    const full = cleanText(salary);
    const lines = full.split('\n').map(cleanText).filter(Boolean);
    const summaryLines = [];
    const stopRe = /^(【給与】|給与例|【手当】|手当|【諸手当】|諸手当|●|【昇給】|昇給|【賞与】|賞与)/;

    for (const line of lines) {
      if (summaryLines.length >= 8) break;
      if (stopRe.test(line) && summaryLines.length >= 3) break;
      summaryLines.push(line);
    }

    let text = summaryLines.join('\n');
    if (text.length > 420) text = text.slice(0, 420) + '...';

    return {
      text,
      collapsible: text !== full,
    };
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

  async function loadSalary(url) {
    const cacheKey = CACHE_PREFIX + url;

    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached && cached !== '給与情報が見つかりませんでした') {
        salaryTextByUrl.set(url, cached);
        renderSalaryForUrl(url, cached);
        return;
      }

      const html = await requestText(url);
      const salary = extractSalary(html) || '給与情報が見つかりませんでした';

      sessionStorage.setItem(cacheKey, salary);
      salaryTextByUrl.set(url, salary);
      renderSalaryForUrl(url, salary);
    } catch {
      salaryTextByUrl.set(url, '');
      updateCardVisibility(url);
    }
  }

  async function runQueue(items) {
    let index = 0;

    async function worker() {
      while (index < items.length) {
        await loadSalary(items[index++].url);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker)
    );
  }

  function main() {
    if (!isLikelySearchPage()) return;

    ensureHiddenManager();
    ensureSalaryFilter();

    const items = [];

    for (const { card, url } of findResultCards()) {
      if (salaryTextByUrl.has(url)) {
        renderSalaryForUrl(url, salaryTextByUrl.get(url));
        continue;
      }

      insertBox(card);

      if (!salaryQueuedUrls.has(url)) {
        salaryQueuedUrls.add(url);
        items.push({ url });
      }
    }

    if (items.length) runQueue(items);
  }

  main();

  let timer = null;
  function scheduleScan(delay = 250) {
    clearTimeout(timer);
    timer = setTimeout(main, delay);
  }

  new MutationObserver(() => {
    scheduleScan(getMinMonthlySalaryYen() > 0 ? 80 : 1000);
  }).observe(document.body, { childList: true, subtree: true });
})();
