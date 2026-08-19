const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const typesSource = read('src/types/index.ts')
const storageSource = read('src/auth/authStorage.ts')
const clientSource = read('src/api/client.ts')
const authApiSource = read('src/api/auth.ts')
const storeSource = read('src/stores/authStore.ts')

test('native auth retains the backend refresh-token fallback in secure storage', () => {
  assert.match(typesSource, /refresh_token\?: string \| null/)
  assert.match(storageSource, /REFRESH_TOKEN_KEY = 'eduraa_refresh_token'/)
  assert.match(storageSource, /Platform\.OS === 'web'[\s\S]*SecureStore/)
  assert.match(storageSource, /storage\.removeItem\(REFRESH_TOKEN_KEY\)/)
})

test('refresh rotation sends and replaces the backend fallback token', () => {
  assert.match(clientSource, /readStoredRefreshToken\(\)/)
  assert.match(clientSource, /'\/auth\/refresh', refreshToken \? \{ refresh_token: refreshToken \}/)
  assert.match(clientSource, /writeStoredRefreshToken\(refreshToken\)/)
  assert.match(clientSource, /revision !== accessTokenRevision/)
})

test('logout revokes the server session before a later account is persisted', () => {
  assert.match(authApiSource, /'\/auth\/logout'/)
  assert.match(storeSource, /authApi\.logout\(refreshToken\)/)
  assert.match(storeSource, /if \(pendingServerLogout\) await pendingServerLogout/)
  assert.match(storeSource, /clearRegisteredPrivateQueryCache\(\)/)
})
