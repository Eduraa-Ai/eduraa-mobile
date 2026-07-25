const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const projectRoot = require('node:path').resolve(__dirname, '..')
const validator = require('node:path').join(__dirname, 'validate-release-env.cjs')
const expoCli = require.resolve('expo/bin/cli')

const cleanEnvironment = (overrides = {}) => {
    const environment = { ...process.env, EXPO_NO_DOTENV: '1', ...overrides }
    for (const name of [
        'EAS_BUILD_PROFILE',
        'EXPO_PUBLIC_API_URL',
        'EXPO_PUBLIC_WEB_API_URL',
        'EXPO_PUBLIC_NATIVE_API_URL',
        'NODE_ENV',
    ]) {
        if (!(name in overrides)) delete environment[name]
    }
    return environment
}

const runNode = (args, environment) => spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: cleanEnvironment(environment),
})

test('the EAS development post-install hook allows local API discovery', () => {
    const result = runNode([validator], { EAS_BUILD_PROFILE: 'development' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /may use local API discovery/)
})

test('direct exports require a release API even with a development profile in the shell', () => {
    const result = runNode([validator, '--release'], { EAS_BUILD_PROFILE: 'development' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /EXPO_PUBLIC_API_URL is required/)
})

test('profileless production Expo config rejects a missing API URL', () => {
    const result = runNode([expoCli, 'config', '--type', 'public', '--json'], {
        NODE_ENV: 'production',
    })
    assert.notEqual(result.status, 0)
})

test('profileless production Expo config accepts a public HTTPS API origin', () => {
    const result = runNode([expoCli, 'config', '--type', 'public', '--json'], {
        NODE_ENV: 'production',
        EXPO_PUBLIC_API_URL: 'https://api.example.com',
    })
    assert.equal(result.status, 0, result.stderr)
    const config = JSON.parse(result.stdout)
    assert.equal(config.name, 'Eduraa')
    assert.equal(config.slug, 'eduraa-mobile')
})