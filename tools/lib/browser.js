// Shared headless-browser helper for Gutterlight dev tools.
// Usage (from any tools/*.js script):
//   const { openGame, closeAll } = require('./lib/browser');
//   const { page, errors, logs } = await openGame({ query: 'test=1&paused=1&room=gw_01' });
//   ... await page.evaluate(() => G.debug.step(60)) ...
//   await page.screenshot({ path: '...' });
//   await closeAll();
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');

function findChromium() {
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const candidates = [];
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache)) {
      if (d.startsWith('chromium-')) {
        candidates.push(path.join(cache, d, 'chrome-linux64', 'chrome'));
        candidates.push(path.join(cache, d, 'chrome-linux', 'chrome'));
      }
    }
  }
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return undefined; // let playwright try its default
}

let _browser = null;
async function getBrowser() {
  if (_browser) return _browser;
  const executablePath = findChromium();
  _browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  return _browser;
}

/**
 * Open the game in a fresh page.
 * opts.file   : html file relative to repo root (default 'index.html')
 * opts.query  : query string without '?', e.g. 'test=1&paused=1'
 * opts.width/height : viewport (default 1280x720)
 * opts.waitFor: JS expression string that must become truthy (default: 'window.G && G.ready')
 * opts.timeout: ms (default 15000)
 * Returns { page, errors, logs, context }.
 *   errors: array of strings (uncaught exceptions + console.error + failed script loads)
 *   logs:   array of all console messages "[type] text"
 */
async function openGame(opts = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: opts.width || 1280, height: opts.height || 720 } });
  const page = await context.newPage();
  const errors = [];
  const logs = [];
  page.on('console', (msg) => {
    const t = `[${msg.type()}] ${msg.text()}`;
    logs.push(t);
    if (msg.type() === 'error') errors.push(t);
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}\n${(err.stack || '').split('\n').slice(0, 6).join('\n')}`));
  page.on('requestfailed', (req) => errors.push(`[requestfailed] ${req.url()} ${req.failure() && req.failure().errorText}`));
  const file = path.join(ROOT, opts.file || 'index.html');
  const url = 'file://' + file + (opts.query ? '?' + opts.query : '');
  await page.goto(url);
  const waitFor = opts.waitFor === undefined ? 'window.G && G.ready' : opts.waitFor;
  if (waitFor) {
    try {
      await page.waitForFunction(waitFor, null, { timeout: opts.timeout || 15000 });
    } catch (e) {
      errors.push(`[harness] waitFor "${waitFor}" timed out`);
    }
  }
  return { page, errors, logs, context };
}

async function closeAll() {
  if (_browser) { await _browser.close(); _browser = null; }
}

module.exports = { openGame, closeAll, getBrowser, findChromium, ROOT };
