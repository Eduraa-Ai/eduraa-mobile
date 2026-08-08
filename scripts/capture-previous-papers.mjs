import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const appUrl = process.env.PYQ_APP_URL || 'http://localhost:8081'
const mockUrl = process.env.PYQ_MOCK_URL || 'http://localhost:8000'
const edgePath =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const outputDir = path.resolve('test-artifacts/previous-papers')
const debuggingPort = 9333
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eduraa-pyq-edge-'))

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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.')
  }
  return result.result?.value
}

async function waitForText(session, text, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const visible = await evaluate(
      session,
      `document.body && document.body.innerText.includes(${JSON.stringify(text)})`,
    )
    if (visible) return
    await sleep(200)
  }
  const body = await evaluate(session, 'document.body?.innerText?.slice(0, 1200)')
  throw new Error(`Timed out waiting for "${text}". Visible text: ${body}`)
}

async function clickByText(session, text, { allowFirst = false } = {}) {
  const result = await evaluate(
    session,
    `(() => {
      const expected = ${JSON.stringify(text)};
      const candidates = [...document.querySelectorAll('[role="button"], [role="radio"], [role="checkbox"], button')];
      const matches = candidates.filter((item) => {
        const label = (item.innerText || item.textContent || '').trim().replace(/\\s+/g, ' ');
        return label === expected || label.includes(expected);
      });
      if (!matches.length) return { count: 0 };
      if (matches.length > 1 && !${allowFirst}) return { count: matches.length };
      matches[0].click();
      return { count: matches.length };
    })()`,
  )
  if (!result.count) throw new Error(`Could not find a button containing "${text}".`)
  if (result.count > 1 && !allowFirst) throw new Error(`Found ${result.count} buttons containing "${text}".`)
  await sleep(300)
}

async function pressByText(session, text) {
  const point = await evaluate(session, `(() => {
    const expected = ${JSON.stringify(text)};
    const target = [...document.querySelectorAll('[role="button"], button, [tabindex="0"]')]
      .find((item) => (item.innerText || item.textContent || '').trim().replace(/\\s+/g, ' ').includes(expected));
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`)
  if (!point) throw new Error(`Could not find button containing "${text}".`)
  await session.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
  await session.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await sleep(150)
  return point
}

async function releasePress(session, point) {
  await session.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await sleep(350)
}

async function clickByAriaLabel(session, label) {
  const clicked = await evaluate(
    session,
    `(() => {
      const target = document.querySelector('[aria-label=${JSON.stringify(label)}]');
      if (!target) return false;
      target.click();
      return true;
    })()`,
  )
  if (!clicked) throw new Error(`Could not find aria-label "${label}".`)
  await sleep(300)
}

async function longPressByText(session, text, duration = 3300) {
  const center = await evaluate(
    session,
    `(() => {
      const expected = ${JSON.stringify(text)};
      const target = [...document.querySelectorAll('[role="button"], button')]
        .find((item) => (item.innerText || item.textContent || '').trim().replace(/\\s+/g, ' ').includes(expected));
      if (!target) return null;
      target.scrollIntoView({ block: 'center' });
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
  )
  if (!center) throw new Error(`Could not find a button containing "${text}" for long press.`)
  await session.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: center.x, y: center.y, button: 'left', clickCount: 1 })
  await sleep(duration)
  await session.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: center.x, y: center.y, button: 'left', clickCount: 1 })
  await sleep(500)
}

async function scrollPrimaryToBottom(session) {
  await evaluate(
    session,
    `(() => {
      const scrollable = [...document.querySelectorAll('*')]
        .filter((item) => item.scrollHeight > item.clientHeight + 80)
        .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];
      if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
      else window.scrollTo(0, document.body.scrollHeight);
    })()`,
  )
  await sleep(400)
}

async function fillInputs(session, values) {
  const filled = await evaluate(
    session,
    `(() => {
      const values = ${JSON.stringify(values)};
      const inputs = [...document.querySelectorAll('input')];
      if (inputs.length < values.length) return { count: inputs.length };
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      values.forEach((value, index) => {
        setter.call(inputs[index], value);
        inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[index].dispatchEvent(new Event('change', { bubbles: true }));
      });
      return { count: inputs.length };
    })()`,
  )
  if (filled.count < values.length) throw new Error(`Expected ${values.length} login inputs; found ${filled.count}.`)
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
  await sleep(300)
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
  await evaluate(
    session,
    `(() => {
      for (const item of document.querySelectorAll('*')) {
        const label = item.getAttribute('aria-label') || '';
        const rect = item.getBoundingClientRect();
        const style = getComputedStyle(item);
        const isDeveloperControl =
          label.toLowerCase().includes('developer') ||
          label.toLowerCase().includes('menu') ||
          (
            rect.left < 20 &&
            rect.bottom > innerHeight - 60 &&
            rect.width <= 64 &&
            rect.height <= 64
          );
        if (isDeveloperControl && style.position === 'fixed') {
          item.style.display = 'none';
        }
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
  const response = await fetch(`${mockUrl}/__test__/previous-papers-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (!response.ok) throw new Error(`Could not set mock mode ${mode}.`)
}

async function captureStudentNavigationLayouts(session, width, height) {
  await setViewport(session, width, height)
  const layouts = [
    ['Home', 'home'],
    ['Learning', 'learning'],
    ['Papers', 'papers'],
    ['Results', 'results'],
    ['Profile', 'profile'],
    ['Previous-year JEE papers', 'previous'],
  ]

  for (const [accessibilityLabel, fileLabel] of layouts) {
    await clickByAriaLabel(session, accessibilityLabel)
    await sleep(500)
    await capture(session, `nav-${fileLabel}-${width}x${height}.png`)
  }

  await clickByAriaLabel(session, 'Home')
  await waitForText(session, 'Quick actions')
}

await fs.mkdir(outputDir, { recursive: true })
for (const entry of await fs.readdir(outputDir)) {
  if (entry.toLowerCase().endsWith('.png')) {
    await fs.rm(path.join(outputDir, entry))
  }
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

  await fillInputs(session, ['synthetic.jee.mobile@example.test', 'Synthetic123!'])
  await clickByText(session, 'Continue')
  await waitForText(session, 'Quick actions', 20000)

  await captureStudentNavigationLayouts(session, 390, 844)
  await captureStudentNavigationLayouts(session, 320, 700)
  await setViewport(session, 390, 844)

  await setMockMode('loading')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'Quick actions', 20000)
  await clickByAriaLabel(session, 'Previous-year JEE papers')
  await waitForText(session, 'Opening the JEE archive')
  await capture(session, '00-library-loading-390x844.png')
  await waitForText(session, 'The past becomes your next advantage.')
  await capture(session, '02-library-390x844.png')
  await clickByAriaLabel(session, 'Go back')
  await waitForText(session, 'Quick actions')
  await capture(session, '15-library-back-home-390x844.png')

  await setMockMode('papers-error')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'Quick actions', 20000)
  await clickByAriaLabel(session, 'Previous-year JEE papers')
  await waitForText(session, 'The paper archive paused')
  await capture(session, '01-library-error-390x844.png')

  await setMockMode('ready')
  await clickByText(session, 'Try again')
  await waitForText(session, 'The past becomes your next advantage.')

  await setMockMode('empty')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'Quick actions', 20000)
  await clickByAriaLabel(session, 'Previous-year JEE papers')
  await waitForText(session, 'No published papers yet')
  await capture(session, '03-library-empty-390x844.png')

  await setMockMode('ready')
  await clickByText(session, 'Check again')
  await waitForText(session, 'JEE Main 2024 · Paper 1')
  await clickByAriaLabel(session, 'JEE Main 2024 · Paper 1, 8 questions')
  await waitForText(session, 'Shape your set')
  await waitForText(session, '8 previous-year questions')
  await capture(session, '04-builder-full-paper-390x844.png')

  await clickByText(session, 'Subjects')
  await clickByText(session, 'Physics')
  await clickByText(session, 'Chemistry')
  await waitForText(session, '6 previous-year questions')
  await capture(session, '05-builder-multi-subject-390x844.png')

  await setMockMode('chapters-error')
  await clickByText(session, 'Chapters')
  await waitForText(session, 'Could not load chapters')
  await setViewport(session, 391, 844)
  await sleep(120)
  await setViewport(session, 390, 844)
  await sleep(350)
  await capture(session, '06a-chapters-error-390x844.png')
  await setMockMode('ready')
  await clickByText(session, 'Retry')
  await waitForText(session, 'Electrostatics (2)')
  await sleep(350)
  await capture(session, '06a2-chapters-recovered-390x844.png')
  await setMockMode('questions-error')
  await clickByText(session, 'Electrostatics (2)')
  await clickByText(session, 'Atomic Structure (1)')
  await waitForText(session, 'Question count unavailable')
  await setViewport(session, 391, 844)
  await sleep(120)
  await setViewport(session, 390, 844)
  await sleep(350)
  await capture(session, '06b-questions-error-390x844.png')
  await setMockMode('ready')
  await clickByText(session, 'Retry question count')
  await waitForText(session, '3 previous-year questions')
  await waitForText(session, 'Practice set ready')
  await setViewport(session, 391, 844)
  await sleep(120)
  await setViewport(session, 390, 844)
  await sleep(500)
  await capture(session, '06-builder-multi-chapter-390x844.png')
  await setViewport(session, 320, 700)
  await capture(session, '06e-builder-multi-chapter-320x700.png')
  await setViewport(session, 390, 844)
  await clickByText(session, 'No timer')
  await waitForText(session, 'fresh untimed attempt')
  await scrollPrimaryToBottom(session)
  await capture(session, '06c-builder-untimed-390x844.png')
  await setViewport(session, 320, 700)
  await scrollPrimaryToBottom(session)
  await capture(session, '06f-builder-untimed-320x700.png')
  await setViewport(session, 390, 844)
  await clickByText(session, 'Use timer')
  await clickByText(session, '90m')
  await waitForText(session, 'fresh 90-minute attempt')
  await scrollPrimaryToBottom(session)
  await capture(session, '06d-builder-custom-timer-390x844.png')
  await setViewport(session, 320, 700)
  await scrollPrimaryToBottom(session)
  await capture(session, '06g-builder-custom-timer-320x700.png')
  await setViewport(session, 390, 844)
  await clickByText(session, 'Start chapters')
  await waitForText(session, '2 chapter practice', 15000)
  await waitForText(session, 'answered')
  const timedAttemptVisible = await evaluate(
    session,
    `document.body && /\\b\\d{2}:\\d{2}\\b/.test(document.body.innerText)`,
  )
  if (!timedAttemptVisible) throw new Error('Timed previous-paper attempt did not render a countdown timer.')
  await capture(session, '06h-timed-attempt-390x844.png')
  await clickByAriaLabel(session, 'Save progress and leave attempt')
  await waitForText(session, 'Shape your set')
  await scrollPrimaryToBottom(session)
  await clickByText(session, 'No timer')
  await waitForText(session, 'fresh untimed attempt')

  await clickByText(session, 'Preview questions')
  await waitForText(session, 'What you will get')
  await capture(session, '07-preview-390x844.png')

  await setViewport(session, 320, 700)
  await capture(session, '08-preview-320x700.png')
  await clickByText(session, 'Reveal answer', { allowFirst: true })
  await waitForText(session, 'Answer: B')
  await evaluate(
    session,
    `(() => {
      const scrollable = [...document.querySelectorAll('*')]
        .filter((item) => item.scrollHeight > item.clientHeight + 80)
        .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];
      if (scrollable) scrollable.scrollTop = 520;
      else window.scrollTo(0, 520);
    })()`,
  )
  await sleep(300)
  await capture(session, '09-answer-revealed-320x700.png')
  await clickByText(session, 'View solution', { allowFirst: true })
  await waitForText(session, 'The total flux is')
  await evaluate(
    session,
    `(() => {
      const scrollable = [...document.querySelectorAll('*')]
        .filter((item) => item.scrollHeight > item.clientHeight + 80)
        .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];
      if (scrollable) scrollable.scrollTop = 780;
      else window.scrollTo(0, 780);
    })()`,
  )
  await sleep(300)
  await capture(session, '09b-solution-revealed-320x700.png')
  await evaluate(
    session,
    `(() => {
      const scrollable = [...document.querySelectorAll('*')]
        .filter((item) => item.scrollHeight > item.clientHeight + 80)
        .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];
      if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
      else window.scrollTo(0, document.body.scrollHeight);
    })()`,
  )
  await sleep(500)
  await capture(session, '10-preview-end-320x700.png')

  await setViewport(session, 390, 844)
  await setMockMode('reused')
  await clickByText(session, 'Start this practice set')
  await waitForText(session, 'Keep your place or begin fresh.')
  await capture(session, '11-resume-choice-390x844.png')
  await clickByText(session, 'Not now')

  await setMockMode('start-error')
  await clickByText(session, 'Start this practice set')
  await waitForText(session, 'Assembly paused—not your progress.')
  await capture(session, '12-assembly-error-390x844.png')
  await clickByText(session, 'Back to my selection')

  await setMockMode('slow-start')
  await clickByText(session, 'Start this practice set')
  await waitForText(session, 'Assembling your paper')
  await capture(session, '13-assembly-390x844.png')
  await waitForText(session, '2 chapter practice', 15000)
  await sleep(1500)
  await capture(session, '14-attempt-handoff-390x844.png')
  const timerVisible = await evaluate(
    session,
    `document.body && /\\b\\d{2}:\\d{2}\\b/.test(document.body.innerText)`,
  )
  if (timerVisible) throw new Error('Untimed previous-paper attempt rendered a countdown timer.')

  const hasResumedAnswer = await evaluate(
    session,
    `document.body?.innerText?.includes('1/3 answered')`,
  )
  if (!hasResumedAnswer) {
    await clickByText(session, 'B', { allowFirst: true })
  }
  await waitForText(session, '1/3 answered')
  await capture(session, '14b-answer-ready-390x844.png')

  await clickByText(session, 'Submit')
  await waitForText(session, 'Ready to submit?')
  await longPressByText(session, 'Hold to submit')
  await waitForText(session, 'Paper submitted')
  await waitForText(session, 'Retest')
  await capture(session, '17-checking-attempt-again-390x844.png')
  await setViewport(session, 360, 800)
  await setFontScale(session, 1.3)
  await capture(session, '17a-submitted-enlarged-type-360x800.png')
  await setFontScale(session, 1 / 1.3)
  await setViewport(session, 390, 844)
  const checkedPapersPress = await pressByText(session, 'Open checked papers')
  await capture(session, '17a2-open-checked-papers-pressed-390x844.png')
  await releasePress(session, checkedPapersPress)
  await waitForText(session, 'Results that')
  await capture(session, '17b-return-to-checked-papers-390x844.png')
  await clickByAriaLabel(session, 'Papers')
  await waitForText(session, 'Paper submitted')
  await clickByText(session, 'View results')
  await waitForText(session, 'PERFORMANCE REPORT')
  await capture(session, '17c-view-results-390x844.png')
  await clickByAriaLabel(session, 'Back to checked papers')
  await waitForText(session, 'Results that')
  await clickByAriaLabel(session, 'Papers')
  await waitForText(session, 'Paper submitted')
  await capture(session, '17d-submitted-context-restored-390x844.png')
  await clickByText(session, 'Retest')
  await waitForText(session, '0/3 answered')
  await waitForText(session, '0/3 complete')
  await evaluate(
    session,
    `(() => {
      for (const item of document.querySelectorAll('*')) {
        const style = getComputedStyle(item);
        const rect = item.getBoundingClientRect();
        if (
          style.position === 'fixed'
          && rect.left < 20
          && rect.bottom > innerHeight - 60
          && rect.width <= 60
          && rect.height <= 60
        ) {
          item.style.display = 'none';
        }
      }
    })()`,
  )
  await capture(session, '18-fresh-attempt-390x844.png')
  await clickByAriaLabel(session, 'Save progress and leave attempt')
  await waitForText(session, 'What you will get')
  const returnedToPreviousPapers = await evaluate(
    session,
    `Boolean(document.querySelector('[aria-label="Previous-year JEE papers"]'))`,
  )
  if (!returnedToPreviousPapers) {
    throw new Error('Previous Papers tab did not restore after leaving the attempt player.')
  }
  await capture(session, '19-return-from-attempt-390x844.png')

  await evaluate(session, `(() => { localStorage.clear(); sessionStorage.clear(); })()`)
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'Welcome back', 30000)
  await fillInputs(session, ['pr6.ineligible@example.test', 'Synthetic123!'])
  await clickByText(session, 'Continue')
  await waitForText(session, 'Next best action', 20000)
  const ineligibleHasPreviousPapersTab = await evaluate(
    session,
    `Boolean(document.querySelector('[aria-label="Previous-year JEE papers"]'))`,
  )
  if (ineligibleHasPreviousPapersTab) {
    throw new Error('Previous Papers tab rendered for an ineligible learner fixture.')
  }
  await capture(session, '16-ineligible-home-390x844.png')

  console.log('Previous Papers rendered journey completed.')
} finally {
  if (session) {
    try {
      await session.call('Browser.close')
    } catch {
      // The browser may already have closed after a failed navigation.
    }
  }
  edge.kill()
  await Promise.race([
    new Promise((resolve) => edge.once('exit', resolve)),
    sleep(2000),
  ])
  try {
    await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
  } catch (error) {
    console.warn(`Could not remove temporary Edge profile ${profileDir}: ${error.message}`)
  }
}
