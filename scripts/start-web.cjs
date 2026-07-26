const { spawn } = require('child_process')
const { startBridge } = require('./dev-api-bridge.cjs')

async function main() {
  const bridge = await startBridge()
  const bridgeUrl = 'http://localhost:8001'
  const expoCli = require.resolve('expo/bin/cli')
  const expoArgs = process.argv.slice(2)
  const usesAnonymousExpoGo = expoArgs.includes('--go')
  const expo = spawn(process.execPath, [expoCli, 'start', ...expoArgs], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      EXPO_PUBLIC_WEB_API_URL: bridgeUrl,
      ...(usesAnonymousExpoGo
        ? { EDURAA_EXPO_GO_ANONYMOUS: '1' }
        : {}),
    },
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
  console.error(`Could not start Eduraa development: ${error.message}`)
  process.exitCode = 1
})
