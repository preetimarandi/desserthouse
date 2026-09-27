/**
 * Generate the social-preview (Open Graph) images for Dessert House.
 *
 * Facebook, X, WhatsApp, LinkedIn and iMessage only render a rich preview
 * card for a shared link when the page carries an og:image / twitter:image.
 * That image has to be an absolute, publicly reachable URL -- a relative one
 * is silently ignored -- and 1200x630 is the size every platform agrees on.
 *
 * This script renders tools/og-template.html -- an HTML card built from the
 * site's own webfonts and palette -- in headless Chrome and screenshots it at
 * exactly 1200x630 straight to JPEG. Rendering in the browser (rather than
 * drawing with Pillow) means the card is typeset with the real Bungee / Space
 * Mono faces, with no font-conversion step in between.
 *
 * Output: asset/og/*.jpg -- committed to the repo, so the images exist on
 *         GitHub Pages without anyone having to run this first.
 *
 * Usage:  node tools/make_og_images.js
 *         (starts its own static server, so no Python needed)
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'asset', 'og');
const PORT = 8733;
const DEBUG_PORT = 9333;
const WIDTH = 1200;
const HEIGHT = 630;

const CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
];

/** One image per variant, and the pages that point at it. */
const VARIANTS = [
    { name: 'og-home.jpg', v: 'home', pages: ['index.html'] },
    { name: 'og-about.jpg', v: 'about', pages: ['about.html'] },
    { name: 'og-contact.jpg', v: 'contact', pages: ['contact.html'] },
    // Terms and Privacy are both dry paperwork, so they share one card.
    { name: 'og-legal.jpg', v: 'legal', pages: ['terms.html', 'privacy.html'] },
];

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.woff2': 'font/woff2', '.woff': 'font/woff',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findChrome = () => CHROME_CANDIDATES.find((p) => fs.existsSync(p));

/** Tiny static server rooted at the project, so file:// font blocking is avoided. */
function serve() {
    const server = http.createServer((req, res) => {
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.join(ROOT, rel);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404).end('not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

async function getTarget() {
    for (let i = 0; i < 40; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
            const targets = await res.json();
            const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
            if (page) return page;
        } catch (_) { /* not up yet */ }
        await sleep(250);
    }
    throw new Error('Chrome DevTools endpoint never came up');
}

/** Minimal CDP client over Node's built-in WebSocket (same shape as browser_test.js). */
class CDP {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        this.waiters = [];
        ws.addEventListener('message', (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
            } else if (msg.method) {
                this.waiters = this.waiters.filter((w) => {
                    if (w.method !== msg.method) return true;
                    clearTimeout(w.timer);
                    w.resolve();
                    return false;
                });
            }
        });
    }
    send(method, params = {}) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    }
    once(method, timeout = 20000) {
        return new Promise((resolve, reject) => {
            const w = { method, resolve, timer: setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeout) };
            this.waiters.push(w);
        });
    }
}

async function main() {
    const chrome = findChrome();
    if (!chrome) throw new Error('No Chrome/Chromium binary found');
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const server = await serve();
    const proc = spawn(chrome, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--user-data-dir=/tmp/dh-og-chrome-profile',
        '--hide-scrollbars',
        'about:blank',
    ], { stdio: 'ignore' });

    try {
        const target = await getTarget();
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
        const cdp = new CDP(ws);

        await cdp.send('Page.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
        });

        for (const variant of VARIANTS) {
            const url = `http://127.0.0.1:${PORT}/tools/og-template.html?v=${variant.v}`;
            const loaded = cdp.once('Page.loadEventFired');
            await cdp.send('Page.navigate', { url });
            await loaded;

            // Block until the webfonts and the photo have actually decoded,
            // otherwise the screenshot catches a fallback-font card.
            await cdp.send('Runtime.evaluate', {
                expression: `Promise.all([document.fonts.ready, ...[...document.images].map(img =>
                    img.complete ? Promise.resolve() : new Promise(r => {
                        img.addEventListener('load', r, { once: true });
                        img.addEventListener('error', r, { once: true });
                    }))])`,
                awaitPromise: true,
            });
            await sleep(200);

            const shot = await cdp.send('Page.captureScreenshot', {
                format: 'jpeg',
                quality: 88,
                captureBeyondViewport: true,
                clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
            });

            const out = path.join(OUT_DIR, variant.name);
            fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
            const kb = (fs.statSync(out).size / 1024).toFixed(0);
            console.log(`  asset/og/${variant.name}  1200x630, ${kb} KB  -> ${variant.pages.join(', ')}`);
        }

        console.log('\nDone. The <meta> tags in each page already point at these paths.');
    } finally {
        proc.kill();
        server.close();
    }
}

main().catch((err) => {
    console.error('OG image generation failed:', err.message);
    process.exit(1);
});

