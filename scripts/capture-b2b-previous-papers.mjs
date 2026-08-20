import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const appUrl = process.env.B2B_PAPERS_APP_URL || 'http://localhost:8081'
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const outputDir = path.resolve('test-artifacts/b2b-previous-papers')
const debuggingPort = 9444
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eduraa-b2b-papers-edge-'))
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
  const body = await evaluate(session, 'document.body?.innerText?.slice(0, 1800)')
  throw new Error(`Timed out waiting for "${expected}". Visible text: ${body}`)
}

async function waitForTextAbsent(session, expected, timeout = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (!await evaluate(session, `document.body?.innerText?.includes(${JSON.stringify(expected)})`)) return
    await sleep(200)
  }
  throw new Error(`Timed out waiting for "${expected}" to disappear.`)
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

async function fillSearch(session, value) {
  const filled = await evaluate(session, `(() => {
    const input = document.querySelector('input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    return true;
  })()`)
  if (!filled) throw new Error('Could not find the paper search input.')
  await sleep(400)
}

async function click(session, selectorExpression, label) {
  const clicked = await evaluate(session, `(() => {
    const target = ${selectorExpression};
    if (!target) return false;
    target.click();
    return true;
  })()`)
  if (!clicked) throw new Error(`Could not click ${label}.`)
  await sleep(500)
}

async function clickText(session, expected) {
  await click(
    session,
    `[...document.querySelectorAll('[role="button"], [role="tab"], button')].find((item) => (item.innerText || item.textContent || '').replace(/\\s+/g, ' ').includes(${JSON.stringify(expected)}))`,
    expected,
  )
}

async function clickAria(session, label) {
  await click(session, `document.querySelector('[aria-label=${JSON.stringify(label)}]')`, label)
}

async function clickFilterChoice(session, groupLabel, choiceLabel) {
  const clicked = await evaluate(session, `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const group = [...document.querySelectorAll('*')]
      .filter((item) => normalize(item.textContent) === ${JSON.stringify(groupLabel.toLowerCase())})
      .sort((left, right) => left.children.length - right.children.length)[0];
    if (!group) return false;
    const groupRect = group.getBoundingClientRect();
    const choice = [...document.querySelectorAll('[role="button"], button')]
      .filter((item) => normalize(item.innerText || item.textContent) === ${JSON.stringify(choiceLabel.toLowerCase())})
      .map((item) => ({ item, rect: item.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.top >= groupRect.top - 4)
      .sort((left, right) => Math.abs(left.rect.top - groupRect.bottom) - Math.abs(right.rect.top - groupRect.bottom))[0]?.item;
    if (!choice) return false;
    choice.click();
    return true;
  })()`)
  if (!clicked) throw new Error(`Could not click ${choiceLabel} in the ${groupLabel} filter.`)
  await sleep(500)
}

async function capture(session, filename) {
  await evaluate(session, `(() => {
    for (const item of document.querySelectorAll('*')) {
      const rect = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      if (style.position === 'fixed' && rect.left < 20 && rect.bottom > innerHeight - 60 && rect.width <= 64 && rect.height <= 64) item.style.display = 'none';
    }
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const contextLabel = [...document.querySelectorAll('*')].find((item) => {
      const text = normalize(item.textContent);
      return item.children.length === 0 && (text === 'ENROLLMENT-MATCHED LIBRARY' || text === 'AUTHORIZED TEACHER LIBRARY');
    });
    let hero = contextLabel?.parentElement;
    while (hero && hero !== document.body) {
      const rect = hero.getBoundingClientRect();
      if (rect.width >= 250 && rect.height >= 110) break;
      hero = hero.parentElement;
    }
    if (hero && hero !== document.body) {
      const display = hero.style.display;
      hero.style.display = 'none';
      void hero.offsetHeight;
      hero.style.display = display;
      void hero.offsetHeight;
    }
  })()`)
  await sleep(180)
  const result = await session.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.writeFile(path.join(outputDir, filename), Buffer.from(result.data, 'base64'))
  console.log(`Captured ${filename}`)
}

async function scrollContent(session, top) {
  await evaluate(session, `(() => {
    const scrollable = [...document.querySelectorAll('*')]
      .filter((item) => item.scrollHeight > item.clientHeight + 80)
      .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];
    if (scrollable) scrollable.scrollTop = ${top};
    else window.scrollTo(0, ${top});
  })()`)
  await sleep(450)
}

async function remountContextHeroForCapture(session) {
  const remounted = await evaluate(session, `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const label = [...document.querySelectorAll('*')].find((item) => {
      const text = normalize(item.textContent);
      return item.children.length === 0 && (text === 'ENROLLMENT-MATCHED LIBRARY' || text === 'AUTHORIZED TEACHER LIBRARY');
    });
    let hero = label?.parentElement;
    while (hero && hero !== document.body) {
      const rect = hero.getBoundingClientRect();
      if (rect.width >= 250 && rect.height >= 110) break;
      hero = hero.parentElement;
    }
    if (!hero || hero === document.body) return false;
    hero.replaceWith(hero.cloneNode(true));
    return true;
  })()`)
  if (!remounted) throw new Error('Could not remount the authorization context for settled capture.')
  await sleep(500)
}

async function setFontScale(session, scale) {
  await evaluate(session, `(() => {
    for (const item of document.querySelectorAll('[dir="auto"]')) {
      const style = getComputedStyle(item);
      item.style.fontSize = Math.round(parseFloat(style.fontSize) * ${scale} * 10) / 10 + 'px';
      if (style.lineHeight.endsWith('px')) item.style.lineHeight = Math.round(parseFloat(style.lineHeight) * ${scale} * 10) / 10 + 'px';
    }
  })()`)
  await sleep(450)
}

async function setSchoolMode(mode) {
  const response = await fetch('http://localhost:8000/__test__/school-previous-papers-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (!response.ok) throw new Error(`Could not set school previous-papers mode ${mode}.`)
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
for (const entry of await fs.readdir(outputDir)) {
  if (entry.endsWith('.png')) await fs.rm(path.join(outputDir, entry))
}

const edge = spawn(edgePath, [
  '--headless=new',
  '--hide-scrollbars',
  '--no-first-run',
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: 'ignore' })

let session
try {
  session = await connectDebugger()
  await session.call('Page.enable')
  await session.call('Runtime.enable')
  await setViewport(session, 390, 844)
  await setSchoolMode('ready')
  await session.call('Page.navigate', { url: appUrl })

  await login(session, 'school-student@example.test')
  await waitForText(session, 'School previous papers')
  await clickAria(session, 'School previous question papers')
  await waitForText(session, 'Published papers are matched to your school and class.')
  await waitForText(session, 'Electrostatics practice')
  await capture(session, 'student-practice-390x844.png')
  await clickText(session, 'Attempt again')
  await waitForText(session, 'answered')
  await capture(session, 'student-attempt-destination-390x844.png')
  await clickAria(session, 'Save progress and leave attempt')
  await waitForText(session, 'Ready when you are')
  await capture(session, 'student-attempt-return-390x844.png')
  await scrollContent(session, 330)
  await capture(session, 'student-practice-list-390x844.png')
  await setFontScale(session, 1.3)
  await capture(session, 'student-practice-list-large-type-390x844.png')
  await scrollContent(session, 99999)
  await capture(session, 'student-practice-bottom-large-type-390x844.png')
  await setFontScale(session, 1 / 1.3)
  await scrollContent(session, 0)
  await setViewport(session, 320, 700)
  await capture(session, 'student-practice-320x700.png')
  await setViewport(session, 390, 844)
  await clickAria(session, 'Show paper filters')
  await waitForText(session, 'SUBJECT')
  await fillSearch(session, 'not in this library')
  await waitForText(session, 'No practice-ready papers match')
  await scrollContent(session, 500)
  await capture(session, 'student-filter-no-results-390x844.png')
  await scrollContent(session, 0)
  await clickAria(session, 'Clear paper search')
  await waitForText(session, 'Electrostatics practice')
  await clickAria(session, 'Hide paper filters')
  await clickText(session, 'Shared PDFs')
  await waitForText(session, 'Mathematics Annual Examination')
  await capture(session, 'student-shared-390x844.png')
  await scrollContent(session, 330)
  await capture(session, 'student-shared-list-390x844.png')
  await clickText(session, 'Open PDF')
  await waitForText(session, 'open this PDF')
  await scrollContent(session, 650)
  await capture(session, 'student-shared-pdf-error-390x844.png')

  await setSchoolMode('loading')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'School previous papers')
  await clickAria(session, 'School previous question papers')
  await waitForText(session, 'Matching your school papers')
  await capture(session, 'student-loading-390x844.png')
  await waitForText(session, 'Electrostatics practice', 10000)

  await setSchoolMode('error')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'School previous papers')
  await clickAria(session, 'School previous question papers')
  await waitForText(session, 'Papers could not be loaded')
  await scrollContent(session, 0)
  await setViewport(session, 320, 700)
  await setViewport(session, 390, 844)
  await sleep(1000)
  await remountContextHeroForCapture(session)
  await capture(session, 'student-error-390x844.png')

  await setSchoolMode('forbidden')
  await clickText(session, 'Retry')
  await waitForText(session, 'Paper access changed')
  await setViewport(session, 320, 700)
  await setViewport(session, 390, 844)
  await capture(session, 'student-permission-revoked-390x844.png')

  await setSchoolMode('empty')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'School previous papers')
  await clickAria(session, 'School previous question papers')
  await waitForText(session, 'No practice-ready papers yet')
  await scrollContent(session, 0)
  await setViewport(session, 320, 700)
  await setViewport(session, 390, 844)
  await sleep(1000)
  await remountContextHeroForCapture(session)
  await capture(session, 'student-empty-390x844.png')

  await setSchoolMode('ready')

  await signOutLocal(session)
  await login(session, 'school-teacher@example.test')
  await waitForText(session, 'Workspace')
  await clickAria(session, 'School previous question papers')
  await waitForText(session, 'Only papers owned by your teacher account appear here.')
  await waitForText(session, 'View details')
  if (await evaluate(session, `document.body?.innerText?.includes('Start practice')`)) {
    throw new Error('Teacher screen exposed a student-only Start practice action.')
  }
  await setViewport(session, 391, 844)
  await setViewport(session, 390, 844)
  await waitForText(session, 'Eduraa International School')
  await sleep(700)
  await capture(session, 'teacher-practice-390x844.png')
  await scrollContent(session, 330)
  await capture(session, 'teacher-practice-list-390x844.png')
  await scrollContent(session, 0)
  await clickText(session, 'View details')
  await waitForText(session, 'TEACHER REFERENCE')
  await waitForText(session, 'Download PDF')
  if (await evaluate(session, `document.body?.innerText?.includes('Attempt Paper') || document.body?.innerText?.includes('Interactive Quiz')`)) {
    throw new Error('Teacher reference detail exposed a student-only action.')
  }
  await capture(session, 'teacher-reference-destination-390x844.png')
  await clickAria(session, 'School previous question papers')
  await waitForText(session, 'Only papers owned by your teacher account appear here.')
  await scrollContent(session, 330)
  await setViewport(session, 391, 844)
  await setViewport(session, 390, 844)
  await sleep(900)
  await capture(session, 'teacher-reference-return-390x844.png')
  await scrollContent(session, 0)
  await clickText(session, 'Shared PDFs')
  await waitForText(session, 'Original paper files')
  await sleep(1200)
  await setViewport(session, 391, 844)
  await setViewport(session, 390, 844)
  await capture(session, 'teacher-shared-390x844.png')
  await scrollContent(session, 330)
  await capture(session, 'teacher-shared-list-390x844.png')
  await scrollContent(session, 0)
  await clickAria(session, 'Show paper filters')
  await waitForText(session, 'PUBLICATION')
  await capture(session, 'teacher-shared-filters-390x844.png')
  await scrollContent(session, 280)
  await capture(session, 'teacher-shared-filters-publication-390x844.png')
  await scrollContent(session, 0)
  await clickFilterChoice(session, 'PUBLICATION', 'published')
  await waitForTextAbsent(session, 'Science Midterm Paper')
  await scrollContent(session, 280)
  await capture(session, 'teacher-shared-filters-publication-published-390x844.png')
  await scrollContent(session, 0)
  await clickAria(session, 'Hide paper filters')
  await setViewport(session, 320, 700)
  await setViewport(session, 390, 844)
  await sleep(1000)
  await remountContextHeroForCapture(session)
  await capture(session, 'teacher-shared-filter-published-390x844.png')
  await clickAria(session, 'Show paper filters')
  await clickFilterChoice(session, 'PUBLICATION', 'All')
  await waitForText(session, 'Science Midterm Paper')
  await clickAria(session, 'Hide paper filters')
  await setViewport(session, 391, 844)
  await setViewport(session, 390, 844)
  await sleep(900)
  await capture(session, 'teacher-shared-filter-cleared-390x844.png')
  await clickText(session, 'Structured papers')
  await waitForText(session, 'Your published papers')
  await setViewport(session, 320, 700)
  await setViewport(session, 390, 844)
  await sleep(1200)
  await remountContextHeroForCapture(session)
  await capture(session, 'teacher-practice-390x844.png')
  await scrollContent(session, 330)
  await capture(session, 'teacher-practice-list-390x844.png')

  console.log('B2B Previous Papers rendered journey completed.')
} finally {
  if (session) {
    try { await session.call('Browser.close') } catch { /* Browser may already be closed. */ }
  }
  edge.kill()
  await Promise.race([new Promise((resolve) => edge.once('exit', resolve)), sleep(2000)])
  await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}
