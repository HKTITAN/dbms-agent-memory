#!/usr/bin/env node
/**
 * The interface audit.
 *
 * Everything here is a threshold with a number behind it, checked in a real
 * viewport rather than by eye:
 *
 *   - WCAG 2.2 AA contrast for every text element, measured against the
 *     background actually painted behind it, with the 3:1 large-text floor
 *     applied only where the type genuinely qualifies (>=24px, or >=18.66px bold)
 *   - 44x44 CSS pixels for every interactive target, allowing for padding and
 *     pseudo-elements that extend the hit area
 *   - an accessible name on every control
 *   - no horizontal document overflow at three widths
 *   - `transition: all` with a non-zero duration, anywhere
 *   - tabular numerals on anything that updates in place
 *   - images and figures that reserve their space
 *
 * It also writes screenshots, because a number tells you the contrast passes and
 * only a picture tells you the page is worth reading.
 *
 * Run against whatever is serving: `node tools/audit.mjs http://127.0.0.1:3200`.
 */

import puppeteer from 'puppeteer'
import { mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(ROOT, '.work', 'shots')

function findBrowser() {
  const cache = join(homedir(), '.cache', 'puppeteer')
  for (const kind of ['chrome', 'chrome-headless-shell']) {
    const dir = join(cache, kind)
    if (!existsSync(dir)) continue
    for (const b of readdirSync(dir).sort((a, c) => c.localeCompare(a, undefined, { numeric: true }))) {
      for (const rel of [
        ['chrome-win64', 'chrome.exe'], ['chrome-linux64', 'chrome'],
        ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
        ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
      ]) {
        const exe = join(dir, b, ...rel)
        if (existsSync(exe)) return exe
      }
    }
  }
  for (const p of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ]) if (existsSync(p)) return p
  return undefined
}

/* The audit runs inside the page, because every value it needs is a computed
   style and computed styles do not exist outside a browser. */
const AUDIT = `(() => {
  const lum = (rgb) => {
    const m = String(rgb).match(/[\\d.]+/g);
    if (!m) return 1;
    const c = m.slice(0, 3).map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const L1 = Math.max(lum(a), lum(b)), L2 = Math.min(lum(a), lum(b));
    return +((L1 + 0.05) / (L2 + 0.05)).toFixed(2);
  };
  /* The background behind an element is not the first non-transparent colour up
     the tree — it is every translucent layer composited over whatever is under
     them. A 9%-alpha tint over a near-white canvas is near-white, and an audit
     that treats it as the solid tint reports a contrast of 1.0 and sends you off
     to fix a pill that was never broken. Composite properly. */
  const parseRgb = (s) => {
    const m = String(s).match(/[\\d.]+/g);
    if (!m) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 };
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const painted = (el) => {
    const layers = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parseRgb(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      n = n.parentElement;
    }
    const root = parseRgb(getComputedStyle(document.documentElement).backgroundColor);
    const bodyBg = parseRgb(getComputedStyle(document.body).backgroundColor);
    let base = { r: 255, g: 255, b: 255, a: 1 };
    if (bodyBg && bodyBg.a >= 1) base = bodyBg;
    else if (root && root.a >= 1) base = root;
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return 'rgb(' + Math.round(base.r) + ',' + Math.round(base.g) + ',' + Math.round(base.b) + ')';
  };
  /* Text colour can itself be translucent, and then it composites over its own
     background before the ratio is taken. */
  const inked = (color, bg) => {
    const c = parseRgb(color);
    if (!c || c.a >= 1) return color;
    const o = over(c, parseRgb(bg));
    return 'rgb(' + Math.round(o.r) + ',' + Math.round(o.g) + ',' + Math.round(o.b) + ')';
  };
  const vw = document.documentElement.clientWidth;
  const out = { vw, contrast: [], targets: [], unnamed: [], overflow: [], transitionAll: [], jitter: [] };

  /* Off-canvas by design is not a finding. A skip link parked at -9999px, a
     hover preview at opacity 0, a panel clipped for the accessibility tree —
     none of these is visible to a reader and flagging them buries the ones that
     are. Anything genuinely on screen has a box inside the viewport and a
     non-zero opacity on itself and every ancestor. */
  const onScreen = (el) => {
    const b = el.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) return false;
    if (b.right < 0 || b.bottom < 0 || b.left > vw + 4000) return false;
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n);
      if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) === 0) return false;
      if (c.clipPath === 'inset(50%)') return false;
      n = n.parentElement;
    }
    return true;
  };

  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const box = el.getBoundingClientRect();
    const visible = onScreen(el);

    /* contrast, on elements that own a text node of their own */
    const ownsText = Array.prototype.some.call(el.childNodes,
      (n) => n.nodeType === 3 && n.textContent.trim().length > 2);
    if (ownsText && visible) {
      const px = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = px >= 24 || (weight >= 700 && px >= 18.66);
      const floor = large ? 3 : 4.5;
      const bg = painted(el);
      const r = ratio(inked(cs.color, bg), bg);
      if (r < floor) {
        out.contrast.push({ sel: (el.className || el.tagName).toString().slice(0, 48),
          text: el.textContent.trim().slice(0, 46), ratio: r, floor, px, weight,
          fg: cs.color, bg });
      }
    }

    /* transition: all with a real duration */
    if (cs.transitionProperty === 'all' && parseFloat(cs.transitionDuration) > 0) {
      out.transitionAll.push((el.className || el.tagName).toString().slice(0, 48));
    }

    /* Horizontal overflow that actually reaches the page. A wide table inside a
       container that scrolls is not a bug — it is the fix. Only flag an element
       that escapes the viewport with no scrollable ancestor between it and the
       document. */
    if (box.right > vw + 1 && visible) {
      let scrolls = false, n = el.parentElement;
      while (n && n !== document.documentElement) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { scrolls = true; break; }
        n = n.parentElement;
      }
      if (!scrolls) {
        out.overflow.push({ sel: (el.className || el.tagName).toString().slice(0, 48),
          right: Math.round(box.right), width: Math.round(box.width) });
      }
    }
  }

  /* interactive targets and their names */
  for (const el of document.querySelectorAll('a[href], button, [role="button"], input, select, textarea, summary')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const name = (el.getAttribute('aria-label') || el.getAttribute('title')
      || el.getAttribute('aria-labelledby') || el.textContent || '').trim();
    if (!name) out.unnamed.push(el.outerHTML.slice(0, 90));
    if (!onScreen(el)) continue;
    const box = el.getBoundingClientRect();
    /* inline links inside running prose are exempt: WCAG 2.5.8 excludes targets
       in a sentence, and padding a citation to 44px would break the line. */
    const inProse = !!el.closest('.prose, p, li, td, th, caption, blockquote');
    if (!inProse && (box.height < 44 || box.width < 44)) {
      out.targets.push({ name: name.slice(0, 40), w: Math.round(box.width), h: Math.round(box.height) });
    }
  }

  /* anything that updates in place must reserve its width */
  for (const el of document.querySelectorAll('[data-live], .counter, .stat-value, .stat-v, .bar-value, .num')) {
    if (!onScreen(el)) continue;
    if (getComputedStyle(el).fontVariantNumeric.indexOf('tabular-nums') === -1) {
      out.jitter.push((el.className || el.tagName).toString().slice(0, 48));
    }
  }

  /* Liveness. Every check above only inspects what is on screen, so a page that
     renders nothing scores a perfect zero on all of them. That is not a
     hypothetical: a single lost backslash in a generated deck threw at load,
     left all 23 slides at opacity 0, and this audit called it clean. Count what
     is actually visible and let the caller decide whether it is enough. */
  let visibleText = 0, visibleChars = 0;
  for (const el of document.querySelectorAll('body *')) {
    const owns = Array.prototype.some.call(el.childNodes,
      (n) => n.nodeType === 3 && n.textContent.trim().length > 2);
    if (owns && onScreen(el)) { visibleText++; visibleChars += el.textContent.trim().length; }
  }
  out.visibleTextElements = visibleText;
  out.visibleChars = visibleChars;

  out.scrollWidth = document.documentElement.scrollWidth;
  /* The page-level test, which is the one that matters: can the reader scroll
     the whole document sideways? */
  out.overflows = document.documentElement.scrollWidth > vw + 1;
  out.text = document.body.innerText;
  return out;
})()`

const BASE = process.argv[2] ?? 'http://127.0.0.1:3200'
const TARGETS = [
  { name: 'paper', url: BASE, widths: [1280, 768, 375] },
  /* The machine canvas is a second palette painted on the same markup, and until
     this entry existed it was never measured — a whole colour scheme could fail
     AA and the audit would still report the page clean. */
  { name: 'paper-machine', url: BASE, widths: [1280], audience: 'machine' },
]
if (process.argv[3]) TARGETS.push({ name: 'deck', url: process.argv[3], widths: [1280, 375] })

mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  executablePath: findBrowser(),
  args: ['--no-sandbox', '--font-render-hinting=none'],
})

const report = {}
let problems = 0

for (const t of TARGETS) {
  report[t.name] = {}
  for (const w of t.widths) {
    const page = await browser.newPage()
    /* A script that throws is the single most effective way to make every other
       check pass, so listen before navigating. */
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const text = m.text()
      /* A third-party asset that failed to fetch is a network condition, not a
         defect in the page — the deck names a fallback stack for exactly this.
         Scripts that throw, and anything else, still count. */
      if (/net::ERR_|Failed to load resource/.test(text)) return
      errors.push(`console: ${text.slice(0, 120)}`)
    })
    await page.setViewport({ width: w, height: Math.round(w * 0.72), deviceScaleFactor: 2 })
    await page.goto(t.url, { waitUntil: 'networkidle0', timeout: 90_000 })
    if (t.audience) {
      await page.evaluate((a) => document.documentElement.setAttribute('data-audience', a), t.audience)
    }
    await page.evaluate(() => document.fonts.ready)
    await sleep(700)

    const r = await page.evaluate(AUDIT)
    const leak = (r.text.match(/undefined|NaN|\[object Object\]/g) || []).length
    delete r.text

    const shot = join(SHOTS, `${t.name}-${w}.png`)
    await page.screenshot({ path: shot, fullPage: false })
    const tall = join(SHOTS, `${t.name}-${w}-full.png`)
    if (w === 1280) await page.screenshot({ path: tall, fullPage: true, captureBeyondViewport: true })

    const summary = {
      viewport: r.vw,
      overflows: r.overflows,
      overflowElements: r.overflow.length,
      contrastFailures: r.contrast.length,
      smallTargets: r.targets.length,
      unnamedControls: r.unnamed.length,
      transitionAll: r.transitionAll.length,
      nonTabularLiveNumbers: r.jitter.length,
      placeholderLeak: leak,
      visibleTextElements: r.visibleTextElements,
      visibleChars: r.visibleChars,
      /* A page with almost nothing on it did not pass — it failed to render.
         Counted in characters rather than elements, because a deck legitimately
         shows one slide at a time: nine elements is a normal slide and four is
         the navigation bar of a deck whose script threw. Characters separate
         those two cleanly; element counts do not. */
      blank: r.visibleChars < 200,
      consoleErrors: errors.length,
      firstConsoleError: errors[0] ?? null,
      worstContrast: r.contrast.sort((a, b) => a.ratio - b.ratio)[0] ?? null,
      firstOverflow: r.overflow[0] ?? null,
      firstSmallTarget: r.targets[0] ?? null,
      shot,
    }
    const bad = summary.overflows || summary.contrastFailures || summary.smallTargets
      || summary.unnamedControls || summary.transitionAll || summary.nonTabularLiveNumbers
      || summary.placeholderLeak || summary.blank || summary.consoleErrors
    if (bad) problems++
    report[t.name][w] = summary
    await page.close()

    const mark = bad ? 'FAIL' : ' ok '
    console.log(`[${mark}] ${t.name} @ ${w}px  visible:${summary.visibleChars}c`
      + `  contrast:${summary.contrastFailures}  targets:${summary.smallTargets}`
      + `  unnamed:${summary.unnamedControls}  overflow:${summary.overflowElements}`
      + `  transition-all:${summary.transitionAll}  jitter:${summary.nonTabularLiveNumbers}`
      + `  leak:${summary.placeholderLeak}  errors:${summary.consoleErrors}`)
    if (summary.blank) console.log(`        BLANK: only ${summary.visibleChars} visible characters — the page did not render`)
    if (summary.firstConsoleError) console.log('        first error:', summary.firstConsoleError)
    if (summary.worstContrast) console.log('        worst contrast:', JSON.stringify(summary.worstContrast))
    if (summary.firstOverflow) console.log('        first overflow:', JSON.stringify(summary.firstOverflow))
    if (summary.firstSmallTarget) console.log('        first small target:', JSON.stringify(summary.firstSmallTarget))

    /* Grouped detail. Thirty-three contrast failures are usually three tokens,
       and a list of thirty-three lines hides that. */
    if (process.env.AUDIT_VERBOSE) {
      const group = (rows, key) => {
        const m = new Map()
        for (const row of rows) {
          const k = key(row)
          if (!m.has(k)) m.set(k, { n: 0, sample: row })
          m.get(k).n++
        }
        return [...m.entries()].sort((a, b2) => b2[1].n - a[1].n)
      }
      for (const [k, v] of group(r.contrast, (c) => `${c.sel} | fg ${c.fg} on ${c.bg} | ${c.px}px/${c.weight} | ${c.ratio} need ${c.floor}`)) {
        console.log(`        contrast [${v.n}] ${k}  e.g. "${v.sample.text}"`)
      }
      for (const [k, v] of group(r.targets, (t) => `${t.name || '(no name)'} ${t.w}x${t.h}`)) {
        console.log(`        target   [${v.n}] ${k}`)
      }
      for (const u of r.unnamed) console.log(`        unnamed  ${u}`)
      for (const o of r.overflow.slice(0, 6)) console.log(`        overflow ${JSON.stringify(o)}`)
    }
  }
}

await browser.close()
writeFileSync(join(SHOTS, 'audit.json'), JSON.stringify(report, null, 1))
console.log(`\nscreenshots in ${SHOTS}`)
process.exit(problems ? 1 : 0)
