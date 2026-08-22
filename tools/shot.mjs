#!/usr/bin/env node
/**
 * Screenshots, for looking at the thing.
 *
 * The audit reports numbers. Numbers do not catch a masthead whose five children
 * became five columns — that took a picture. This exists so a picture is one
 * command away rather than a bespoke script each time.
 *
 *   node tools/shot.mjs <url> <out.png> [width] [--full] [--dark]
 */
import puppeteer from 'puppeteer'
import { mkdirSync } from 'node:fs'
import { findBrowser } from './browser.mjs'
import { dirname } from 'node:path'

const [, , url, out, widthArg, ...flags] = process.argv
if (!url || !out) {
  console.error('usage: node tools/shot.mjs <url> <out.png> [width] [--full] [--dark]')
  process.exit(1)
}
const width = Number(widthArg) || 1280
const full = flags.includes('--full')

const browser = await puppeteer.launch({
  headless: true,
  executablePath: findBrowser(),
  args: ['--no-sandbox', '--font-render-hinting=none'],
})
const page = await browser.newPage()
await page.setViewport({ width, height: 900, deviceScaleFactor: 2 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 })
if (flags.includes('--dark')) {
  await page.evaluate(() => document.documentElement.setAttribute('data-audience', 'machine'))
}
// Fonts must be resolved before the shot or the picture is of the fallback face.
await page.evaluate(() => document.fonts.ready)

// `--at=<selector>` frames one component rather than the top of the page.
const at = flags.find((f) => f.startsWith('--at='))
if (at) {
  const sel = at.slice(5)
  const found = await page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return false
    el.scrollIntoView({ block: 'start', behavior: 'instant' })
    window.scrollBy(0, -24)
    return true
  }, sel)
  if (!found) { console.error(`no match for ${sel}`); process.exitCode = 1 }
}
await new Promise((r) => setTimeout(r, 400))

mkdirSync(dirname(out), { recursive: true })
await page.screenshot({ path: out, fullPage: full })

const face = await page.evaluate(() =>
  getComputedStyle(document.body).fontFamily + ' @ ' + getComputedStyle(document.body).fontSize)
console.log(`${out}  ${width}px  font: ${face}`)
if (errors.length) console.error('page errors:', errors.slice(0, 5))

await browser.close()
