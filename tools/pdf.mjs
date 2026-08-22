#!/usr/bin/env node
/* Render the paper to a submission-ready PDF.

   Uses the production build and the page's own print stylesheet, so the PDF is the
   same document as the web edition rather than a separate artifact that can drift.
   The print rules in globals.css do the real work: light canvas, hidden chrome,
   break-inside avoidance on tables and figures, and resolved link URLs. */

import puppeteer from 'puppeteer'
import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

/* Puppeteer's pinned Chrome download is unreachable in some environments, so
   resolve a browser we already have: any complete build in the puppeteer cache
   first, then a system Chrome or Edge. Returns undefined to let puppeteer try
   its own default. */
function findBrowser() {
  const cache = join(homedir(), '.cache', 'puppeteer')
  for (const kind of ['chrome', 'chrome-headless-shell']) {
    const dir = join(cache, kind)
    if (!existsSync(dir)) continue
    const builds = readdirSync(dir)
      .filter((d) => d.startsWith('win64-') || d.startsWith('linux-') || d.startsWith('mac'))
      // Newest build first.
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    for (const b of builds) {
      for (const rel of [
        ['chrome-win64', 'chrome.exe'],
        ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
        ['chrome-linux64', 'chrome'],
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
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ]) {
    if (existsSync(p)) return p
  }
  return undefined
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = join(ROOT, 'web')
const OUT_DIR = join(ROOT, 'paper')
const OUT = join(OUT_DIR, 'agent-memory-as-a-database-problem.pdf')
const PORT = 3123
const BASE = `http://127.0.0.1:${PORT}`

mkdirSync(OUT_DIR, { recursive: true })

if (!existsSync(join(WEB, '.next'))) {
  console.error('No production build found. Run: npm --prefix web run build')
  process.exit(1)
}

/* A previous run that was interrupted can leave the port held, and `next start`
   then exits with EADDRINUSE while puppeteer waits out its navigation timeout.
   Clear the listener first so a rerun always works. */
async function freePort(port) {
  try {
    await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1500) })
  } catch {
    return // nothing listening
  }
  console.log(`port ${port} is busy, releasing it ...`)
  const kill = process.platform === 'win32'
    ? spawn('powershell', ['-NoProfile', '-Command',
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
        'Select-Object -ExpandProperty OwningProcess -Unique | ' +
        'ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }'], { stdio: 'ignore' })
    : spawn('sh', ['-c', `lsof -ti tcp:${port} | xargs -r kill -9`], { stdio: 'ignore' })
  await new Promise((r) => kill.on('exit', r))
  await sleep(800)
}

await freePort(PORT)

console.log(`starting next start on ${PORT} ...`)
const server = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['--prefix', WEB, 'run', 'start', '--', '--port', String(PORT)],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
)
server.stdout.on('data', (d) => process.stdout.write(`  [next] ${d}`))
server.stderr.on('data', (d) => process.stderr.write(`  [next] ${d}`))

async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(3000) })
      if (res.ok) return true
    } catch { /* not up yet */ }
    await sleep(1000)
  }
  return false
}

let exitCode = 0
try {
  if (!(await waitForServer())) throw new Error('server did not become ready')
  console.log('server ready, rendering ...')

  const executablePath = findBrowser()
  console.log(`browser: ${executablePath ?? 'puppeteer default'}`)
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--font-render-hinting=none'],
  })
  const page = await browser.newPage()

  // Print emulation before navigation so the print stylesheet drives layout and
  // any width-dependent rendering settles against the paged canvas.
  await page.emulateMediaType('print')
  await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: 2 })

  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 120_000 })

  // Geist is a local next/font, but wait explicitly so no glyph falls back.
  await page.evaluate(() => document.fonts.ready)
  await sleep(1200)

  const stats = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.textContent ?? null,
    sections: document.querySelectorAll('section').length,
    tables: document.querySelectorAll('table').length,
    figures: document.querySelectorAll('figure').length,
    qr: document.querySelectorAll('svg[role="img"]').length,
  }))
  console.log('  page:', JSON.stringify(stats))

  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true, // honour the @page rule in globals.css
    displayHeaderFooter: true,
    // Running head and folio only. Anything more competes with the content for
    // attention on every one of thirty pages.
    /* Running head and folio.
       Puppeteer renders these outside the page box with their own tiny default
       stylesheet, so every value has to be stated: it does not inherit the
       document's fonts, sizes or colours.

       The head is set in small caps at 7pt with wide tracking and sits on a
       hairline, which is what distinguishes a running head from a line of body
       text that happens to be at the top of the page. The folio is centred
       under a matching hairline. Both are 22mm in from the edges so they align
       with the text block the @page rule establishes. */
    headerTemplate: `
      <div style="width:100%;padding:0 22mm;box-sizing:border-box;
                  font-family:'Segoe UI',system-ui,sans-serif;">
        <div style="border-bottom:0.5px solid #c8c8c8;padding-bottom:3px;
                    font-size:7pt;letter-spacing:0.08em;text-transform:uppercase;
                    color:#767676;display:flex;justify-content:space-between;">
          <span>Agent memory as a database problem</span>
          <span>Khemani &middot; Ahuja &middot; Bassi &middot; Agrawal</span>
        </div>
      </div>`,
    footerTemplate: `
      <div style="width:100%;padding:0 22mm;box-sizing:border-box;
                  font-family:'Segoe UI',system-ui,sans-serif;">
        <div style="border-top:0.5px solid #c8c8c8;padding-top:4px;text-align:center;
                    font-size:8pt;color:#4a4a4a;font-variant-numeric:tabular-nums;">
          <span class="pageNumber"></span>
        </div>
      </div>`,
    /* The @page rule in globals.css owns the margins; `preferCSSPageSize` makes
       Chrome honour it. These values only reserve the bands the header and
       footer are drawn into, so they must match the CSS or the running head
       will overlap the first line of text. */
    margin: { top: '20mm', bottom: '18mm', left: '22mm', right: '22mm' },
  })

  await browser.close()

  const bytes = statSync(OUT).size
  console.log(`\nwrote ${OUT}`)
  console.log(`${(bytes / 1024 / 1024).toFixed(2)} MB`)
} catch (err) {
  console.error('PDF generation failed:', err.message)
  exitCode = 1
} finally {
  server.kill()
  // Windows keeps the child alive through npm's shim; make sure the port frees.
  if (process.platform === 'win32' && server.pid) {
    try {
      spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch { /* best effort */ }
  }
  await sleep(500)
  process.exit(exitCode)
}
