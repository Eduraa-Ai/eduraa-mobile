import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const appUrl = 'http://localhost:8082'
const outputDir = path.resolve('test-artifacts/attendance')
const debuggingPort = 9339
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eduraa-attendance-edge-'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class Session {
  constructor(socket) {
    this.socket = socket
    this.id = 0
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      if (payload.method === 'Page.javascriptDialogOpening') {
        void this.call('Page.handleJavaScriptDialog', { accept: true })
        return
      }
      if (!payload.id) return
      const pending = this.pending.get(payload.id)
      if (!pending) return
      this.pending.delete(payload.id)
      payload.error ? pending.reject(new Error(payload.error.message)) : pending.resolve(payload.result)
    })
  }
  call(method, params = {}) {
    const id = ++this.id
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
      const target = (await response.json()).find((item) => item.type === 'page')
      if (target?.webSocketDebuggerUrl) {
        const socket = new WebSocket(target.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true })
          socket.addEventListener('error', reject, { once: true })
        })
        return new Session(socket)
      }
    } catch {}
    await sleep(200)
  }
  throw new Error('Browser did not start.')
}

async function evaluate(session, expression) {
  const result = await session.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed.')
  return result.result?.value
}

async function waitForText(session, text, timeout = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(session, `document.body?.innerText.includes(${JSON.stringify(text)})`)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${text}: ${await evaluate(session, 'document.body?.innerText?.slice(0,1800)')}`)
}

async function clickText(session, text) {
  const count = await evaluate(session, `(() => {
    const expected=${JSON.stringify(text)};
    const items=[...document.querySelectorAll('[role="button"],button,[tabindex="0"]')];
    const labels=(item)=>(item.innerText||item.textContent||'').trim().replace(/\\s+/g,' ');
    const containing=items.filter((item)=>labels(item).includes(expected)&&item.getBoundingClientRect().width>0&&item.getBoundingClientRect().height>0);
    const exact=containing.filter((item)=>labels(item)===expected);
    const matches=exact.length===1?exact:containing.sort((a,b)=>labels(a).length-labels(b).length);
    if(matches.length){matches[0].scrollIntoView({block:'center'});matches[0].click();return 1;}
    return 0;
  })()`)
  if (count !== 1) throw new Error(`Expected one button containing ${text}; found ${count}.`)
  await sleep(500)
}

async function fill(session, placeholder, value) {
  const found = await evaluate(session, `(() => {
    const input=[...document.querySelectorAll('input,textarea')].find((item)=>item.placeholder===${JSON.stringify(placeholder)});
    if(!input)return false;
    const prototype=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(value)});
    input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;
  })()`)
  if (!found) throw new Error(`Input not found: ${placeholder}`)
}

async function viewport(session, width, height) {
  await session.call('Emulation.setDeviceMetricsOverride', { width, height, screenWidth: width, screenHeight: height, deviceScaleFactor: 1, mobile: true })
  await sleep(350)
}

async function capture(session, name) {
  await evaluate(session, `(() => { for (const item of document.querySelectorAll('*')) { const rect=item.getBoundingClientRect(); const style=getComputedStyle(item); if(style.position==='fixed'&&rect.left<20&&rect.bottom>innerHeight-70&&rect.width<70&&rect.height<70)item.style.display='none'; } })()`)
  const screenshot = await session.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(outputDir, name), Buffer.from(screenshot.data, 'base64'))
  console.log(`Captured ${name}`)
}

async function login(session, identifier) {
  await waitForText(session, 'Welcome back')
  await fill(session, 'Email or student ID', identifier)
  await fill(session, 'Password', 'Synthetic123!')
  await clickText(session, 'Continue')
  await waitForText(session, 'Attendance')
  await clickText(session, 'Attendance')
}

async function setAttendanceMode(mode) {
  const response = await fetch('http://127.0.0.1:8000/__test__/attendance-mode', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (!response.ok) throw new Error(`Could not set attendance mode to ${mode}.`)
}

async function resetForRole(session, width = 390, height = 844) {
  await session.call('Storage.clearDataForOrigin', { origin: appUrl, storageTypes: 'all' })
  await viewport(session, width, height)
  await session.call('Page.navigate', { url: appUrl })
}

await fs.mkdir(outputDir, { recursive: true })
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })

let session
try {
  session = await connect()
  await session.call('Page.enable')
  await session.call('Runtime.enable')
  await viewport(session, 390, 844)
  await session.call('Page.navigate', { url: appUrl })
  await login(session, 'attendance-teacher@example.test')
  await waitForText(session, 'Submit final attendance')
  await capture(session, 'teacher-initial-390x844.png')

  await clickText(session, 'Absent')
  await waitForText(session, 'Draft saved on this device')
  await capture(session, 'teacher-draft-390x844.png')
  await viewport(session, 320, 700)
  await capture(session, 'teacher-draft-320x700.png')

  await evaluate(session, `(() => { const scrollable=[...document.querySelectorAll('*')].filter((item)=>item.scrollHeight>item.clientHeight+80).sort((a,b)=>b.scrollHeight-b.clientHeight-a.scrollHeight+a.clientHeight)[0]; if(scrollable)scrollable.scrollTop=760; })()`)
  await sleep(500)
  await capture(session, 'teacher-roster-320x700.png')

  await setAttendanceMode('conflict')
  await resetForRole(session)
  await login(session, 'attendance-teacher@example.test')
  await clickText(session, 'Absent')
  await clickText(session, 'Save draft')
  await waitForText(session, 'A newer roster is available')
  await capture(session, 'teacher-conflict-390x844.png')

  await setAttendanceMode('ready')
  await resetForRole(session)
  await login(session, 'attendance-teacher@example.test')
  await session.call('Network.enable')
  await session.call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
  await clickText(session, 'Absent')
  await waitForText(session, 'Draft saved on this device')
  await waitForText(session, 'Offline · keep marking')
  await evaluate(session, `(() => { const scrollable=[...document.querySelectorAll('*')].filter((item)=>item.scrollHeight>item.clientHeight+80).sort((a,b)=>b.scrollHeight-b.clientHeight-a.scrollHeight+a.clientHeight)[0]; if(scrollable)scrollable.scrollTop=0; })()`)
  await sleep(1600)
  await capture(session, 'teacher-offline-draft-390x844.png')
  await session.call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })

  await setAttendanceMode('submitted')
  await resetForRole(session)
  await login(session, 'attendance-teacher@example.test')
  await waitForText(session, 'Attendance submitted')
  await capture(session, 'teacher-submitted-390x844.png')

  await setAttendanceMode('empty')
  await resetForRole(session, 320, 700)
  await login(session, 'attendance-teacher@example.test')
  await waitForText(session, 'No students are enrolled')
  await evaluate(session, `(() => { const scrollable=[...document.querySelectorAll('*')].filter((item)=>item.scrollHeight>item.clientHeight+80).sort((a,b)=>b.scrollHeight-b.clientHeight-a.scrollHeight+a.clientHeight)[0]; if(scrollable)scrollable.scrollTop=560; })()`)
  await sleep(400)
  await capture(session, 'teacher-empty-320x700.png')

  await setAttendanceMode('error')
  await resetForRole(session)
  await login(session, 'attendance-teacher@example.test')
  await waitForText(session, 'Attendance unavailable')
  await capture(session, 'teacher-error-390x844.png')

  await setAttendanceMode('ready')
  await resetForRole(session)
  await login(session, 'attendance-student@example.test')
  await waitForText(session, 'Recent history')
  await capture(session, 'student-summary-390x844.png')
  await viewport(session, 320, 700)
  await capture(session, 'student-summary-320x700.png')
  await viewport(session, 390, 844)
  await evaluate(session, `(() => { const scrollable=[...document.querySelectorAll('*')].filter((item)=>item.scrollHeight>item.clientHeight+80).sort((a,b)=>b.scrollHeight-b.clientHeight-a.scrollHeight+a.clientHeight)[0]; if(scrollable)scrollable.scrollTop=520; })()`)
  await sleep(500)
  await clickText(session, 'Request a correction')
  await waitForText(session, 'What should be corrected?')
  await capture(session, 'student-correction-390x844.png')
  await fill(session, 'Share the date, expected status, and why', 'I attended this class; please review the teacher register.')
  await clickText(session, 'Send request')
  await waitForText(session, 'Correction Pending')
  await capture(session, 'student-correction-pending-390x844.png')

  await resetForRole(session)
  await login(session, 'attendance-leader@example.test')
  await waitForText(session, 'classes submitted')
  await capture(session, 'leadership-summary-390x844.png')
  await viewport(session, 320, 700)
  await capture(session, 'leadership-summary-320x700.png')
  await viewport(session, 390, 844)
  await evaluate(session, `(() => { const scrollable=[...document.querySelectorAll('*')].filter((item)=>item.scrollHeight>item.clientHeight+80).sort((a,b)=>b.scrollHeight-b.clientHeight-a.scrollHeight+a.clientHeight)[0]; if(scrollable)scrollable.scrollTop=820; })()`)
  await sleep(500)
  await capture(session, 'leadership-actions-390x844.png')
  await fetch('http://127.0.0.1:8000/api/v1/attendance/corrections/a8000000-0000-4000-8000-000000000001/resolve', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'approved', resolution_note: 'Reviewed against the teacher register.' }),
  })
  await resetForRole(session)
  await login(session, 'attendance-leader@example.test')
  await waitForText(session, 'student / approved')
  await evaluate(session, `(() => { const scrollable=[...document.querySelectorAll('*')].filter((item)=>item.scrollHeight>item.clientHeight+80).sort((a,b)=>b.scrollHeight-b.clientHeight-a.scrollHeight+a.clientHeight)[0]; if(scrollable)scrollable.scrollTop=680; })()`)
  await sleep(800)
  await capture(session, 'leadership-correction-approved-390x844.png')
  await clickText(session, '10 A')
  await waitForText(session, 'Reopen for correction')
  await evaluate(session, `(() => { const scrollable=[...document.querySelectorAll('*')].filter((item)=>item.scrollHeight>item.clientHeight+80).sort((a,b)=>b.scrollHeight-b.clientHeight-a.scrollHeight+a.clientHeight)[0]; if(scrollable)scrollable.scrollTop=1600; })()`)
  await sleep(500)
  await capture(session, 'leadership-reopen-390x844.png')
  await fill(session, 'Explain what needs correction', 'Teacher confirmed an incorrect absence.')
  await clickText(session, 'Reopen for correction')
  await waitForText(session, 'Reopened 10 A')
  await capture(session, 'leadership-reopened-390x844.png')
  console.log('Attendance rendered journey completed.')
} finally {
  if (session) await session.call('Browser.close').catch(() => {})
  edge.kill()
  await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }).catch(() => {})
}
