const http = require('http')
const https = require('https')

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const loadLocalEnvironment = () => {
  if (process.env.EDURAA_API_UPSTREAM_URL || process.env.EXPO_PUBLIC_API_URL) return

  try {
    process.loadEnvFile()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

const resolveUpstreamUrl = (value) => {
  let configuredValue = typeof value === 'string' ? value.trim() : ''

  if (!configuredValue) {
    loadLocalEnvironment()
    configuredValue = (
      process.env.EDURAA_API_UPSTREAM_URL || process.env.EXPO_PUBLIC_API_URL || ''
    ).trim()
  }

  if (!configuredValue) {
    throw new Error(
      'Set EDURAA_API_UPSTREAM_URL (or EXPO_PUBLIC_API_URL) to the remote API URL.'
    )
  }

  const upstream = new URL(configuredValue)
  if (upstream.protocol !== 'http:' && upstream.protocol !== 'https:') {
    throw new Error('The bridge upstream must use http or https.')
  }
  if (upstream.username || upstream.password) {
    throw new Error('The bridge upstream URL cannot contain credentials.')
  }
  if (upstream.pathname !== '/' || upstream.search || upstream.hash) {
    throw new Error('The bridge upstream must contain only an origin.')
  }
  if (upstream.protocol === 'http:' && !isLoopbackHostname(upstream.hostname)) {
    throw new Error('The bridge requires HTTPS for non-loopback upstreams.')
  }

  return new URL(upstream.origin)
}

const normalizeHostname = (hostname) => {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/\.+$/, '')
}

const isLoopbackHostname = (hostname) => {
  const normalizedHostname = normalizeHostname(hostname)
  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname.endsWith('.localhost') ||
    normalizedHostname === '::1' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalizedHostname)
  )
}

const isAllowedOrigin = (origin) => {
  if (!origin) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && isLoopbackHostname(parsed.hostname)
  } catch {
    return false
  }
}

const applyCors = (request, response) => {
  const origin = request.headers.origin
  if (origin && isAllowedOrigin(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
  }
}

const mergeVaryHeader = (...values) => {
  const tokens = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
    .map((value) => value.trim())
    .filter(Boolean)

  if (tokens.includes('*')) return '*'

  const uniqueTokens = new Map()
  for (const token of tokens) {
    uniqueTokens.set(token.toLowerCase(), token)
  }
  return [...uniqueTokens.values()].join(', ')
}

const normalizeSetCookie = (value) => {
  if (!value) return value
  const cookies = Array.isArray(value) ? value : [value]
  return cookies.map((cookie) => cookie.replace(/;\s*Domain=[^;]*/gi, ''))
}

const removeHopByHopHeaders = (headers) => {
  const connectionValue = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === 'connection'
  )?.[1]
  const connectionTokens = (Array.isArray(connectionValue) ? connectionValue : [connectionValue])
    .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  const blockedHeaders = new Set([...HOP_BY_HOP_HEADERS, ...connectionTokens])

  for (const headerName of Object.keys(headers)) {
    if (blockedHeaders.has(headerName.toLowerCase())) delete headers[headerName]
  }
}

const rewriteSameOriginLocation = (value, upstream, request) => {
  if (typeof value !== 'string' || !request.headers.host) return value

  try {
    const requestUrl = new URL(request.url || '/', upstream)
    const location = new URL(value, requestUrl)
    if (location.origin !== upstream.origin) return value
    return `http://${request.headers.host}${location.pathname}${location.search}${location.hash}`
  } catch {
    return value
  }
}

const createBridgeServer = ({ upstreamUrl } = {}) => {
  const upstream = resolveUpstreamUrl(upstreamUrl)
  const requestTransport = upstream.protocol === 'https:' ? https : http

  return http.createServer((request, response) => {
    applyCors(request, response)

    if (request.method === 'OPTIONS') {
      response.setHeader(
        'Access-Control-Allow-Methods',
        'DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT'
      )
      response.setHeader(
        'Access-Control-Allow-Headers',
        request.headers['access-control-request-headers'] || 'authorization, content-type'
      )
      response.setHeader('Vary', 'Origin')
      response.writeHead(204)
      response.end()
      return
    }

    const headers = { ...request.headers, host: upstream.host }
    removeHopByHopHeaders(headers)
    delete headers.origin
    delete headers.referer

    const upstreamRequest = requestTransport.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port || undefined,
        path: request.url,
        method: request.method,
        headers,
      },
      (upstreamResponse) => {
        const responseHeaders = { ...upstreamResponse.headers }
        removeHopByHopHeaders(responseHeaders)
        const upstreamVary = responseHeaders.vary

        for (const name of Object.keys(responseHeaders)) {
          const normalizedName = name.toLowerCase()
          if (
            normalizedName.startsWith('access-control-') ||
            normalizedName === 'vary'
          ) {
            delete responseHeaders[name]
          }
        }

        const setCookie = normalizeSetCookie(responseHeaders['set-cookie'])
        if (setCookie) responseHeaders['set-cookie'] = setCookie

        const location = rewriteSameOriginLocation(responseHeaders.location, upstream, request)
        if (location) responseHeaders.location = location

        applyCors(request, response)
        response.setHeader('Vary', mergeVaryHeader(upstreamVary, 'Origin'))
        response.writeHead(upstreamResponse.statusCode || 502, responseHeaders)
        upstreamResponse.pipe(response)
      }
    )

    upstreamRequest.on('error', (error) => {
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'application/json' })
      }
      response.end(JSON.stringify({ detail: `Remote API bridge failed: ${error.message}` }))
    })

    request.pipe(upstreamRequest)
  })
}

const startBridge = ({ port = 8001, upstreamUrl } = {}) => new Promise((resolve, reject) => {
  const server = createBridgeServer({ upstreamUrl })
  server.once('error', reject)
  server.listen(port, '127.0.0.1', () => {
    server.off('error', reject)
    console.log(`Eduraa remote API bridge listening on http://localhost:${port}`)
    resolve(server)
  })
})

module.exports = { createBridgeServer, resolveUpstreamUrl, startBridge }

if (require.main === module) {
  startBridge().catch((error) => {
    console.error(`Could not start the Eduraa API bridge: ${error.message}`)
    process.exitCode = 1
  })
}
