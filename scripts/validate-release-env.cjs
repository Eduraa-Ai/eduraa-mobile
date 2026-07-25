const { resolveReleaseApiBaseUrl } = require('../src/api/apiConfig.cjs')

const buildProfile = process.env.EAS_BUILD_PROFILE
const requiresReleaseApi = process.argv.includes('--release') || buildProfile !== 'development'

if (!requiresReleaseApi) {
  console.log('Development build profile may use local API discovery.')
} else {
  const baseUrl = resolveReleaseApiBaseUrl({
    universalUrl: process.env.EXPO_PUBLIC_API_URL,
    webUrl: process.env.EXPO_PUBLIC_WEB_API_URL,
    nativeUrl: process.env.EXPO_PUBLIC_NATIVE_API_URL,
  })
  console.log(`Validated ${buildProfile || 'release'} API origin: ${baseUrl}`)
}