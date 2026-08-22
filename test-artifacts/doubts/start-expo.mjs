import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', '--web', '--port', '8083', '--clear'], {
  cwd: new URL('../..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
  env: { ...process.env, EXPO_PUBLIC_WEB_API_URL: 'http://127.0.0.1:8002' },
  stdio: 'ignore',
})

child.on('exit', (code) => process.exit(code ?? 0))

