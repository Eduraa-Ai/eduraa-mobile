import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const appUrl = process.env.ANNOUNCEMENTS_APP_URL || 'http://localhost:8087'
const mockUrl = process.env.ANNOUNCEMENTS_MOCK_URL || 'http://localhost:8017'
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const outputDir = path.resolve('test-artifacts/announcements')
const debuggingPort = 9452
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eduraa-announcements-edge-'))
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

async function connectDebugger() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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
    } catch { /* Edge is starting. */ }
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
  const body = await evaluate(session, 'document.body?.innerText?.slice(0, 1600)')
  throw new Error(`Timed out waiting for "${expected}". Visible text: ${body}`)
}

async function setViewport(session, width, height) {
  await session.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height })
  await sleep(350)
}

async function clickText(session, expected) {
  const clicked = await evaluate(session, `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const matches = [...document.querySelectorAll('[role="button"], button, [tabindex="0"]')]
      .filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && normalize(item.innerText || item.textContent).includes(${JSON.stringify(expected)});
      });
    const target = matches.sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length)[0];
    if (!target) return false;
    target.click();
    return true;
  })()`)
  if (!clicked) throw new Error(`Could not click ${expected}.`)
  await sleep(450)
}

async function clickAriaLabel(session, label) {
  const clicked = await evaluate(session, `(() => {
    const target = document.querySelector('[aria-label=${JSON.stringify(label)}]');
    if (!target) return false;
    target.click();
    return true;
  })()`)
  if (!clicked) throw new Error(`Could not click aria-label ${label}.`)
  await sleep(450)
}

async function fillLogin(session, identifier) {
  const count = await evaluate(session, `(() => {
    const values = ${JSON.stringify([identifier, 'Synthetic123!'])};
    const inputs = [...document.querySelectorAll('input')];
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    values.forEach((value, index) => {
      setter.call(inputs[index], value);
      inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[index].dispatchEvent(new Event('change', { bubbles: true }));
    });
    return inputs.length;
  })()`)
  if (count < 2) throw new Error(`Expected two login inputs; found ${count}.`)
}

async function fillPlaceholder(session, placeholder, value) {
  const filled = await evaluate(session, `(() => {
    const input = document.querySelector('[placeholder=${JSON.stringify(placeholder)}]');
    if (!input) return false;
    const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    return true;
  })()`)
  if (!filled) throw new Error(`Could not fill ${placeholder}.`)
  await sleep(300)
}

async function scrollContent(session, top) {
  await evaluate(session, `(() => {
    const scrollable = [...document.querySelectorAll('*')]
      .filter((item) => item.scrollHeight > item.clientHeight + 80)
      .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];
    if (scrollable) scrollable.scrollTop = ${top};
    else window.scrollTo(0, ${top});
  })()`)
  await sleep(400)
}

async function setFontScale(session, scale) {
  await evaluate(session, `(() => {
    for (const item of document.querySelectorAll('[dir="auto"]')) {
      const style = getComputedStyle(item);
      item.style.fontSize = Math.round(parseFloat(style.fontSize) * ${scale} * 10) / 10 + 'px';
      if (style.lineHeight.endsWith('px')) item.style.lineHeight = Math.round(parseFloat(style.lineHeight) * ${scale} * 10) / 10 + 'px';
    }
  })()`)
  await sleep(400)
}

async function capture(session, filename) {
  await evaluate(session, `(() => {
    for (const item of document.querySelectorAll('*')) {
      const rect = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      if (style.position === 'fixed' && rect.left < 20 && rect.bottom > innerHeight - 70 && rect.width <= 64 && rect.height <= 64) item.style.display = 'none';
    }
  })()`)
  await sleep(100)
  const result = await session.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.writeFile(path.join(outputDir, filename), Buffer.from(result.data, 'base64'))
  console.log(`Captured ${filename}`)
}

async function setMode(mode, reset = false) {
  const response = await fetch(`${mockUrl}/__test__/announcements-mode`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, reset }),
  })
  if (!response.ok) throw new Error(`Could not set announcements mode ${mode}.`)
}

async function login(session, identifier) {
  await waitForText(session, 'Welcome back')
  await fillLogin(session, identifier)
  await clickText(session, 'Continue')
}

async function signOutLocal(session) {
  await evaluate(session, 'localStorage.clear(); sessionStorage.clear()')
  await session.call('Page.reload', { ignoreCache: true })
}

await fs.mkdir(outputDir, { recursive: true })
const edge = spawn(edgePath, [
  '--headless=new', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })

let session
try {
  session = await connectDebugger()
  await session.call('Page.enable')
  await session.call('Runtime.enable')
  await setViewport(session, 390, 844)
  await setMode('ready', true)
  await session.call('Page.navigate', { url: appUrl })

  await login(session, 'school-student-announcements@example.test')
  await waitForText(session, 'School announcements')
  await clickText(session, 'School announcements')
  await waitForText(session, 'School updates, clearly')
  await capture(session, 'student-inbox-390x844.png')
  await setViewport(session, 320, 700)
  await capture(session, 'student-inbox-320x700.png')
  await setViewport(session, 390, 844)
  await clickText(session, 'Library hours during project week')
  await waitForText(session, 'Tap to open securely')
  await capture(session, 'student-detail-390x844.png')
  await setViewport(session, 320, 700)
  await capture(session, 'student-detail-top-320x700.png')
  await scrollContent(session, 99999)
  await capture(session, 'student-detail-bottom-320x700.png')
  await setViewport(session, 390, 844)
  await scrollContent(session, 0)
  await setFontScale(session, 1.45)
  await capture(session, 'student-detail-large-type-top-390x844.png')
  await scrollContent(session, 250)
  await capture(session, 'student-detail-large-type-390x844.png')
  await setFontScale(session, 1 / 1.45)
  await clickAriaLabel(session, 'Back to announcements')
  await waitForText(session, 'School updates, clearly')
  await capture(session, 'student-read-reconciled-390x844.png')
  await clickText(session, 'Library hours during project week')
  await waitForText(session, 'Tap to open securely')

  await setMode('forbidden')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'This announcement isn’t for this account')
  await capture(session, 'student-permission-denied-390x844.png')

  await setMode('deleted')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'This announcement is no longer available')
  await capture(session, 'student-deleted-390x844.png')

  await setMode('loading')
  await session.call('Page.navigate', { url: `${appUrl}/announcements` })
  await sleep(1100)
  await capture(session, 'student-loading-390x844.png')
  await waitForText(session, 'School updates, clearly', 10000)

  await setMode('empty')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'You’re all caught up')
  await capture(session, 'student-empty-390x844.png')

  await setMode('error')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'Announcements could not sync')
  await capture(session, 'student-error-retry-390x844.png')
  await setMode('ready')

  await signOutLocal(session)
  await login(session, 'school-teacher-announcements@example.test')
  await waitForText(session, 'Workspace')
  await clickText(session, 'Announcements')
  await waitForText(session, 'COMMUNICATION DESK')
  await capture(session, 'teacher-desk-390x844.png')
  await setViewport(session, 320, 700)
  await capture(session, 'teacher-desk-320x700.png')
  await setViewport(session, 390, 844)
  await clickText(session, 'Write announcement')
  await waitForText(session, 'Say it once. Make it clear.')
  await clickText(session, 'Publish now')
  await waitForText(session, 'A few details need your attention')
  await capture(session, 'teacher-validation-390x844.png')
  await setViewport(session, 320, 700)
  await capture(session, 'teacher-validation-320x700.png')
  await setViewport(session, 390, 844)
  await fillPlaceholder(session, 'What should students notice first?', 'Tomorrow’s project check-in')
  await fillPlaceholder(session, 'Write the complete update. Links beginning with https:// will be tappable.', 'Bring your project journal and one question for the review circle. We will begin at 9:10 AM in the science studio.')
  await capture(session, 'teacher-composer-keyboard-390x844.png')
  await scrollContent(session, 99999)
  await capture(session, 'teacher-publish-review-390x844.png')
  await setViewport(session, 320, 700)
  await scrollContent(session, 99999)
  await capture(session, 'teacher-publish-review-320x700.png')
  await setViewport(session, 390, 844)
  await clickText(session, 'Publish now')
  await waitForText(session, 'Tomorrow’s project check-in')
  await capture(session, 'teacher-published-390x844.png')
  await clickText(session, 'Tomorrow’s project check-in')
  await waitForText(session, 'Archive announcement')
  await capture(session, 'teacher-published-detail-390x844.png')
  await clickAriaLabel(session, 'Edit announcement')
  await waitForText(session, 'EDIT PUBLISHED UPDATE')
  await capture(session, 'teacher-edit-populated-390x844.png')
  await fillPlaceholder(session, 'What should students notice first?', 'Tomorrow’s project check-in · updated')
  await fillPlaceholder(session, 'Write the complete update. Links beginning with https:// will be tappable.', 'Bring your project journal and one question for the review circle. The updated start time is 9:20 AM in the science studio.')
  await scrollContent(session, 99999)
  await capture(session, 'teacher-edit-review-390x844.png')
  await clickText(session, 'Save changes')
  await waitForText(session, 'Tomorrow’s project check-in · updated')
  await capture(session, 'teacher-edit-saved-390x844.png')
  await clickText(session, 'Tomorrow’s project check-in · updated')
  await waitForText(session, 'Archive announcement')
  await capture(session, 'teacher-edit-restored-detail-390x844.png')
  await scrollContent(session, 99999)
  await clickText(session, 'Archive announcement')
  await waitForText(session, 'Remove this from student inboxes?')
  await capture(session, 'teacher-archive-confirm-390x844.png')
  await setViewport(session, 320, 700)
  await scrollContent(session, 99999)
  await capture(session, 'teacher-archive-confirm-320x700.png')
  await setViewport(session, 390, 844)
  await clickText(session, 'Archive now')
  await waitForText(session, 'Archived')
  await capture(session, 'teacher-archived-result-390x844.png')
  console.log('Announcement rendered journey completed.')
} finally {
  if (session) {
    try { await session.call('Browser.close') } catch { /* Browser may already be closed. */ }
  }
  edge.kill()
  await Promise.race([new Promise((resolve) => edge.once('exit', resolve)), sleep(2000)])
  try {
    await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
  } catch (error) {
    if (error?.code !== 'EBUSY') throw error
  }
}
