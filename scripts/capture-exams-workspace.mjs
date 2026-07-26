import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const appUrl = process.env.EXAMS_APP_URL || 'http://localhost:8082'
const mockUrl = process.env.EXAMS_MOCK_URL || 'http://localhost:8000'
const edgePath =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const outputDir = path.resolve('test-artifacts/exams-workspace')
const debuggingPort = 9335
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eduraa-exams-edge-'))

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
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find((target) => target.type === 'page')
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
      }
    } catch {
      // Edge is still starting.
    }
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
  const result = await session.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.')
  return result.result?.value
}

async function waitForText(session, text, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(session, `document.body?.innerText.includes(${JSON.stringify(text)})`)) return
    await sleep(200)
  }
  const visible = await evaluate(session, 'document.body?.innerText?.slice(0, 1400)')
  throw new Error(`Timed out waiting for "${text}". Visible text: ${visible}`)
}

async function clickByText(session, text, { enabledOnly = false, allowFirst = false } = {}) {
  const result = await evaluate(
    session,
    `(() => {
      const expected = ${JSON.stringify(text)};
      const candidates = [...document.querySelectorAll('[role="button"], [role="tab"], button, [tabindex="0"]')];
      const matching = candidates.filter((item) => {
        const label = (item.innerText || item.textContent || '').trim().replace(/\\s+/g, ' ');
        const enabled = !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true';
        return (label === expected || label.includes(expected)) && (!${enabledOnly} || enabled);
      });
      const exact = matching.filter((item) => (
        (item.innerText || item.textContent || '').trim().replace(/\\s+/g, ' ') === expected
      ));
      const matches = exact.length ? exact : matching;
      if (!matches.length) return { count: 0 };
      if (matches.length > 1 && !${allowFirst}) return { count: matches.length };
      matches[0].scrollIntoView({ block: 'center' });
      matches[0].click();
      return { count: matches.length };
    })()`,
  )
  if (!result.count) {
    const visible = await evaluate(session, 'document.body?.innerText?.slice(0, 1200)')
    throw new Error(`Could not find an enabled button containing "${text}". Visible text: ${visible}`)
  }
  if (result.count > 1 && !allowFirst) throw new Error(`Found ${result.count} buttons containing "${text}".`)
  await sleep(450)
}

async function clickByAriaLabel(session, label) {
  const clicked = await evaluate(
    session,
    `(() => {
      const target = document.querySelector('[aria-label=${JSON.stringify(label)}]');
      if (!target) return false;
      target.scrollIntoView({ block: 'center' });
      target.click();
      return true;
    })()`,
  )
  if (!clicked) throw new Error(`Could not find aria-label "${label}".`)
  await sleep(450)
}

async function fillInputs(session, values) {
  const count = await evaluate(
    session,
    `(() => {
      const values = ${JSON.stringify(values)};
      const inputs = [...document.querySelectorAll('input')];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      values.forEach((value, index) => {
        setter.call(inputs[index], value);
        inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[index].dispatchEvent(new Event('change', { bubbles: true }));
      });
      return inputs.length;
    })()`,
  )
  if (count < values.length) throw new Error(`Expected ${values.length} login inputs; found ${count}.`)
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
  await evaluate(
    session,
    `(() => {
      const scale = ${scale};
      for (const item of document.querySelectorAll('[dir="auto"]')) {
        if (scale === 1) {
          if (item.dataset.examFontSize) item.style.fontSize = item.dataset.examFontSize;
          if (item.dataset.examLineHeight) item.style.lineHeight = item.dataset.examLineHeight;
          delete item.dataset.examFontSize;
          delete item.dataset.examLineHeight;
          continue;
        }
        const style = getComputedStyle(item);
        if (!item.dataset.examFontSize) item.dataset.examFontSize = item.style.fontSize || '';
        if (!item.dataset.examLineHeight) item.dataset.examLineHeight = item.style.lineHeight || '';
        item.style.fontSize = Math.round(parseFloat(style.fontSize) * scale * 10) / 10 + 'px';
        if (style.lineHeight.endsWith('px')) {
          item.style.lineHeight = Math.round(parseFloat(style.lineHeight) * scale * 10) / 10 + 'px';
        }
      }
    })()`,
  )
  await sleep(350)
}

async function scrollPrimary(session, top) {
  await evaluate(
    session,
    `(() => {
      if (${top} === 0) {
        for (const item of document.querySelectorAll('*')) item.scrollTop = 0;
        window.scrollTo(0, 0);
        return;
      }
      const scrollable = [...document.querySelectorAll('*')]
        .filter((item) => item.scrollHeight > item.clientHeight + 80)
        .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];
      if (scrollable) scrollable.scrollTop = ${top};
      else window.scrollTo(0, ${top});
    })()`,
  )
  await sleep(400)
}

async function capture(session, fileName) {
  await evaluate(
    session,
    `(() => {
      for (const item of document.querySelectorAll('*')) {
        const style = getComputedStyle(item);
        const rect = item.getBoundingClientRect();
        if (
          style.position === 'fixed'
          && rect.left < 20
          && rect.bottom > innerHeight - 70
          && rect.width <= 64
          && rect.height <= 64
        ) item.style.display = 'none';
      }
    })()`,
  )
  const result = await session.call('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await fs.writeFile(path.join(outputDir, fileName), Buffer.from(result.data, 'base64'))
  console.log(`Captured ${fileName}`)
}

async function setMockMode(mode) {
  const response = await fetch(`${mockUrl}/__test__/exam-workspace-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (!response.ok) throw new Error(`Could not set exam mock mode ${mode}.`)
}

async function openWorkspace(session) {
  if (!(await evaluate(session, `document.body?.innerText.includes('Teacher papers')`))) {
    await waitForText(session, 'Teacher & practice exams', 15000)
    await clickByText(session, 'Teacher & practice exams')
    await waitForText(session, 'Teacher papers', 15000)
  }
}

await fs.mkdir(outputDir, { recursive: true })
for (const entry of await fs.readdir(outputDir)) {
  if (entry.toLowerCase().endsWith('.png')) await fs.rm(path.join(outputDir, entry))
}

const edge = spawn(
  edgePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let session
try {
  session = await connect(await waitForDebugger())
  await session.call('Page.enable')
  await session.call('Runtime.enable')
  await setViewport(session, 390, 844)
  await session.call('Page.navigate', { url: appUrl })
  await waitForText(session, 'Welcome back', 30000)
  await fillInputs(session, ['exam-b2b.student@example.test', 'Synthetic123!'])
  await clickByText(session, 'Continue')
  await waitForText(session, 'Next actions', 20000)
  await setMockMode('loading')
  await clickByText(session, 'Teacher & practice exams')
  await sleep(450)
  await capture(session, '00-loading-workspace-390x844.png')
  await waitForText(session, 'Teacher papers', 15000)
  await setMockMode('ready')
  await capture(session, '01-teacher-workspace-390x844.png')

  await scrollPrimary(session, 300)
  await capture(session, '02-teacher-primary-action-390x844.png')
  await clickByText(session, 'More', { enabledOnly: true, allowFirst: true })
  await capture(session, '02b-teacher-expanded-actions-390x844.png')
  await setViewport(session, 320, 700)
  await capture(session, '03-teacher-expanded-actions-320x700.png')
  await setFontScale(session, 1.18)
  await capture(session, '03b-teacher-increased-type-320x700.png')
  await setFontScale(session, 1)
  await setViewport(session, 390, 844)

  await clickByText(session, 'Start a fresh retest', { enabledOnly: true })
  await waitForText(session, 'Start a fresh retest?')
  await capture(session, '04-teacher-retest-confirmation-390x844.png')
  await clickByText(session, 'Start retest')
  await waitForText(session, 'Electrostatics · Paper A', 15000)
  await waitForText(session, '0/1 answered')
  await capture(session, '05-teacher-fresh-retest-390x844.png')

  await clickByAriaLabel(session, 'Save progress and leave attempt')
  await waitForText(session, 'Next actions', 15000)
  await openWorkspace(session)
  await scrollPrimary(session, 300)
  await capture(session, '05b-retained-prior-result-390x844.png')
  await scrollPrimary(session, 0)
  await clickByAriaLabel(session, 'Practice exams')
  await waitForText(session, 'Organic Chemistry Repair Set · Aldehydes and Ketones')
  await capture(session, '06-practice-workspace-390x844.png')
  await scrollPrimary(session, 280)
  await clickByText(session, 'More', { enabledOnly: true, allowFirst: true })
  await capture(session, '07-practice-expanded-actions-390x844.png')
  await setViewport(session, 320, 700)
  await capture(session, '07b-practice-expanded-actions-320x700.png')
  await setFontScale(session, 1.18)
  await capture(session, '07c-practice-increased-type-320x700.png')
  await setFontScale(session, 1)
  await setViewport(session, 390, 844)

  await clickByText(session, 'Download checked PDF', { enabledOnly: true })
  await waitForText(session, 'Downloaded the latest checked result')
  await capture(session, '08-download-success-390x844.png')

  await clickByText(session, 'More', { enabledOnly: true, allowFirst: true })
  await clickByText(session, 'Delete practice paper', { enabledOnly: true })
  await waitForText(session, 'Delete practice paper?')
  await capture(session, '09-delete-confirmation-390x844.png')
  await clickByText(session, 'Delete paper')
  await waitForText(session, 'Teacher exams were not affected')
  await capture(session, '10-delete-success-390x844.png')

  const auditResponse = await fetch(`${mockUrl}/__test__/exam-workspace-audit`)
  const audit = await auditResponse.json()
  const teacherRetest = audit.events.find((event) => event.action === 'retest' && event.paper_id.startsWith('961'))
  if (!teacherRetest || teacherRetest.exam_id !== '96000000-0000-4000-8000-000000000001' || teacherRetest.reason !== 'retest') {
    throw new Error(`Teacher retest did not carry exam_id + reason=retest: ${JSON.stringify(audit.events)}`)
  }
  if (!audit.events.some((event) => event.action === 'download')) {
    throw new Error('Checked-paper download did not reach the synthetic backend.')
  }
  if (!audit.events.some((event) => event.action === 'delete' && event.paper_id.startsWith('962'))) {
    throw new Error('Owned practice-paper deletion did not reach the synthetic backend.')
  }
  await fs.writeFile(path.join(outputDir, 'network-audit.json'), `${JSON.stringify(audit, null, 2)}\n`)

  await setMockMode('practice-error')
  await session.call('Page.reload', { ignoreCache: true })
  await openWorkspace(session)
  await clickByAriaLabel(session, 'Practice exams')
  await waitForText(session, 'Practice papers unavailable')
  await scrollPrimary(session, 0)
  await capture(session, '11-practice-error-390x844.png')

  await setMockMode('empty')
  await session.call('Page.reload', { ignoreCache: true })
  await openWorkspace(session)
  await waitForText(session, 'You are all caught up')
  await scrollPrimary(session, 0)
  await sleep(500)
  await scrollPrimary(session, 0)
  await capture(session, '12-empty-teacher-390x844.png')
  await clickByAriaLabel(session, 'Practice exams')
  await waitForText(session, 'Build your first practice paper')
  await scrollPrimary(session, 0)
  await sleep(500)
  await scrollPrimary(session, 0)
  await capture(session, '13-empty-practice-390x844.png')

  console.log('B2B exams rendered journey completed.')
} finally {
  if (session) {
    try {
      await session.call('Browser.close')
    } catch {
      // The browser may already have closed after a failed navigation.
    }
  }
  edge.kill()
  await Promise.race([new Promise((resolve) => edge.once('exit', resolve)), sleep(2000)])
  try {
    await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
  } catch (error) {
    console.warn(`Could not remove temporary Edge profile ${profileDir}: ${error.message}`)
  }
}
