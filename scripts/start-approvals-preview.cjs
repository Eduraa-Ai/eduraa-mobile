const { spawn } = require('node:child_process')

const expoCli = require.resolve('expo/bin/cli')
const appPort = process.env.APPROVALS_APP_PORT || '8091'
const mockPort = process.env.APPROVALS_MOCK_PORT || '8021'

const mock = spawn(process.execPath, ['test-artifacts/approvals/mock-server.mjs'], {
  cwd: process.cwd(), env: { ...process.env, APPROVALS_MOCK_PORT: mockPort }, stdio: 'inherit',
})
const expo = spawn(process.execPath, [expoCli, 'start', '--web', '--port', appPort], {
  cwd: process.cwd(),
  env: { ...process.env, EXPO_PUBLIC_WEB_API_URL: `http://127.0.0.1:${mockPort}` },
  stdio: 'inherit',
})

function stop() {
  mock.kill()
  expo.kill()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
expo.on('exit', (code) => { mock.kill(); process.exitCode = code ?? 0 })

