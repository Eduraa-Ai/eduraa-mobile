import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const appUrl = process.env.PROFILE_APP_URL || 'http://localhost:8090'
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const outputDir = path.resolve('test-artifacts/profile-parity')
const debuggingPort = Number(process.env.PROFILE_CDP_PORT || 9459)
const usesExistingBrowser = Boolean(process.env.PROFILE_CDP_PORT)
const profileResponseMode = process.env.PROFILE_RESPONSE_MODE || 'ready'
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eduraa-profile-edge-'))
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

class CdpSession {
  constructor(socket) {
    this.socket = socket
    this.sequence = 0
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      const handler = this.pending.get(payload.id)
      if (!handler) return
      this.pending.delete(payload.id)
      payload.error ? handler.reject(new Error(payload.error.message)) : handler.resolve(payload.result)
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

async function connectDebugger() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)
      const target = response.ok ? (await response.json()).find((item) => item.type === 'page') : null
      if (target?.webSocketDebuggerUrl) {
        const socket = new WebSocket(target.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true })
          socket.addEventListener('error', reject, { once: true })
        })
        return new CdpSession(socket)
      }
    } catch {
      // Browser is still starting.
    }
    await sleep(200)
  }
  throw new Error('Edge debugging endpoint did not become ready.')
}

async function evaluate(session, expression) {
  const result = await session.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.')
  return result.result?.value
}

async function waitForText(session, expected, timeout = 25000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(session, `document.body?.innerText?.includes(${JSON.stringify(expected)})`)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for "${expected}".`)
}

async function clickText(session, expected) {
  const clicked = await evaluate(session, `(() => {
    const target = [...document.querySelectorAll('[role="button"], [role="tab"], button')]
      .find((item) => (item.innerText || item.textContent || '').replace(/\\s+/g, ' ').includes(${JSON.stringify(expected)}));
    if (!target) return false;
    target.click();
    return true;
  })()`)
  if (!clicked) throw new Error(`Could not click ${expected}.`)
  await sleep(550)
}

async function capture(session, filename) {
  const result = await session.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.writeFile(path.join(outputDir, filename), Buffer.from(result.data, 'base64'))
  console.log(`Captured ${filename}`)
}

async function scrollContent(session, top) {
  await evaluate(session, `(() => {
    const scrollable = [...document.querySelectorAll('*')]
      .filter((item) => item.scrollHeight > item.clientHeight + 80)
      .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];
    if (scrollable) scrollable.scrollTop = ${top}; else window.scrollTo(0, ${top});
  })()`)
  await sleep(450)
}

const edge = usesExistingBrowser ? null : spawn(edgePath, [
  '--headless=new', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })

try {
  await fs.mkdir(outputDir, { recursive: true })
  const session = await connectDebugger()
  await session.call('Page.enable')
  await session.call('Runtime.enable')
  await session.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 })
  await session.call('Page.navigate', { url: appUrl })
  await sleep(700)
  await evaluate(session, 'localStorage.clear(); sessionStorage.clear()')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'Welcome back')
  await evaluate(session, `(() => {
    const values = ['school-student@example.test', 'Synthetic123!'];
    const inputs = [...document.querySelectorAll('input')];
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    values.forEach((value, index) => { setter.call(inputs[index], value); inputs[index].dispatchEvent(new Event('input', { bubbles: true })); inputs[index].dispatchEvent(new Event('change', { bubbles: true })); });
  })()`)
  await clickText(session, 'Continue')
  await waitForText(session, 'Profile')
  if (profileResponseMode !== 'ready') {
    await fetch('http://localhost:8000/__test__/student-profile-mode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: profileResponseMode }),
    })
  }
  await clickText(session, 'Profile')
  if (profileResponseMode === 'loading') {
    await waitForText(session, 'Finding your student profile.')
    await capture(session, 'profile-loading-390x844.png')
    process.exit(0)
  }
  if (profileResponseMode === 'error') {
    await waitForText(session, 'Your profile paused here.')
    await capture(session, 'profile-error-390x844.png')
    process.exit(0)
  }
  await waitForText(session, 'Profile details')
  if (profileResponseMode === 'empty') {
    await clickText(session, 'Teachers')
    await waitForText(session, 'No teacher mappings found.')
    await clickText(session, 'Books / documents')
    await waitForText(session, 'No mapped documents found.')
    await capture(session, 'profile-empty-sections-390x844.png')
    process.exit(0)
  }
  await capture(session, 'profile-overview-390x844.png')
  await clickText(session, 'Profile details')
  await waitForText(session, 'School-managed fields are shown')
  await capture(session, 'profile-details-390x844.png')
  await scrollContent(session, 560)
  await capture(session, 'profile-details-scrolled-390x844.png')
  await scrollContent(session, 99999)
  await capture(session, 'profile-details-bottom-390x844.png')
  await clickText(session, 'Profile details')
  await scrollContent(session, 0)
  await clickText(session, 'Enrollment & subjects')
  await waitForText(session, 'English Language and Literature')
  await capture(session, 'profile-enrollment-390x844.png')
  await clickText(session, 'Enrollment & subjects')
  await scrollContent(session, 99999)
  await clickText(session, 'Account & security')
  await waitForText(session, 'Password recovery')
  await capture(session, 'profile-security-bottom-390x844.png')
  await clickText(session, 'Account & security')
  await clickText(session, 'Teachers')
  await waitForText(session, 'Mrs. Meera Subramaniam')
  await capture(session, 'profile-teachers-390x844.png')
  await clickText(session, 'Books / documents')
  await waitForText(session, 'Mathematics Practice Book')
  await scrollContent(session, 99999)
  await capture(session, 'profile-documents-390x844.png')
} finally {
  edge?.kill()
  if (!usesExistingBrowser) {
    await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }).catch(() => {})
  }
}
