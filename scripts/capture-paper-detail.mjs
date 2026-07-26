import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const appUrl = process.env.PAPER_DETAIL_APP_URL || 'http://localhost:8081'
const mockUrl = process.env.PAPER_DETAIL_MOCK_URL || 'http://localhost:8000'
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const outputDir = path.resolve('test-artifacts/paper-detail')
const debuggingPort = 9555
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eduraa-paper-detail-edge-'))
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

class CdpSession {
  constructor(socket) {
    this.socket = socket
    this.sequence = 0
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      if (!payload.id) return
      const handler = this.pending.get(payload.id)
      if (!handler) return
      this.pending.delete(payload.id)
      if (payload.error) handler.reject(new Error(payload.error.message))
      else handler.resolve(payload.result)
    })
  }
  call(method, params = {}) {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find((target) => target.type === 'page')
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
      }
    } catch {}
    await sleep(200)
  }
  throw new Error('Edge debugging endpoint did not become ready.')
}

async function connect(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  return new CdpSession(socket)
}

async function evaluate(session, expression) {
  const result = await session.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.')
  return result.result?.value
}

async function waitForText(session, text, timeout = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(session, `document.body?.innerText.includes(${JSON.stringify(text)})`)) return
    await sleep(200)
  }
  const visible = await evaluate(session, 'document.body?.innerText?.slice(0, 1600)')
  throw new Error(`Timed out waiting for "${text}". Visible text: ${visible}`)
}

async function fillInputs(session, values) {
  const count = await evaluate(session, `(() => {
    const values = ${JSON.stringify(values)};
    const inputs = [...document.querySelectorAll('input')];
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    values.forEach((value, index) => {
      setter.call(inputs[index], value);
      inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[index].dispatchEvent(new Event('change', { bubbles: true }));
    });
    return inputs.length;
  })()`)
  if (count < values.length) throw new Error(`Expected ${values.length} login inputs; found ${count}.`)
}

async function clickByText(session, text) {
  const clicked = await evaluate(session, `(() => {
    const expected = ${JSON.stringify(text)};
    const target = [...document.querySelectorAll('[role="button"], button, [tabindex="0"]')]
      .find((item) => (item.innerText || item.textContent || '').trim().replace(/\\s+/g, ' ').includes(expected));
    if (!target) return false;
    target.click();
    return true;
  })()`)
  if (!clicked) throw new Error(`Could not find button containing "${text}".`)
  await sleep(350)
}

async function clickByAriaLabel(session, label) {
  const clicked = await evaluate(session, `(() => {
    const target = document.querySelector('[aria-label=${JSON.stringify(label)}]');
    if (!target) return false;
    target.click();
    return true;
  })()`)
  if (!clicked) throw new Error(`Could not find aria-label "${label}".`)
  await sleep(350)
}

async function setViewport(session, width, height) {
  await session.call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  })
  await sleep(350)
}

async function setFontScale(session, scale) {
  await evaluate(session, `(() => {
    for (const item of document.querySelectorAll('[dir="auto"]')) {
      const style = getComputedStyle(item);
      item.style.fontSize = Math.round(parseFloat(style.fontSize) * ${scale} * 10) / 10 + 'px';
      if (style.lineHeight.endsWith('px')) item.style.lineHeight = Math.round(parseFloat(style.lineHeight) * ${scale} * 10) / 10 + 'px';
    }
  })()`)
  await sleep(350)
}

async function capture(session, fileName) {
  await evaluate(session, `(() => {
    for (const item of document.querySelectorAll('*')) {
      const style = getComputedStyle(item);
      const rect = item.getBoundingClientRect();
      if (style.position === 'fixed' && rect.left < 20 && rect.bottom > innerHeight - 70 && rect.width <= 64 && rect.height <= 64) {
        item.style.display = 'none';
      }
    }
  })()`)
  const result = await session.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(outputDir, fileName), Buffer.from(result.data, 'base64'))
  console.log(`Captured ${fileName}`)
}

async function setMode(mode, restore = false) {
  const response = await fetch(`${mockUrl}/__test__/paper-detail-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, restore }),
  })
  if (!response.ok) throw new Error(`Could not set paper detail mode ${mode}.`)
}

await fs.mkdir(outputDir, { recursive: true })
for (const entry of await fs.readdir(outputDir)) {
  if (entry.endsWith('.png')) await fs.rm(path.join(outputDir, entry))
}

const edge = spawn(edgePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: 'ignore' })

let session
try {
  console.log('Resetting synthetic paper detail state')
  await setMode('checking', true)
  console.log('Opening isolated browser')
  session = await connect(await waitForDebugger())
  console.log('Connected to isolated browser')
  await session.call('Page.enable')
  await session.call('Runtime.enable')
  await session.call('Storage.clearDataForOrigin', { origin: appUrl, storageTypes: 'all' })
  console.log('Opening app')
  await setViewport(session, 390, 844)
  await session.call('Page.navigate', { url: appUrl })
  await waitForText(session, 'Welcome back', 30000)
  await fillInputs(session, ['paper-detail@example.test', 'Synthetic123!'])
  await clickByText(session, 'Continue')
  await waitForText(session, 'Quick actions', 20000)
  await clickByAriaLabel(session, 'Papers')
  await waitForText(session, 'Electrostatics practice')
  await capture(session, '01-library-attempted-390x844.png')

  await clickByText(session, 'Electrostatics practice')
  await waitForText(session, 'checking in progress')
  await waitForText(session, 'Attempt Again')
  await capture(session, '02-checking-detail-390x844.png')
  await clickByAriaLabel(session, 'Paper actions')
  await waitForText(session, 'Start a fresh retest')
  await capture(session, '02b-paper-actions-390x844.png')
  await clickByAriaLabel(session, 'Close paper actions')
  await setViewport(session, 320, 700)
  await capture(session, '03-checking-detail-320x700.png')
  await clickByAriaLabel(session, 'Paper actions')
  await capture(session, '03b-paper-actions-320x700.png')
  await clickByAriaLabel(session, 'Close paper actions')
  await setFontScale(session, 1.15)
  await capture(session, '04-checking-detail-increased-type-320x700.png')
  await clickByAriaLabel(session, 'Paper actions')
  await capture(session, '04b-paper-actions-increased-type-320x700.png')
  await clickByAriaLabel(session, 'Close paper actions')

  await setViewport(session, 390, 844)
  await setMode('ready')
  await clickByAriaLabel(session, 'Go back')
  await waitForText(session, 'Electrostatics practice')
  await clickByText(session, 'Electrostatics practice')
  await waitForText(session, 'Your result is ready')
  await waitForText(session, 'View My Results')
  await capture(session, '05-ready-result-detail-390x844.png')

  await clickByAriaLabel(session, 'Paper actions')
  await clickByAriaLabel(session, 'Delete paper')
  await waitForText(session, 'Delete this paper?')
  await capture(session, '06-delete-confirmation-390x844.png')
  await setViewport(session, 320, 700)
  await capture(session, '07-delete-confirmation-320x700.png')
  await clickByText(session, 'Delete paper')
  await waitForText(session, 'JEE Mechanics Diagnostic')
  await capture(session, '08-delete-success-library-320x700.png')

  console.log('Paper detail rendered journey completed.')
} finally {
  try { session?.socket?.close() } catch {}
  const killer = spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true,
    detached: true,
  })
  killer.unref()
  await sleep(500)
  try {
    await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  } catch {}
  setTimeout(() => process.exit(0), 250).unref()
}
