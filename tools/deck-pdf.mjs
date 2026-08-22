#!/usr/bin/env node
/* Render the talk deck to a PDF, one slide per page.
 *
 * The deck's own print stylesheet does the work: it takes every slide out of the
 * absolutely-positioned stack, makes each one a 297 × 167 mm page, hides the
 * navigation chrome, and freezes every animation at its end state. So the PDF is
 * the same document as the deck rather than a second artifact that can drift.
 *
 * 297 × 167 mm is 16:9 at A4 width, which is what a projector wants and what a
 * printer will accept without scaling. */

import puppeteer from 'puppeteer'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DECK = join(ROOT, 'deck')
const OUT = join(DECK, 'agent-memory-as-a-database-problem-slides.pdf')
const PORT = 3125

function findBrowser() {
  const cache = join(homedir(), '.cache', 'puppeteer')
  for (const kind of ['chrome', 'chrome-headless-shell']) {
    const dir = join(cache, kind)
    if (!existsSync(dir)) continue
    const builds = readdirSync(dir)
      .filter((d) => /^(win64|linux|mac)/.test(d))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    for (const b of builds) {
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

if (!existsSync(join(DECK, 'index.html'))) {
  console.error('No deck found. Run: npm run deck')
  process.exit(1)
}

/* A file:// page cannot fetch the web font, and a deck without Nunito is a
   different deck. Serve it over HTTP so the font request is a real one. */
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' }
const server = createServer((req, res) => {
  const rel = (req.url || '/').split('?')[0]
  const file = join(DECK, rel === '/' ? 'index.html' : rel.replace(/^\//, ''))
  if (!file.startsWith(DECK) || !existsSync(file)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

let code = 0
try {
  const executablePath = findBrowser()
  const browser = await puppeteer.launch({
    headless: true, executablePath, args: ['--no-sandbox', '--font-render-hinting=none'],
  })
  const page = await browser.newPage()
  await page.emulateMediaType('print')
  await page.setViewport({ width: 1400, height: 800, deviceScaleFactor: 2 })
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle0', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
  await sleep(900)

  const slides = await page.evaluate(() => document.querySelectorAll('.slide').length)
  await page.pdf({
    path: OUT,
    width: '297mm',
    height: '167mm',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  })
  await browser.close()
  console.log(`wrote ${OUT}`)
  console.log(`  ${slides} slides, ${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`)
} catch (err) {
  console.error('deck PDF failed:', err.message)
  code = 1
} finally {
  server.close()
  process.exit(code)
}
