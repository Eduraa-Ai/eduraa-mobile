const assert = require('node:assert/strict')
const { once } = require('node:events')
const http = require('node:http')
const test = require('node:test')

const { createBridgeServer, resolveUpstreamUrl } = require('./dev-api-bridge.cjs')

const listen = async (server) => {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address.')
    return `http://127.0.0.1:${address.port}`
}

const close = (server) => new Promise((resolve, reject) => {
    if (!server.listening) {
        resolve()
        return
    }
    server.close((error) => (error ? reject(error) : resolve()))
})

const request = (url, options) => new Promise((resolve, reject) => {
    const clientRequest = http.request(url, options, (response) => {
        response.resume()
        response.once('end', () => resolve(response))
    })
    clientRequest.once('error', reject)
    clientRequest.end()
})

test('validates explicit bridge upstream URLs', () => {
    assert.equal(resolveUpstreamUrl('  https://api.example.com/  ').href, 'https://api.example.com/')
    assert.equal(resolveUpstreamUrl('http://localhost:8000').href, 'http://localhost:8000/')
    assert.throws(() => resolveUpstreamUrl('file:///tmp/api'), /must use http or https/)
    assert.throws(() => resolveUpstreamUrl('http://api.example.com'), /requires HTTPS/)
    assert.throws(() => resolveUpstreamUrl('https://api.example.com/base'), /only an origin/)
    assert.throws(
        () => resolveUpstreamUrl('https://user:password@api.example.com'),
        /cannot contain credentials/
    )
})

test('does not load .env when an explicit upstream is provided', () => {
    const originalLoadEnvFile = process.loadEnvFile
    process.loadEnvFile = () => {
        throw new Error('Unexpected .env read')
    }

    try {
        assert.equal(resolveUpstreamUrl('https://api.example.com').origin, 'https://api.example.com')
    } finally {
        process.loadEnvFile = originalLoadEnvFile
    }
})

test('proxies requests while replacing upstream CORS headers', async (context) => {
    let receivedHeaders
    let receivedBody = ''
    let upstreamUrl
    const upstream = http.createServer((request, response) => {
        if (request.url === '/redirect') {
            response.writeHead(307, { Location: `${upstreamUrl}/api/v1/next` })
            response.end()
            return
        }
        if (request.url === '/nested/redirect') {
            response.writeHead(307, { Location: 'next' })
            response.end()
            return
        }
        if (request.url === '/connection-headers') {
            receivedHeaders = request.headers
            response.writeHead(200, {
                Connection: 'x-response-hop',
                'X-Response-Hop': 'remove-me',
                'X-End-To-End': 'keep-me',
            })
            response.end()
            return
        }

        receivedHeaders = request.headers
        request.on('data', (chunk) => {
            receivedBody += chunk
        })
        request.on('end', () => {
            response.writeHead(201, {
                'Access-Control-Allow-Origin': 'https://wrong.example',
                'Content-Type': 'application/json',
                'Set-Cookie': 'eduraa_refresh_token=test; Domain=api.example.com; Path=/; Secure; SameSite=None',
                Vary: 'Accept-Encoding',
            })
            response.end(JSON.stringify({ path: request.url }))
        })
    })
    upstreamUrl = await listen(upstream)
    context.after(() => close(upstream))
    const bridge = createBridgeServer({ upstreamUrl })
    context.after(() => close(bridge))
    const bridgeUrl = await listen(bridge)

    const response = await fetch(`${bridgeUrl}/api/v1/example?include=one`, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
            Origin: 'http://localhost:19006',
        },
        body: JSON.stringify({ value: 1 }),
    })

    assert.equal(response.status, 201)
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:19006')
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
    assert.equal(response.headers.get('vary'), 'Accept-Encoding, Origin')
    assert.match(response.headers.get('set-cookie') || '', /eduraa_refresh_token=test/)
    assert.doesNotMatch(response.headers.get('set-cookie') || '', /Domain=/i)
    assert.equal(receivedHeaders.authorization, 'Bearer test-token')
    assert.equal(receivedHeaders.origin, undefined)
    assert.equal(receivedBody, JSON.stringify({ value: 1 }))
    assert.deepEqual(await response.json(), { path: '/api/v1/example?include=one' })

    const redirectResponse = await fetch(`${bridgeUrl}/redirect`, { redirect: 'manual' })
    assert.equal(redirectResponse.status, 307)
    assert.equal(redirectResponse.headers.get('location'), `${bridgeUrl}/api/v1/next`)

    const relativeRedirectResponse = await fetch(`${bridgeUrl}/nested/redirect`, {
        redirect: 'manual',
    })
    assert.equal(relativeRedirectResponse.status, 307)
    assert.equal(relativeRedirectResponse.headers.get('location'), `${bridgeUrl}/nested/next`)

    const connectionResponse = await request(`${bridgeUrl}/connection-headers`, {
        headers: {
            Connection: 'x-request-hop',
            'X-Request-Hop': 'remove-me',
        },
    })
    assert.equal(connectionResponse.statusCode, 200)
    assert.equal(receivedHeaders['x-request-hop'], undefined)
    assert.equal(connectionResponse.headers['x-response-hop'], undefined)
    assert.equal(connectionResponse.headers['x-end-to-end'], 'keep-me')

    const preflightResponse = await fetch(`${bridgeUrl}/api/v1/example`, {
        method: 'OPTIONS',
        headers: {
            Origin: 'http://localhost:19006',
            'Access-Control-Request-Headers': 'authorization, content-type',
        },
    })
    assert.equal(preflightResponse.status, 204)
    assert.equal(preflightResponse.headers.get('access-control-allow-origin'), 'http://localhost:19006')
    assert.equal(preflightResponse.headers.get('vary'), 'Origin')
})

test('proxies responses without optional cookie or redirect headers', async (context) => {
    const upstream = http.createServer((_request, response) => {
        response.writeHead(204)
        response.end()
    })
    const upstreamUrl = await listen(upstream)
    context.after(() => close(upstream))
    const bridge = createBridgeServer({ upstreamUrl })
    context.after(() => close(bridge))
    const bridgeUrl = await listen(bridge)

    const response = await fetch(`${bridgeUrl}/health`, {
        headers: { Origin: 'http://localhost:19006' },
    })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(response.headers.get('location'), null)
})