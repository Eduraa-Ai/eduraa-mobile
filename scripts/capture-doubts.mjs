import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const appUrl = 'http://127.0.0.1:8083'
const mockUrl = 'http://127.0.0.1:8002'
const outputDir = path.resolve('test-artifacts/doubts/screens')
const teacherRun = process.argv.includes('--teacher')
const studentState = process.argv.find((item) => item.startsWith('--student-state='))?.split('=')[1]
const debuggingPort = teacherRun ? 9443 : studentState === 'resolved' ? 9445 : studentState ? 9444 : 9442
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eduraa-doubts-edge-'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class Session {
  constructor(socket) {
    this.socket = socket
    this.id = 0
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      if (payload.method === 'Runtime.exceptionThrown') console.error('BROWSER EXCEPTION', payload.params?.exceptionDetails?.exception?.description || payload.params?.exceptionDetails?.text)
      if (payload.method === 'Runtime.consoleAPICalled' && payload.params?.type === 'error') console.error('BROWSER ERROR', payload.params.args?.map((arg) => arg.value || arg.description).join(' '))
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
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

async function waitForText(session, text, timeout = 25000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(session, `document.body?.innerText.includes(${JSON.stringify(text)})`)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${text}: ${await evaluate(session, 'document.body?.innerText?.slice(0,2200)')}`)
}

async function clickText(session, text) {
  const clicked = await evaluate(session, `(() => {
    const expected=${JSON.stringify(text)};
    const items=[...document.querySelectorAll('[role="button"],button,[tabindex="0"]')];
    const label=(item)=>(item.innerText||item.textContent||'').trim().replace(/\\s+/g,' ');
    const containing=items.filter((item)=>label(item).includes(expected)&&item.getBoundingClientRect().width>0&&item.getBoundingClientRect().height>0);
    const exact=containing.filter((item)=>label(item)===expected);
    const matches=exact.length===1?exact:containing.sort((a,b)=>label(a).length-label(b).length);
    if(matches.length===1||matches.length>0){matches[0].scrollIntoView({block:'center'});matches[0].click();return label(matches[0]);}
    return null;
  })()`)
  if (!clicked) throw new Error(`Button not found: ${text}`)
  await sleep(500)
}

async function clickLabel(session, label) {
  const clicked = await evaluate(session, `(() => { const item=document.querySelector('[aria-label=${JSON.stringify(label)}]'); if(!item)return false; const rect=item.getBoundingClientRect(); if(rect.top<0||rect.bottom>innerHeight)item.scrollIntoView({block:'center'}); item.click(); return true; })()`)
  if (!clicked) throw new Error(`Labeled control not found: ${label}`)
  await sleep(500)
}

async function fill(session, placeholder, value) {
  const found = await evaluate(session, `(() => {
    const input=[...document.querySelectorAll('input,textarea')].find((item)=>item.placeholder===${JSON.stringify(placeholder)});
    if(!input)return false;
    const proto=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)});
    input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.focus();return true;
  })()`)
  if (!found) throw new Error(`Input not found: ${placeholder}`)
  await sleep(250)
}

async function viewport(session, width, height) {
  await session.call('Emulation.setDeviceMetricsOverride', { width, height, screenWidth: width, screenHeight: height, deviceScaleFactor: 1, mobile: true })
  await sleep(350)
}

async function scrollToTop(session) {
  await evaluate(session, `(() => {
    document.scrollingElement?.scrollTo(0,0);
    [...document.querySelectorAll('body *')].forEach((item) => {
      if(item.scrollTop>0)item.scrollTop=0;
    });
  })()`)
  await sleep(300)
}

async function capture(session, name) {
  // Expo's development-only launcher can cover content in a debug web build.
  await evaluate(session, `(() => {
    [...document.querySelectorAll('body *')].forEach((item) => {
      const rect=item.getBoundingClientRect(); const style=getComputedStyle(item);
      if(rect.left<16 && rect.bottom>innerHeight-65 && rect.width<60 && rect.height<60 &&
         (style.position==='fixed'||style.position==='absolute') &&
         (item.textContent||'').trim().length<=2){item.style.display='none';}
    });
  })()`)
  const screenshot = await session.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(outputDir, name), Buffer.from(screenshot.data, 'base64'))
  console.log(`Captured ${name}`)
}

async function mode(value) {
  await fetch(`${mockUrl}/__mock/mode?value=${value}`)
}

await fs.mkdir(outputDir, { recursive: true })
await mode('populated')
if (studentState) await fetch(`${mockUrl}/__mock/primary?status=${studentState}`)
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
  await waitForText(session, 'Welcome back')
  await fill(session, 'Email or student ID', teacherRun ? 'teacher.doubts@eduraa.test' : 'student.doubts@eduraa.test')
  await fill(session, 'Password', 'Synthetic123!')
  await clickText(session, 'Continue')

  if (teacherRun) {
    await waitForText(session, 'Academic doubts')
    await clickText(session, 'Academic doubts')
    await waitForText(session, 'Student doubts')
    await waitForText(session, 'Why does acceleration stay constant?')
    await capture(session, 'teacher-list-390x844.png')
    await viewport(session, 320, 700)
    await capture(session, 'teacher-list-320x700.png')
    await viewport(session, 390, 844)

    await clickText(session, 'Why does acceleration stay constant?')
    await waitForText(session, 'Answer the student')
    await scrollToTop(session)
    await capture(session, 'teacher-pending-thread-390x844.png')
    await fill(session, 'Explain the next step clearly and academically.', 'Acceleration remains constant because the graph’s slope is unchanged: equal time intervals add equal amounts of velocity. Compare any two intervals to verify the same Δv ÷ Δt.')
    await capture(session, 'teacher-answer-controls-390x844.png')
    await scrollToTop(session)
    await capture(session, 'teacher-answer-filled-390x844.png')
    await clickText(session, 'Send answer')
    await waitForText(session, 'Answered')
    await scrollToTop(session)
    await capture(session, 'teacher-answered-thread-390x844.png')
    await evaluate(session, `([...document.querySelectorAll('body *')].find((item)=>(item.textContent||'').includes('Compare any two intervals to verify')))?.scrollIntoView({block:'center'})`)
    await sleep(300)
    await capture(session, 'teacher-answered-thread-scrolled-390x844.png')
    await clickText(session, 'Resolve')
    await waitForText(session, 'This doubt is resolved.')
    await scrollToTop(session)
    await capture(session, 'teacher-resolved-thread-top-390x844.png')
    await evaluate(session, `([...document.querySelectorAll('body *')].find((item)=>(item.textContent||'').includes('This doubt is resolved.')))?.scrollIntoView({block:'center'})`)
    await sleep(300)
    await capture(session, 'teacher-resolved-thread-390x844.png')
    console.log('Teacher doubt lifecycle completed.')
  } else if (studentState) {
    await waitForText(session, 'Ask your teacher')
    await clickText(session, 'Ask your teacher')
    await waitForText(session, 'Why does acceleration stay constant?')
    await session.call('Page.navigate', { url: `${appUrl}/student/doubts/50000000-0000-4000-8000-000000000001` })
    await waitForText(session, studentState === 'resolved' ? 'This doubt is resolved.' : '2 messages')
    await sleep(1200)
    await scrollToTop(session)
    await scrollToTop(session)
    await capture(session, `student-after-${studentState}-390x844.png`)
    console.log(`Student ${studentState} state captured.`)
  } else {
  await waitForText(session, 'Ask your teacher')
  await clickText(session, 'Ask your teacher')
  await waitForText(session, 'PRIVATE ACADEMIC DESK')
  await waitForText(session, 'Why does acceleration stay constant?')
  await capture(session, 'student-list-390x844.png')

  await viewport(session, 320, 700)
  await capture(session, 'student-list-320x700.png')
  await viewport(session, 390, 844)

  await clickLabel(session, 'Create a new doubt')
  await waitForText(session, 'Give your teacher the context they need.')
  await capture(session, 'student-compose-empty-390x844.png')
  await clickLabel(session, 'Physics, Ms Meera Shah')
  await fill(session, 'e.g. Why does acceleration change here?', 'Date me after school')
  await fill(session, 'Share the step, formula, chapter, or assignment where you got stuck.', 'This is not an academic request and does not belong in a private school doubt workflow.')
  await clickText(session, 'Send to teacher')
  await waitForText(session, 'Keep this desk safe, respectful, and focused on schoolwork.')
  await capture(session, 'student-moderation-redirect-390x844.png')
  await fill(session, 'e.g. Why does acceleration change here?', 'Understanding constant acceleration')
  await fill(session, 'Share the step, formula, chapter, or assignment where you got stuck.', 'I can calculate the slope, but I do not understand why it remains constant across every interval in this graph.')
  await viewport(session, 390, 520)
  await evaluate(session, `document.querySelector('textarea')?.scrollIntoView({block:'center'})`)
  await sleep(350)
  await capture(session, 'student-compose-keyboard-390x520.png')
  await viewport(session, 390, 844)
  await scrollToTop(session)
  await capture(session, 'student-compose-filled-390x844.png')
  await clickText(session, 'Send to teacher')
  await capture(session, 'student-submitting-once-390x844.png')
  await waitForText(session, 'Activity')
  await capture(session, 'student-created-thread-390x844.png')

  await session.call('Page.navigate', { url: `${appUrl}/student/doubts/00000000-0000-4000-8000-000000000404` })
  await waitForText(session, 'This thread is no longer available')
  await capture(session, 'student-deleted-or-reassigned-390x844.png')
  await clickText(session, 'Back to doubts')
  await waitForText(session, 'Your threads')

  await session.call('Page.navigate', { url: `${appUrl}/student/doubts` })
  await waitForText(session, 'Your threads')
  await mode('slow')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'PRIVATE ACADEMIC DESK')
  await scrollToTop(session)
  await capture(session, 'student-loading-390x844.png')
  await waitForText(session, 'Your threads')

  await mode('empty')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'No doubts yet')
  await scrollToTop(session)
  await capture(session, 'student-empty-390x844.png')

  await mode('error')
  await session.call('Page.reload', { ignoreCache: true })
  await waitForText(session, 'Doubts could not load', 30000)
  await scrollToTop(session)
  await capture(session, 'student-error-390x844.png')
  await mode('populated')
  console.log('Doubt rendered journey completed.')
  }
} finally {
  await mode('populated').catch(() => {})
  if (session) await session.call('Browser.close').catch(() => {})
  edge.kill()
  await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }).catch(() => {})
}
