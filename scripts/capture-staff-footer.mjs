import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const appUrl = process.env.ATTENDANCE_APP_URL || 'http://localhost:8082'
const outputDir = path.resolve('test-artifacts/staff-footer')
const port = 9341
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eduraa-staff-footer-'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class BrowserSession {
  constructor(socket) {
    this.socket = socket
    this.id = 0
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
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
  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result?.value
  }
}

async function connect() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const target = targets.find((item) => item.type === 'page')
      if (target?.webSocketDebuggerUrl) {
        const socket = new WebSocket(target.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true })
          socket.addEventListener('error', reject, { once: true })
        })
        return new BrowserSession(socket)
      }
    } catch {}
    await sleep(250)
  }
  throw new Error('Test browser did not start')
}

async function waitFor(session, text) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await session.evaluate(`document.body?.innerText.includes(${JSON.stringify(text)})`)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${text}: ${await session.evaluate('document.body?.innerText?.slice(0,1200)')}`)
}

async function click(session, label) {
  const found = await session.evaluate(`(() => {
    const expected=${JSON.stringify(label)};
    const items=[...document.querySelectorAll('[role="button"],[role="tab"],button')];
    const matching=items.filter((element)=>(element.getAttribute('aria-label')||element.innerText||'').trim().includes(expected) && element.getBoundingClientRect().height>0);
    const item=matching.find((element)=>(element.getAttribute('aria-label')||element.innerText||'').trim()===expected) || matching.sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length)[0];
    if (!item) return false;
    item.click(); return true;
  })()`)
  if (!found) throw new Error(`Could not click ${label}`)
}

async function fill(session, placeholder, value) {
  const found = await session.evaluate(`(() => {
    const input=[...document.querySelectorAll('input')].find((element)=>element.placeholder===${JSON.stringify(placeholder)});
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  })()`)
  if (!found) throw new Error(`Could not fill ${placeholder}`)
}

async function capture(session, name) {
  // Expo's development menu floats over the first tab in web previews.
  await session.evaluate(`(() => { for (const item of document.querySelectorAll('*')) { const rect=item.getBoundingClientRect(); const style=getComputedStyle(item); if(style.position==='fixed'&&rect.left<20&&rect.bottom>innerHeight-70&&rect.width<70&&rect.height<70)item.style.display='none'; } })()`)
  const result = await session.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.writeFile(path.join(outputDir, name), Buffer.from(result.data, 'base64'))
  console.log(`Captured ${name}`)
}

await fs.mkdir(outputDir, { recursive: true })
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })

let session
try {
  session = await connect()
  await session.call('Page.enable')
  await session.call('Runtime.enable')
  await session.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 1, mobile: true })
  await session.call('Page.navigate', { url: appUrl })
  await waitFor(session, 'Welcome back')
  await fill(session, 'Email or student ID', 'attendance-teacher@example.test')
  await fill(session, 'Password', 'Synthetic123!')
  await click(session, 'Continue')
  await waitFor(session, 'All tools')
  await capture(session, 'teacher-home-390.png')
  await click(session, 'All tools')
  await waitFor(session, 'Scan papers')
  await sleep(600)
  await capture(session, 'teacher-tools-390.png')
  await click(session, 'Results')
  await waitFor(session, 'Results that')
  await capture(session, 'teacher-results-390.png')
  await session.call('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, screenWidth: 320, screenHeight: 700, deviceScaleFactor: 1, mobile: true })
  await sleep(350)
  await capture(session, 'teacher-results-320.png')
  await session.evaluate(`(() => { const labels=new Set(['Home','Attend','Exams','Papers','All tools']); for(const node of document.querySelectorAll('[role="tab"] *')) { if(labels.has(node.textContent?.trim()) && ![...node.children].some((child)=>labels.has(child.textContent?.trim()))) { node.style.fontSize='14.3px'; node.style.lineHeight='19px'; } } })()`)
  await capture(session, 'teacher-results-320-large-text.png')
  await click(session, 'All tools')
  await sleep(600)
  await capture(session, 'teacher-results-tools-320.png')
  console.log('Staff footer navigation captured')
} finally {
  if (session) await session.call('Browser.close').catch(() => {})
  edge.kill()
  await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }).catch(() => {})
}
