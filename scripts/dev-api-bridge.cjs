const http = require('http')
const https = require('https')

const upstream = new URL(
  'https://eduraa-ai-dev-cin-api.gentleforest-0ad6efdc.centralindia.azurecontainerapps.io'
)
const isAllowedOrigin = (origin) => {
  if (!origin) return false
  try {
    const parsed = new URL(origin)
    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    )
  } catch {
    return false
  }
}

const applyCors = (request, response) => {
  const origin = request.headers.origin
  if (origin && isAllowedOrigin(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader('Vary', 'Origin')
  }
}

const createBridgeServer = () => http.createServer((request, response) => {
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
    response.writeHead(204)
    response.end()
    return
  }

  const headers = { ...request.headers, host: upstream.host }
  delete headers.origin
  delete headers.referer
  delete headers.connection

  const upstreamRequest = https.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: 443,
      path: request.url,
      method: request.method,
      headers,
    },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers }
      for (const name of Object.keys(responseHeaders)) {
        if (name.toLowerCase().startsWith('access-control-')) {
          delete responseHeaders[name]
        }
      }
      applyCors(request, response)
      response.writeHead(upstreamResponse.statusCode || 502, responseHeaders)
      upstreamResponse.pipe(response)
    }
  )

  upstreamRequest.on('error', (error) => {
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'application/json' })
    }
    response.end(JSON.stringify({ detail: `Production API bridge failed: ${error.message}` }))
  })

  request.pipe(upstreamRequest)
})

const startBridge = ({ port = 8001 } = {}) => new Promise((resolve, reject) => {
  const server = createBridgeServer()
  server.once('error', reject)
  server.listen(port, '127.0.0.1', () => {
    server.off('error', reject)
    console.log(`Eduraa production API bridge listening on http://localhost:${port}`)
    resolve(server)
  })
})

module.exports = { createBridgeServer, startBridge }

if (require.main === module) {
  startBridge().catch((error) => {
    console.error(`Could not start the Eduraa API bridge: ${error.message}`)
    process.exitCode = 1
  })
}
