const { spawn } = require('node:child_process')

const expoCli = require.resolve('expo/bin/cli')
const expo = spawn(process.execPath, [expoCli, 'start', '--web', '--port', '8087'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    EXPO_PUBLIC_WEB_API_URL: 'http://127.0.0.1:8017',
  },
  stdio: 'inherit',
})

expo.on('exit', (code) => {
  process.exitCode = code ?? 0
})
