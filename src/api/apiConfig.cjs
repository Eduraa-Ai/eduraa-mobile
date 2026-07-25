const ipaddr = require('ipaddr.js')

const LOCAL_API_PORT = '8000'

const normalizeUrl = (value) => value?.trim().replace(/\/+$/, '') || undefined

const normalizeHostname = (hostname) => {
    return hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/\.+$/, '')
}

const parseApiOrigin = (value) => {
    let parsedUrl

    try {
        parsedUrl = new URL(value)
    } catch {
        throw new Error(`Invalid API URL: ${value}`)
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('The API URL must use http or https.')
    }
    if (parsedUrl.username || parsedUrl.password) {
        throw new Error('The API URL cannot contain credentials.')
    }
    if (parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
        throw new Error('The API URL must contain only an origin, without a path, query, or fragment.')
    }

    return parsedUrl
}

const isNonPublicHostname = (hostname) => {
    const normalizedHostname = normalizeHostname(hostname)
    if (
        normalizedHostname === 'localhost' ||
        normalizedHostname.endsWith('.localhost') ||
        normalizedHostname.endsWith('.local') ||
        normalizedHostname.endsWith('.internal') ||
        normalizedHostname.endsWith('.lan') ||
        normalizedHostname.endsWith('.home.arpa') ||
        (!normalizedHostname.includes('.') && !normalizedHostname.includes(':'))
    ) {
        return true
    }

    if (!ipaddr.isValid(normalizedHostname)) return false

    return ipaddr.process(normalizedHostname).range() !== 'unicast'
}

const resolveReleaseApiBaseUrl = ({ universalUrl, webUrl, nativeUrl }) => {
    if (normalizeUrl(webUrl) || normalizeUrl(nativeUrl)) {
        throw new Error(
            'Release builds use only EXPO_PUBLIC_API_URL; remove platform-specific API overrides.'
        )
    }

    const configuredUrl = normalizeUrl(universalUrl)
    if (!configuredUrl) {
        throw new Error('EXPO_PUBLIC_API_URL is required for release builds.')
    }

    const parsedUrl = parseApiOrigin(configuredUrl)
    if (parsedUrl.protocol !== 'https:') {
        throw new Error('Release builds require an HTTPS API URL.')
    }
    if (isNonPublicHostname(parsedUrl.hostname)) {
        throw new Error('Release builds require a public API hostname.')
    }

    return parsedUrl.origin
}

const resolveApiConfig = ({
    platform,
    isDevelopment,
    universalUrl,
    webUrl,
    nativeUrl,
    webHostname,
    webProtocol,
}) => {
    if (!isDevelopment) {
        return {
            baseUrl: resolveReleaseApiBaseUrl({ universalUrl, webUrl, nativeUrl }),
            target: 'remote',
        }
    }

    const configuredUrl = normalizeUrl(platform === 'web' ? webUrl : nativeUrl) ?? normalizeUrl(universalUrl)

    if (configuredUrl) {
        return { baseUrl: parseApiOrigin(configuredUrl).origin, target: 'remote' }
    }

    if (platform === 'web') {
        const hostname = webHostname || 'localhost'
        const protocol = webProtocol || 'http:'
        return { baseUrl: `${protocol}//${hostname}:${LOCAL_API_PORT}`, target: 'local' }
    }

    if (platform === 'android') {
        return { baseUrl: `http://10.0.2.2:${LOCAL_API_PORT}`, target: 'local' }
    }

    return { baseUrl: `http://localhost:${LOCAL_API_PORT}`, target: 'local' }
}

module.exports = { resolveApiConfig, resolveReleaseApiBaseUrl }