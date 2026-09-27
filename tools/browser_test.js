/**
 * Live browser test for the Dessert House site.
 *
 * Drives headless Chrome over the DevTools Protocol and checks the behaviours that
 * main.js is responsible for -- the ones that were silently dead when js/main.js
 * failed to load on four of the five pages:
 *
 *   1. the contact details in CONFIG are hydrated into the page
 *   2. the mobile menu button opens and closes the menu
 *   3. "Add to order" fills the order bag (localStorage) and updates the badge
 *   4. the order-bag drawer opens, and its WhatsApp button builds a wa.me link
 *   5. the current page is marked with aria-current
 *   6. every menu filter chip shows exactly its own cards (index.html)
 *
 * Usage:  node tools/browser_test.js  (expects a static server on :8731)
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');

const PORT = 8731;
const DEBUG_PORT = 9222;
const BASE = `http://localhost:${PORT}`;
const PAGES = ['index', 'about', 'contact', 'terms', 'privacy'];

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  return CHROME_CANDIDATES.find((p) => fs.existsSync(p));
}

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_) {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

/** Minimal CDP client over the built-in WebSocket. */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || 'eval failed');
    }
    return res.result.value;
  }
}

const checks = [];
function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -> ${detail}` : ''}`);
}

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome/Chromium binary found');

  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--user-data-dir=/tmp/dh-chrome-profile',
    'about:blank',
  ], { stdio: 'ignore' });

  let failed = 0;
  try {
    const target = await getTarget();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (const page of PAGES) {
      console.log(`\n--- ${page}.html ---`);
      await cdp.send('Page.navigate', { url: `${BASE}/${page}.html` });
      await sleep(1200); // let DOMContentLoaded + handlers run

      const boot = await cdp.evaluate(`(() => ({
        scriptRan: !!document.querySelector('[data-contact-slot="email"]')?.textContent.includes('@'),
        year: document.querySelector('[data-year]')?.textContent,
        current: document.querySelectorAll('a[aria-current="page"]').length,
        tabbar: document.querySelectorAll('.tabbar').length
      }))()`);

      check('main.js executed (contact links hydrated)', boot.scriptRan === true);
      check('footer year filled in', /^\d{4}$/.test(boot.year || ''), boot.year);
      check('current page marked aria-current', boot.current > 0, `${boot.current} link(s)`);
      check('no bottom navigation in DOM', boot.tabbar === 0);

      const menu = await cdp.evaluate(`(() => {
        const t = document.querySelector('[data-nav-toggle]');
        const m = document.querySelector('[data-mobile-menu]');
        if (!t || !m) return { skipped: true };
        const before = m.classList.contains('is-open');
        t.click();
        const after = m.classList.contains('is-open');
        const aria = t.getAttribute('aria-expanded');
        t.click();
        return { before, after, aria, closed: !m.classList.contains('is-open') };
      })()`);
      if (!menu.skipped) {
        check('mobile menu opens on toggle', menu.before === false && menu.after === true);
        check('menu button reports aria-expanded', menu.aria === 'true');
        check('mobile menu closes again', menu.closed === true);
      }

      // --- menu category filters (index.html only) ---
      const filters = await cdp.evaluate(`(() => {
        const chips = [...document.querySelectorAll('[data-filter]')];
        const cards = [...document.querySelectorAll('[data-category]')];
        if (!chips.length || !cards.length) return { skipped: true };
        const visible = () => cards.filter((c) => !c.hidden).length;
        const out = { total: cards.length, shown: {}, chipCount: chips.length };
        for (const chip of chips) {
          chip.click();
          const want = chip.dataset.filter;
          out.shown[want] = visible();
          out.expected = out.expected || {};
          out.expected[want] = want === 'all'
            ? cards.length
            : cards.filter((c) => c.dataset.category === want).length;
        }
        const all = chips.find((c) => c.dataset.filter === 'all');
        out.allPressed = all.getAttribute('aria-pressed');
        all.click();
        out.backToAll = visible();
        // every card category must be reachable via some chip
        out.orphans = cards
          .map((c) => c.dataset.category)
          .filter((k) => !chips.some((c) => c.dataset.filter === k));
        return out;
      })()`);
      if (!filters.skipped) {
        let allMatch = true;
        for (const k of Object.keys(filters.shown)) {
          if (filters.shown[k] !== filters.expected[k]) {
            allMatch = false;
            console.log(`       filter "${k}" showed ${filters.shown[k]}, expected ${filters.expected[k]}`);
          }
        }
        check('every filter chip shows exactly its own cards', allMatch);
        check('"All treats" restores every card', filters.backToAll === filters.total,
          `${filters.backToAll}/${filters.total}`);
        check('every card category has a matching filter chip', filters.orphans.length === 0,
          filters.orphans.join(', ') || 'none orphaned');
      }

      const bag = await cdp.evaluate(`(() => {
        localStorage.removeItem('dh.bag.v1');
        const add = document.querySelector('[data-add-item]');
        const fab = document.querySelector('[data-bag-open]');
        const count = document.querySelector('[data-bag-count]');
        const drawer = document.querySelector('[data-bag-drawer]');
        const send = document.querySelector('[data-bag-send]');
        // Only the menu pages (index) have "Add to order" buttons; the other
        // pages ship the bag UI but have nothing to put in it.
        if (!add) return { skipped: 'no add-to-order button on this page' };
        add.click(); add.click();
        const stored = JSON.parse(localStorage.getItem('dh.bag.v1') || '[]');
        const out = {
          stored,
          badge: count ? count.textContent : null,
          fabHidden: fab ? fab.hidden : null,
          listItems: document.querySelectorAll('[data-bag-list] li').length
        };
        if (fab) fab.click();
        out.drawerOpen = drawer ? drawer.classList.contains('is-open') : null;
        out.hasSend = !!send;
        return out;
      })()`);

      let hasBag = false;
      if (!bag.skipped) {
        hasBag = true;
        check('"Add to order" writes to the order bag',
          bag.stored.length === 1 && bag.stored[0].qty === 2, JSON.stringify(bag.stored));
        check('order-bag badge shows the quantity', bag.badge === '2', String(bag.badge));
        check('order bag button becomes visible', bag.fabHidden === false);
        check('order bag drawer opens', bag.drawerOpen === true);
        check('bag renders one row per treat', bag.listItems === 1, `${bag.listItems} row(s)`);
      }

      const wa = await cdp.evaluate(`(() => {
        const send = document.querySelector('[data-bag-send]');
        if (!send) return { skipped: true };
        let captured = null;
        const realOpen = window.open;
        window.open = (url) => { captured = url; return null; };
        send.click();
        window.open = realOpen;
        return { captured };
      })()`);
      if (!wa.skipped && hasBag) {
        const url = wa.captured || '';
        check('order bag builds a WhatsApp order message',
          url.startsWith('https://wa.me/918292083443?text='), url.slice(0, 58) + '...');
      }

      await cdp.evaluate(`localStorage.removeItem('dh.bag.v1')`);
    }

    console.log('');
    failed = checks.filter((c) => !c.passed).length;
    console.log(`${checks.length} checks run, ${failed} failed.`);
  } finally {
    proc.kill();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('browser test error:', err.message);
  process.exit(1);
});
