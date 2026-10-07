import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const appUrl = process.env.APPROVALS_APP_URL || 'http://127.0.0.1:8091'
const mockUrl = process.env.APPROVALS_MOCK_URL || 'http://127.0.0.1:8021'
const outputDir = path.resolve('test-artifacts/approvals')
const debuggingPort = 9461
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eduraa-approvals-edge-'))
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

class Session {
  constructor(socket) {
    this.socket = socket
    this.sequence = 0
    this.pending = new Map()
    socket.addEventListener('message', event => {
      const payload = JSON.parse(String(event.data))
      if (payload.method === 'Runtime.exceptionThrown') console.error('Browser exception:', payload.params?.exceptionDetails?.exception?.description || payload.params?.exceptionDetails?.text)
      if (payload.method === 'Runtime.consoleAPICalled' && payload.params?.type === 'error') console.error('Browser console:', payload.params?.args?.map(arg => arg.value || arg.description).join(' '))
      if (payload.method === 'Page.javascriptDialogOpening') {
        void this.call('Page.handleJavaScriptDialog', { accept: true })
        return
      }
      if (!payload.id) return
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

async function connect() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)
      const target = response.ok ? (await response.json()).find(item => item.type === 'page') : null
      if (target?.webSocketDebuggerUrl) {
        const socket = new WebSocket(target.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true })
          socket.addEventListener('error', reject, { once: true })
        })
        return new Session(socket)
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

async function waitForText(session, expected, timeout = 60000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(session, `document.body?.innerText?.includes(${JSON.stringify(expected)})`)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${expected}: ${await evaluate(session, 'JSON.stringify({ url: location.href, state: document.readyState, body: document.body?.innerText?.slice(0,1800), root: document.querySelector("#root")?.innerHTML?.slice(0,500), scripts: [...document.scripts].map(item => item.src), resources: performance.getEntriesByType("resource").slice(-5).map(item => [item.name, item.duration, item.responseEnd]) })')}`)
}

async function clickText(session, expected) {
  const result = await evaluate(session, `(() => {
    const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim();
    const candidates = [...document.querySelectorAll('[role="button"],button,[tabindex="0"]')].filter(item => {
      const rect = item.getBoundingClientRect();
      return rect.width >= 36 && rect.height >= 36 && normalize(item.innerText || item.textContent).includes(${JSON.stringify(expected)});
    }).sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length);
    const exact = candidates.filter(item => normalize(item.innerText || item.textContent) === ${JSON.stringify(expected)});
    const target = exact[0] || candidates[0];
    if (!target) return { clicked: false, labels: [] };
    target.scrollIntoView({ block: 'center' }); target.click();
    return { clicked: true, label: normalize(target.innerText || target.textContent) };
  })()`)
  if (!result?.clicked) throw new Error(`Could not click ${expected}.`)
  await sleep(500)
}

async function clickAccessible(session, selector, label) {
  const clicked = await evaluate(session, `(() => {
    const target = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item =>
      (item.getAttribute('aria-label') || item.innerText || '').trim() === ${JSON.stringify(label)});
    if (!target) return false;
    target.scrollIntoView({ block: 'center' }); target.click();
    return true;
  })()`)
  if (!clicked) throw new Error(`Could not click ${label}.`)
  await sleep(350)
}

async function fill(session, placeholder, value) {
  const filled = await evaluate(session, `(() => {
    const input = [...document.querySelectorAll('input,textarea')].find(item => item.placeholder === ${JSON.stringify(placeholder)});
    if (!input) return false;
    Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  if (!filled) throw new Error(`Input not found: ${placeholder}`)
}

async function viewport(session, width, height, deviceScaleFactor = 1) {
  await session.call('Emulation.setDeviceMetricsOverride', { width, height, screenWidth: width, screenHeight: height, deviceScaleFactor, mobile: true })
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
  await sleep(400)
}

async function scrollTo(session, top) {
  await evaluate(session, `(() => {
    const scrollable = [...document.querySelectorAll('*')].filter(item => item.scrollHeight > item.clientHeight + 80)
      .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];
    if (scrollable) scrollable.scrollTop = ${top}; else window.scrollTo(0, ${top});
  })()`)
  await sleep(400)
}

async function capture(session, filename) {
  await evaluate(session, `(() => {
    for (const item of document.querySelectorAll('*')) {
      const rect = item.getBoundingClientRect(); const style = getComputedStyle(item);
      if (style.position === 'fixed' && rect.left < 20 && rect.bottom > innerHeight - 70 && rect.width <= 64 && rect.height <= 64) item.style.display = 'none';
    }
  })()`)
  const screenshot = await session.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(outputDir, filename), Buffer.from(screenshot.data, 'base64'))
  console.log(`Captured ${filename}`)
}

async function mode(value, reset = false) {
  const response = await fetch(`${mockUrl}/__test__/mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: value, reset }) })
  if (!response.ok) throw new Error(`Could not set mode ${value}.`)
}

async function clear(session) {
  await session.call('Storage.clearDataForOrigin', { origin: appUrl, storageTypes: 'all' })
  await session.call('Page.navigate', { url: appUrl })
  await waitForText(session, 'Welcome back')
}

async function login(session, identifier) {
  await waitForText(session, 'Welcome back')
  await fill(session, 'Email or student ID', identifier)
  await fill(session, 'Password', 'Synthetic123!')
  await clickText(session, 'Continue')
  await waitForText(session, 'TODAY’S DESK')
}

async function openApprovals(session, expected = 'Every completed decision keeps its actor and server time.') {
  await clickText(session, 'Approvals')
  await waitForText(session, expected)
  await scrollTo(session, 0)
}

async function status(session, identifier, expected) {
  await clickText(session, 'Check school approval')
  await waitForText(session, 'Check only your own request.')
  await fill(session, 'Email, student ID, or teacher ID', identifier)
  await fill(session, 'Your password', 'Synthetic123!')
  await clickText(session, 'Check my status')
  await waitForText(session, expected)
}

await fs.mkdir(outputDir, { recursive: true })
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })

let session
try {
  session = await connect()
  await session.call('Page.enable')
  await session.call('Runtime.enable')
  await viewport(session, 390, 844)
  await mode('ready', true)
  await session.call('Page.navigate', { url: appUrl })
  await login(session, 'principal@example.test')
  await openApprovals(session)
  await capture(session, 'principal-many-390x844.png')
  await clickText(session, 'Reject')
  await waitForText(session, 'Reject this request?')
  const rejectionReason = 'School email does not match the submitted staff record.'
  await fill(session, 'Explain what must be corrected', rejectionReason)
  await capture(session, 'principal-rejection-confirmation-390x844.png')
  await clickText(session, 'Reject request')
  await waitForText(session, 'The queue is up to date.')
  const rejectionAudit = await (await fetch(`${mockUrl}/__test__/audit`)).json()
  if (rejectionAudit.events[0]?.reason !== rejectionReason) throw new Error('The typed rejection reason was not sent to the server.')
  await mode('ready', true)
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'TODAY’S DESK')
  await openApprovals(session)
  await viewport(session, 320, 700)
  await capture(session, 'principal-many-320x700.png')
  await clickText(session, 'Reject')
  await waitForText(session, 'Reject this request?')
  await fill(session, 'Explain what must be corrected', 'No')
  await capture(session, 'principal-rejection-validation-320x700.png')
  await fill(session, 'Explain what must be corrected', 'School email does not match the submitted staff record.')
  await viewport(session, 320, 500)
  await capture(session, 'principal-rejection-keyboard-320x500.png')
  const decisionVisible = await evaluate(session, `(() => {
    const action = [...document.querySelectorAll('[role="button"]')].find(item => item.innerText?.includes('Reject request'));
    action?.scrollIntoView({ block: 'end' });
    const rect = action?.getBoundingClientRect();
    return Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight);
  })()`)
  if (!decisionVisible) throw new Error('Rejection action is not reachable in the short keyboard viewport.')
  await capture(session, 'principal-rejection-keyboard-actions-320x500.png')
  await viewport(session, 320, 700)
  await clickText(session, 'Keep pending')
  await scrollTo(session, 99999)
  await capture(session, 'principal-final-320x700.png')
  await viewport(session, 390, 844, 1.3)
  await scrollTo(session, 0)
  await setFontScale(session, 1.3)
  await capture(session, 'principal-large-type-390x844.png')
  await scrollTo(session, 620)
  await capture(session, 'principal-large-type-actions-390x844.png')
  await setFontScale(session, 1 / 1.3)
  await viewport(session, 390, 844)
  await scrollTo(session, 520)
  await capture(session, 'principal-queues-390x844.png')

  await mode('partial')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'TODAY’S DESK')
  await openApprovals(session, 'No decision was made while a queue is unavailable.')
  await waitForText(session, 'needs attention')
  await scrollTo(session, 1400)
  await capture(session, 'principal-partial-failure-390x844.png')

  await clear(session)
  await mode('ready', true)
  await login(session, 'teacher@example.test')
  await clickText(session, 'Dashboard')
  await waitForText(session, 'Kabir, here is your class pulse.')
  await capture(session, 'teacher-dashboard-390x844.png')
  await viewport(session, 320, 700)
  await capture(session, 'teacher-dashboard-320x700.png')
  await viewport(session, 390, 844)
  await clickText(session, 'Filters')
  await clickAccessible(session, '[aria-label]', 'Standard: All')
  await mode('dashboard-slow')
  await clickAccessible(session, '[role="radio"]', '10')
  await waitForText(session, 'Updating dashboard')
  await capture(session, 'teacher-dashboard-updating-390x844.png')
  await viewport(session, 320, 700)
  await capture(session, 'teacher-dashboard-updating-320x700.png')
  await waitForText(session, '10 active', 10000)
  await clickText(session, 'Filters')
  await capture(session, 'teacher-dashboard-filtered-320x700.png')
  await viewport(session, 390, 844)
  await capture(session, 'teacher-dashboard-filtered-390x844.png')
  await mode('dashboard-error')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'TODAY’S DESK')
  await clickText(session, 'Dashboard')
  await waitForText(session, 'Dashboard could not load')
  await viewport(session, 320, 700)
  await capture(session, 'teacher-dashboard-error-320x700.png')
  await mode('ready')
  await clickText(session, 'Try again')
  await waitForText(session, '27 active')
  await capture(session, 'teacher-dashboard-retry-320x700.png')
  await viewport(session, 390, 844)
  await evaluate(session, 'history.back()')
  await waitForText(session, 'TODAY’S DESK')
  await mode('ready')
  await clickText(session, 'Index Notes')
  await waitForText(session, 'Continue on Eduraa web')
  await capture(session, 'teacher-web-workflow-390x844.png')
  await evaluate(session, 'window.__openedSchoolUrl = null; window.open = (url) => { window.__openedSchoolUrl = url; return null }')
  await clickText(session, 'Open website')
  const openedSchoolUrl = await evaluate(session, 'window.__openedSchoolUrl')
  if (openedSchoolUrl !== 'https://www.eduraa-ai.com/index-notes') throw new Error(`Unexpected school website destination: ${openedSchoolUrl}`)
  await viewport(session, 320, 700)
  await capture(session, 'teacher-web-workflow-320x700.png')
  await viewport(session, 390, 844)
  await evaluate(session, 'history.back()')
  await waitForText(session, 'TODAY’S DESK')
  await openApprovals(session)
  await capture(session, 'teacher-students-390x844.png')
  await viewport(session, 320, 700)
  await capture(session, 'teacher-students-320x700.png')
  await scrollTo(session, 520)
  await capture(session, 'teacher-actions-320x700.png')

  await viewport(session, 390, 844)
  await scrollTo(session, 0)
  await clickText(session, 'Reject')
  await waitForText(session, 'Reject this request?')
  await fill(session, 'Explain what must be corrected', 'Student record needs correction.')
  await capture(session, 'teacher-rejection-confirmation-390x844.png')
  await clickText(session, 'Keep pending')
  await mode('mutation-slow')
  await clickText(session, 'Approve')
  await waitForText(session, 'FINAL SCHOOL DECISION')
  await capture(session, 'teacher-approval-confirmation-390x844.png')
  await clickText(session, 'Approve request')
  await sleep(250)
  await capture(session, 'teacher-mutation-pending-390x844.png')
  await waitForText(session, 'The queue is up to date.', 10000)
  await capture(session, 'teacher-reconciled-success-390x844.png')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'TODAY’S DESK')
  await openApprovals(session)
  const auditAfterResume = await (await fetch(`${mockUrl}/__test__/audit`)).json()
  if (auditAfterResume.mutationCount !== 1) throw new Error(`Completed mutation repeated after resume: ${auditAfterResume.mutationCount}`)
  await capture(session, 'teacher-resume-no-replay-390x844.png')

  await viewport(session, 390, 844)
  await clear(session)
  await clickText(session, 'Check school approval')
  await waitForText(session, 'Check only your own request.')
  await fill(session, 'Email, student ID, or teacher ID', 'pending-student@example.test')
  await fill(session, 'Your password', 'Synthetic123!')
  await viewport(session, 390, 500)
  await scrollTo(session, 99999)
  await capture(session, 'student-status-keyboard-390x500.png')
  await viewport(session, 390, 844)
  await clear(session)
  await status(session, 'pending-student@example.test', 'Your school will review this.')
  await capture(session, 'student-pending-390x844.png')
  await viewport(session, 320, 700)
  await capture(session, 'student-pending-320x700.png')

  await viewport(session, 390, 844)
  await clear(session)
  await status(session, 'approved-student@example.test', 'Your school space is ready.')
  await capture(session, 'student-approved-390x844.png')
  await clear(session)
  await status(session, 'rejected-student@example.test', 'Your request was not approved.')
  await capture(session, 'student-rejected-390x844.png')

  await clear(session)
  await mode('slow', true)
  await login(session, 'teacher@example.test')
  await clickText(session, 'Approvals')
  await sleep(750)
  await capture(session, 'teacher-loading-390x844.png')
  await sleep(5600)
  await capture(session, 'teacher-slow-network-390x844.png')
  await waitForText(session, 'Student access', 10000)

  await mode('empty', true)
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'TODAY’S DESK')
  await openApprovals(session)
  await waitForText(session, 'Your review desk is clear.')
  await capture(session, 'teacher-empty-390x844.png')
  console.log('Approvals rendered journey completed.')
} finally {
  if (session) await session.call('Browser.close').catch(() => {})
  edge.kill()
  await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }).catch(() => {})
}
