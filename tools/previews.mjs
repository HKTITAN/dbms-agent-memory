#!/usr/bin/env node
/* Generate the hover-preview thumbnails for the download links.

   The PDF preview is the real page rendered under print emulation at A4
   proportions — the same pipeline the PDF itself comes from, so the thumbnail
   cannot advertise a layout the download does not have.

   The EPUB preview is the real generated chapter XHTML rendered at e-reader
   proportions, so it shows reflowed text rather than a page image. */

import puppeteer from 'puppeteer'
import JSZip from 'jszip'
import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = join(ROOT, 'web')
const PUB = join(WEB, 'public')
const EPUB = join(ROOT, 'paper', 'persistent-memory-architecture-for-agents.epub')
const PORT = 3125
const BASE = `http://127.0.0.1:${PORT}`

mkdirSync(PUB, { recursive: true })

function findBrowser() {
  const cache = join(homedir(), '.cache', 'puppeteer')
  for (const kind of ['chrome', 'chrome-headless-shell']) {
    const dir = join(cache, kind)
    if (!existsSync(dir)) continue
    for (const b of readdirSync(dir).filter((d) => /^(win64|linux|mac)/.test(d))
      .sort((a, b2) => b2.localeCompare(a, undefined, { numeric: true }))) {
      for (const rel of [['chrome-win64', 'chrome.exe'], ['chrome-linux64', 'chrome']]) {
        const exe = join(dir, b, ...rel)
        if (existsSync(exe)) return exe
      }
    }
  }
  for (const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'])
    if (existsSync(p)) return p
  return undefined
}

async function freePort(port) {
  try { await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1200) }) } catch { return }
  const kill = process.platform === 'win32'
    ? spawn('powershell', ['-NoProfile', '-Command',
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
        'Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }'],
        { stdio: 'ignore' })
    : spawn('sh', ['-c', `lsof -ti tcp:${port} | xargs -r kill -9`], { stdio: 'ignore' })
  await new Promise((r) => kill.on('exit', r))
  await sleep(700)
}

await freePort(PORT)

const server = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['--prefix', WEB, 'run', 'start', '--', '--port', String(PORT)],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32' },
)

let exitCode = 0
try {
  const deadline = Date.now() + 90_000
  let up = false
  while (Date.now() < deadline) {
    try { if ((await fetch(BASE, { signal: AbortSignal.timeout(3000) })).ok) { up = true; break } } catch { /* wait */ }
    await sleep(1000)
  }
  if (!up) throw new Error('server did not become ready')

  const browser = await puppeteer.launch({ headless: true, executablePath: findBrowser(), args: ['--no-sandbox'] })

  // ---- PDF preview: A4 proportions (1 : 1.414), print media, top of page 1.
  {
    const page = await browser.newPage()
    await page.emulateMediaType('print')
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 })
    await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 120_000 })
    await page.evaluate(() => document.fonts.ready)
    await sleep(800)
    await page.screenshot({ path: join(PUB, 'preview-pdf.png'), clip: { x: 0, y: 0, width: 794, height: 1123 } })
    await page.close()
    console.log('wrote public/preview-pdf.png')
  }

  // ---- EPUB preview: the real chapter XHTML, reflowed at e-reader proportions.
  if (existsSync(EPUB)) {
    const zip = await JSZip.loadAsync(readFileSync(EPUB))
    const css = await zip.file('OEBPS/style.css')?.async('string') ?? ''
    // Chapter 2 is the abstract; chapter 1 is the title block and reads thin.
    const chapterName = Object.keys(zip.files).filter((f) => /OEBPS\/ch\d+\.xhtml$/.test(f)).sort()[1]
    const chapter = await zip.file(chapterName)?.async('string') ?? ''
    const body = chapter.replace(/[\s\S]*?<body[^>]*>/, '').replace(/<\/body>[\s\S]*/, '')

    const page = await browser.newPage()
    await page.setViewport({ width: 600, height: 800, deviceScaleFactor: 2 })
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
         ${css}
         body { margin: 0; padding: 2.2em 2em; background: #fffdf8; }
       </style></head><body>${body}</body></html>`,
      { waitUntil: 'networkidle0' },
    )
    await page.evaluate(() => document.fonts.ready)
    await sleep(400)
    await page.screenshot({ path: join(PUB, 'preview-epub.png'), clip: { x: 0, y: 0, width: 600, height: 800 } })
    await page.close()
    console.log(`wrote public/preview-epub.png (from ${chapterName})`)
  } else {
    console.warn('no EPUB found — run tools/epub.mjs first; skipping EPUB preview')
  }

  await browser.close()

  for (const f of ['preview-pdf.png', 'preview-epub.png']) {
    const p = join(PUB, f)
    if (existsSync(p)) console.log(`  ${f}  ${(statSync(p).size / 1024).toFixed(0)} KB`)
  }
} catch (err) {
  console.error('preview generation failed:', err.message)
  exitCode = 1
} finally {
  server.kill()
  if (process.platform === 'win32' && server.pid) {
    try { spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* best effort */ }
  }
  await sleep(400)
  process.exit(exitCode)
}
