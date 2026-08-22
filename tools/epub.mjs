#!/usr/bin/env node
/* Render the paper to EPUB 3.

   Same principle as the PDF: the built page is the single source. Puppeteer
   loads it, we take the rendered DOM, drop everything interactive, and split it
   into one XHTML chapter per <section>. Nothing is re-authored, so the three
   editions cannot drift apart. */

import puppeteer from 'puppeteer'
import JSZip from 'jszip'
import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, statSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = join(ROOT, 'web')
const OUT_DIR = join(ROOT, 'paper')
const OUT = join(OUT_DIR, 'agent-memory-as-a-database-problem.epub')
const PORT = 3124
const BASE = `http://127.0.0.1:${PORT}`

const TITLE = 'Agent memory as a database problem'
const SUBTITLE = "A review of Notion's Lore, and what happens when its schema is given a database to run on"
const AUTHORS = ['Harshit Khemani', 'Kush Ahuja', 'Madhav Bassi', 'Kushagra Agrawal']

mkdirSync(OUT_DIR, { recursive: true })

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
      ]) {
        const exe = join(dir, b, ...rel)
        if (existsSync(exe)) return exe
      }
    }
  }
  for (const p of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ]) if (existsSync(p)) return p
  return undefined
}

async function freePort(port) {
  try { await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1500) }) } catch { return }
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
  const page = await browser.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 120_000 })
  await page.evaluate(() => document.fonts.ready)

  // Pull one chapter per section, with interactive chrome removed. Reading
  // systems have no JS and no fixed layout, so controls would be dead weight.
  const chapters = await page.evaluate(() => {
    const strip = (root) => {
      root.querySelectorAll(
        'button, select, textarea, input, nav.toc, .no-print, .skip-link, script, ' +
        'svg[aria-hidden="true"], [role="tablist"], [contenteditable]'
      ).forEach((el) => el.remove())
      // Visually-hidden data tables carry the same numbers as their chart; keep
      // them, they are the accessible form and reflow far better than an SVG.
      root.querySelectorAll('[style*="clip: rect"]').forEach((el) => {
        el.removeAttribute('style')
      })
      return root
    }
    const out = []
    /* The title page and the print-only pointer belong to the PDF. An e-reader
       builds its own title page from the OPF metadata, and the pointer exists
       to say where the explorers are on a medium that cannot show them — which
       an e-reader also cannot, but it already has §12 saying so. */
    const skip = (sec) => sec.classList.contains('titlepage') || sec.classList.contains('print-only')
    document.querySelectorAll('main > section').forEach((sec, i) => {
      if (skip(sec)) return
      const clone = strip(sec.cloneNode(true))
      const heading = clone.querySelector('h1, h2')
      out.push({
        id: sec.id || `section-${i + 1}`,
        title: (heading?.textContent || `Section ${i + 1}`).trim(),
        html: clone.innerHTML,
      })
    })
    return out
  })

  await browser.close()
  console.log(`extracted ${chapters.length} chapters`)

  /* ---------------------------------------------------------- build epub */

  // Reading systems are strict XHTML parsers. Close voids, drop stray attrs.
  const xhtml = (html) =>
    html
      .replace(/<(br|hr|img|input|meta|link|source|col)([^>]*?)\/?>/gi, '<$1$2 />')
      .replace(/&nbsp;/g, '&#160;')
      .replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
      .replace(/\sdata-[a-z-]+="[^"]*"/gi, '')
      .replace(/\saria-(?:pressed|current|expanded)="[^"]*"/gi, '')

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const zip = new JSZip()
  // mimetype must be first and STORED, not deflated.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  zip.file('META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

  // Reflowable styling only: no fixed widths, no colour that assumes a canvas.
  zip.file('OEBPS/style.css', `
html { font-family: serif; }
body { line-height: 1.55; margin: 0 1em; hyphens: auto; }
h1, h2, h3 { line-height: 1.2; font-family: sans-serif; page-break-after: avoid; }
h1 { font-size: 1.6em; margin: 1.2em 0 0.5em; }
h2 { font-size: 1.3em; margin: 1.4em 0 0.5em; }
h3 { font-size: 1.1em; margin: 1.2em 0 0.4em; }
p { margin: 0 0 0.85em; text-align: justify; }
code, pre, .mono { font-family: monospace; font-size: 0.88em; }
pre { white-space: pre-wrap; word-wrap: break-word; background: #f4f4f4;
      padding: 0.6em; border: 1px solid #ddd; page-break-inside: avoid; }
table { border-collapse: collapse; width: 100%; font-size: 0.8em; margin: 0.8em 0; }
th, td { border: 1px solid #ccc; padding: 0.3em 0.45em; text-align: left; }
th { background: #f0f0f0; }
caption { font-size: 0.85em; text-align: left; margin-bottom: 0.35em; font-style: italic; }
figure { margin: 1em 0; page-break-inside: avoid; }
figcaption, .caption, .meta, .label { font-size: 0.85em; color: #555; }
svg { max-width: 100%; height: auto; }
ol, ul { margin: 0 0 0.85em 1.2em; padding: 0; }
li { margin-bottom: 0.3em; }
`.trim())

  const files = chapters.map((c, i) => ({
    ...c,
    file: `ch${String(i + 1).padStart(2, '0')}.xhtml`,
  }))

  for (const c of files) {
    zip.file(`OEBPS/${c.file}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(c.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
<section epub:type="chapter" id="${c.id}">
${xhtml(c.html)}
</section>
</body>
</html>`)
  }

  const uid = 'urn:uuid:lore-review-agent-memory-as-a-database-problem'
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  zip.file('OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${uid}</dc:identifier>
    <dc:title>${esc(TITLE)}</dc:title>
    <dc:description>${esc(SUBTITLE)}</dc:description>
    <dc:language>en</dc:language>
${AUTHORS.map((a) => `    <dc:creator>${esc(a)}</dc:creator>`).join('\n')}
    <dc:publisher>dbms-memory.khe.money</dc:publisher>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
${files.map((c, i) => `    <item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine>
${files.map((_, i) => `    <itemref idref="c${i + 1}"/>`).join('\n')}
  </spine>
</package>`)

  zip.file('OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><meta charset="utf-8" /><title>Contents</title>
<link rel="stylesheet" type="text/css" href="style.css" /></head>
<body>
<nav epub:type="toc" id="toc">
  <h1>Contents</h1>
  <ol>
${files.map((c) => `    <li><a href="${c.file}">${esc(c.title)}</a></li>`).join('\n')}
  </ol>
</nav>
</body>
</html>`)

  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    mimeType: 'application/epub+zip',
  })
  writeFileSync(OUT, buf)

  console.log(`\nwrote ${OUT}`)
  console.log(`${(statSync(OUT).size / 1024).toFixed(0)} KB · ${files.length} chapters`)
  for (const c of files) console.log(`  ${c.file}  ${c.title.slice(0, 56)}`)
} catch (err) {
  console.error('EPUB generation failed:', err.message)
  exitCode = 1
} finally {
  server.kill()
  if (process.platform === 'win32' && server.pid) {
    try { spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* best effort */ }
  }
  await sleep(500)
  process.exit(exitCode)
}
