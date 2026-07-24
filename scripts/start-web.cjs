const { spawn } = require('child_process')
const { startBridge } = require('./dev-api-bridge.cjs')

async function main() {
  const bridge = await startBridge()
  const expoCli = require.resolve('expo/bin/cli')
  const expo = spawn(process.execPath, [expoCli, 'start', ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })

  let closing = false
  const close = (exitCode = 0, signal) => {
    if (closing) return
    closing = true
    if (signal && expo.exitCode == null) expo.kill(signal)
    bridge.close(() => {
      process.exitCode = exitCode
    })
  }

  expo.on('error', (error) => {
    console.error(`Could not start Expo web: ${error.message}`)
    close(1)
  })
  expo.on('exit', (code, signal) => close(code ?? (signal ? 1 : 0)))
  process.on('SIGINT', () => close(130, 'SIGINT'))
  process.on('SIGTERM', () => close(143, 'SIGTERM'))
}

main().catch((error) => {
  console.error(`Could not start Eduraa web development: ${error.message}`)
  process.exitCode = 1
})
