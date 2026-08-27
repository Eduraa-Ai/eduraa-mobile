const test = require('node:test')
const assert = require('node:assert/strict')

const modelPath = process.env.SCAN_UPLOAD_POLLING_PATH
if (!modelPath) throw new Error('Set SCAN_UPLOAD_POLLING_PATH to the compiled scan upload polling model.')
const {
  AcceptedScanUploadError,
  parseScanUploadReceipt,
  pollScanUpload,
} = require(modelPath)

const pending = (overrides = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  status: 'pending',
  checked_paper_id: null,
  ...overrides,
})

test('completed receipts resolve without another request', async () => {
  let loads = 0
  const result = await pollScanUpload(
    pending({ status: 'completed', checked_paper_id: 'paper-1' }),
    { load: async () => { loads += 1 }, intervalMs: 0 },
  )

  assert.equal(result, 'paper-1')
  assert.equal(loads, 0)
})

test('receipt parser rejects malformed ids, statuses, and result ids', () => {
  assert.equal(parseScanUploadReceipt(null), null)
  assert.equal(parseScanUploadReceipt({ id: 'junk', status: 'pending' }), null)
  assert.equal(parseScanUploadReceipt({ ...pending(), status: 'unknown' }), null)
  assert.equal(parseScanUploadReceipt({ ...pending(), checked_paper_id: 'junk' }), null)
  assert.deepEqual(parseScanUploadReceipt({
    ...pending(),
    created_at: '2026-08-27T00:00:00Z',
  }), {
    ...pending(),
    error_code: null,
    error_message: null,
    created_at: '2026-08-27T00:00:00Z',
    updated_at: null,
  })
})

test('pending uploads poll through processing to the checked paper', async () => {
  const states = [
    pending({ status: 'processing' }),
    pending({ status: 'completed', checked_paper_id: 'paper-1' }),
  ]

  const result = await pollScanUpload(pending(), {
    load: async () => states.shift(),
    intervalMs: 0,
    timeoutMs: 500,
  })

  assert.equal(result, 'paper-1')
  assert.equal(states.length, 0)
})

test('a transient status request failure never turns into a duplicate upload', async () => {
  let loads = 0
  const result = await pollScanUpload(pending(), {
    load: async () => {
      loads += 1
      if (loads === 1) throw new Error('offline')
      return pending({ status: 'completed', checked_paper_id: 'paper-1' })
    },
    intervalMs: 0,
    timeoutMs: 500,
  })

  assert.equal(result, 'paper-1')
  assert.equal(loads, 2)
})

test('a missing persisted tracker ends recovery and allows a fresh upload', async () => {
  await assert.rejects(
    () => pollScanUpload(pending(), {
      load: async () => {
        throw Object.assign(new Error('missing'), { response: { status: 404 } })
      },
      intervalMs: 0,
      timeoutMs: 500,
    }),
    (error) => {
      assert.ok(error instanceof AcceptedScanUploadError)
      assert.equal(error.terminal, true)
      assert.match(error.message, /no longer available/)
      return true
    },
  )
})

test('server rejection is accepted but terminal, so retry is allowed', async () => {
  await assert.rejects(
    () => pollScanUpload(
      pending({ status: 'failed', error_message: 'The image is unreadable.' }),
      { load: async () => pending(), intervalMs: 0 },
    ),
    (error) => {
      assert.ok(error instanceof AcceptedScanUploadError)
      assert.equal(error.accepted, true)
      assert.equal(error.terminal, true)
      assert.equal(error.message, 'The image is unreadable.')
      return true
    },
  )
})

test('stopping polling preserves the accepted upload for later resume', async () => {
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(
    () => pollScanUpload(pending(), {
      load: async () => pending(),
      signal: controller.signal,
      intervalMs: 0,
    }),
    (error) => {
      assert.ok(error instanceof AcceptedScanUploadError)
      assert.equal(error.accepted, true)
      assert.equal(error.terminal, false)
      assert.match(error.message, /checking continues/)
      return true
    },
  )
})

test('poll timeout preserves the accepted upload for later resume', async () => {
  await assert.rejects(
    () => pollScanUpload(pending(), {
      load: async () => pending(),
      intervalMs: 0,
      timeoutMs: 0,
    }),
    (error) => {
      assert.ok(error instanceof AcceptedScanUploadError)
      assert.equal(error.accepted, true)
      assert.equal(error.terminal, false)
      assert.match(error.message, /saved/)
      return true
    },
  )
})