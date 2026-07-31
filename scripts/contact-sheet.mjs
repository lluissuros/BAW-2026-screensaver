/**
 * Renders the loop at a handful of phases and lays them out side by side, so you can see what
 * the motion is actually doing without staring at the screen for a whole cycle.
 *
 *   npm run dev              # in one terminal
 *   node scripts/contact-sheet.mjs
 *
 * Options: --url, --frames, --width, --height, --out, --wait
 *
 * Writes exports/contact/frame-*.png plus exports/contact-sheet.png (needs ffmpeg for the
 * montage; the individual frames are written either way).
 *
 * It drives the page through CDP using the `window.baw` handle the dev build exposes, so it
 * exercises the real renderer rather than a copy of the maths.
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = 'true'] = a.replace(/^--/, '').split('=')
      return [k, v]
    }),
)

const URL_ = args.url ?? 'http://localhost:5173/?fresh=1'
const FRAMES = Number(args.frames ?? 6)
const WIDTH = Number(args.width ?? 540)
const HEIGHT = Number(args.height ?? 1080)
const WAIT = Number(args.wait ?? 2500)
const OUT_DIR = args.out ?? 'exports/contact'

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9500 + Math.floor(Math.random() * 300)
const profile = `/tmp/baw-contact-${PORT}`
rmSync(profile, { recursive: true, force: true })

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let target
for (let i = 0; i < 60 && !target; i++) {
  await sleep(200)
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  } catch {
    /* not up yet */
  }
}
if (!target) {
  chrome.kill()
  throw new Error('Chrome never exposed a page target')
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let nextId = 1
const pending = new Map()
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    console.error('page exception:', msg.params.exceptionDetails?.exception?.description)
  }
})

const send = (method, params = {}) => {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve) => pending.set(id, resolve))
}

await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url: URL_ })
await sleep(WAIT)

// One eval renders every phase and hands back PNG data URLs. toDataURL must run in the same
// task as the draw, because the drawing buffer is not preserved between tasks.
const script = `(() => {
  const app = window.baw
  if (!app) throw new Error('window.baw is missing — is this a dev build?')
  const canvas = document.querySelector('#stage')
  canvas.width = ${WIDTH}
  canvas.height = ${HEIGHT}
  app.drive.paused = true
  const shots = []
  for (let i = 0; i < ${FRAMES}; i++) {
    const phase = i / ${FRAMES}
    app.drive.setPhase(phase)
    app.renderer.render(app.store.config, app.drive.sample(app.store.config, 1 / 30))
    shots.push({ phase, data: canvas.toDataURL('image/png') })
  }
  return shots
})()`

const result = await send('Runtime.evaluate', { expression: script, returnByValue: true })
const shots = result.result?.result?.value
if (!Array.isArray(shots)) {
  console.error(JSON.stringify(result).slice(0, 800))
  throw new Error('Could not capture frames')
}

mkdirSync(OUT_DIR, { recursive: true })
const files = shots.map((shot, i) => {
  const file = `${OUT_DIR}/frame-${String(i).padStart(2, '0')}-phase-${shot.phase.toFixed(3)}.png`
  writeFileSync(file, Buffer.from(shot.data.split(',')[1], 'base64'))
  return file
})
files.forEach((f) => console.log('wrote', f))

ws.close()
chrome.kill()
// Chrome is still tearing down and may recreate files under the profile; a failure to clean
// it up is not a reason to lose the frames we just captured.
try {
  rmSync(profile, { recursive: true, force: true })
} catch {
  /* it lives in /tmp; the OS will get to it */
}

const sheet = `${OUT_DIR.replace(/\/$/, '')}-sheet.png`
const montage = spawnSync(
  'ffmpeg',
  [
    '-v', 'error', '-y',
    ...files.flatMap((f) => ['-i', f]),
    '-filter_complex', `hstack=inputs=${files.length}`,
    sheet,
  ],
  { stdio: 'inherit' },
)
console.log(montage.status === 0 ? `wrote ${sheet}` : 'ffmpeg not available — individual frames only')
process.exit(0)
