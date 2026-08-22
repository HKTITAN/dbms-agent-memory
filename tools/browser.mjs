/**
 * Finding a Chrome to drive.
 *
 * Puppeteer's bundled download is pinned to the exact build its version wants,
 * and on a machine where that build was never fetched `launch()` fails with a
 * stack trace rather than falling back to the Chrome that is obviously already
 * installed. Every tool here needs the same answer, so it lives in one place:
 * newest puppeteer-cached build first, then the system browsers, then let
 * puppeteer try its own default and report its own error.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function findBrowser() {
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
