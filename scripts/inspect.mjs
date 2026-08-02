/**
 * Loads a page in headless Chrome, runs an expression in it, screenshots it, and prints anything
 * the console said. No dependencies — Node has a global WebSocket, so this talks CDP directly.
 *
 *   node scripts/inspect.mjs <url> <out.png> [waitMs] ['<js expression>'] [width] [height]
 *
 * Environment:
 *   MOBILE=1              emulate a phone — touch, coarse pointer, 3× density
 *   PROMPT_TEXT='…'       auto-answer prompt()/confirm() with this
 *   CHROME_PATH=…         if Chrome is somewhere unusual
 *
 * This is the tool behind the checks in AGENTS.md, and it is worth reaching for before believing
 * anything about how this app behaves. Every bug found in this project so far was invisible without
 * it: a canvas that rendered black because a module threw before the render loop started, a gallery
 * that numbered looks differently from the routes, an editor that covered the artwork on a phone.
 *
 * Examples:
 *
 *   # is the layout still the artist's composition? freeze it and diff against the ghost:
 *   # a correct layout comes out black apart from 1–2px edges
 *   node scripts/inspect.mjs 'http://localhost:5173/?edit=1' /tmp/ghost.png 2500 \
 *     '(() => { const b = window.baw; b.drive.paused = true; b.store.set("motion.intensity", 0);
 *               b.tools.ghost = 1; b.applyTools(); b.setMode(false); return "frozen"; })()'
 *
 *   # does a phone get a display rather than an editor?
 *   MOBILE=1 node scripts/inspect.mjs 'http://localhost:5173/?edit=1' /tmp/phone.png 3000 \
 *     '(() => document.querySelector("#panel").classList.contains("open"))()'
 */

import { spawn } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const [url, out = 'inspect.png', waitMs = '2500', expression = '', width = '1200', height = '800'] =
  process.argv.slice(2)

if (!url) {
  console.error('usage: node scripts/inspect.mjs <url> [out.png] [waitMs] [expression] [w] [h]')
  process.exit(1)
}

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9600 + Math.floor(Math.random() * 300)
const profile = `/tmp/baw-inspect-${PORT}`
rmSync(profile, { recursive: true, force: true })

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    // Software GL: a headless runner has no real GPU, and the shaders are cheap enough not to care.
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
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
const logs = []

const send = (method, params = {}) => {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve) => pending.set(id, resolve))
}

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
    return
  }
  switch (msg.method) {
    case 'Runtime.consoleAPICalled':
      logs.push(`[${msg.params.type}] ${msg.params.args.map(describe).join(' ')}`)
      break
    case 'Runtime.exceptionThrown': {
      const d = msg.params.exceptionDetails
      logs.push(`[exception] ${d.exception?.description ?? d.text}`)
      break
    }
    case 'Log.entryAdded':
      logs.push(`[${msg.params.entry.level}] ${msg.params.entry.text}`)
      break
    case 'Page.javascriptDialogOpening':
      // Without this a prompt() blocks the page forever, so any flow behind one is untestable.
      void send('Page.handleJavaScriptDialog', { accept: true, promptText: process.env.PROMPT_TEXT ?? '' })
      logs.push(`[dialog] ${msg.params.type}: ${msg.params.message}`)
      break
    default:
      break
  }
})

function describe(arg) {
  if (arg.value !== undefined) return String(arg.value)
  return arg.description ?? arg.type
}

await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')

if (process.env.MOBILE) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(width),
    height: Number(height),
    deviceScaleFactor: 3,
    mobile: true,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Emulation.setUserAgentOverride', {
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36',
  })
}

await send('Page.navigate', { url })
await sleep(Number(waitMs))

if (expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  const value = result.result?.result?.value
  console.log('EVAL:', JSON.stringify(value ?? result.result, null, 2))
}

const shot = await send('Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) {
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
  console.log(`SHOT: ${out}`)
} else {
  console.log('SHOT FAILED:', JSON.stringify(shot).slice(0, 400))
}

if (logs.length > 0) {
  console.log('CONSOLE:')
  for (const line of logs) console.log(`  ${line}`)
}

ws.close()
chrome.kill()
try {
  rmSync(profile, { recursive: true, force: true })
} catch {
  // Chrome is still tearing down and may recreate files under it; /tmp will get cleaned anyway.
}
process.exit(0)
