// ==UserScript==
// @name         Rikunabi 検索結果に給与を表示
// @namespace    https://job.rikunabi.com/
// @version      1.2.1
// @description  リクナビの各検索結果ページに、詳細ページから取得した給与情報を表示します
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

      seenCards.add(card);
      cards.push({ card, url });
    }

    return cards;
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
