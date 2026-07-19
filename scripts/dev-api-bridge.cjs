const http = require('http')
const https = require('https')

const upstream = new URL(
  'https://eduraa-ai-dev-cin-api.gentleforest-0ad6efdc.centralindia.azurecontainerapps.io'
)
const allowedOrigins = new Set([
  'http://localhost:8081',
  'http://127.0.0.1:8081',
])

const applyCors = (request, response) => {
  const origin = request.headers.origin
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader('Vary', 'Origin')
  }
}

const server = http.createServer((request, response) => {
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

server.listen(8001, () => {
  console.log('Eduraa production API bridge listening on http://localhost:8001')
})
