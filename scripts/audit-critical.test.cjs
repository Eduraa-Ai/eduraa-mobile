const assert = require('node:assert/strict')
const test = require('node:test')

const { classifyAuditOutput, describeCounts } = require('./audit-critical.cjs')

test('a clean report with no critical advisories is usable and passes', () => {
  const stdout = JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: { vulnerabilities: { info: 0, low: 1, moderate: 9, high: 8, critical: 0 } },
  })
  const result = classifyAuditOutput(stdout)
  assert.equal(result.kind, 'report')
  assert.equal(result.critical, 0)
})

test('a report containing a critical advisory is reported as critical', () => {
  const stdout = JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      'left-pad': {
        severity: 'critical',
        via: [{ title: 'Remote code execution', url: 'https://github.com/advisories/GHSA-xxxx' }],
      },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 1 } },
  })
  const result = classifyAuditOutput(stdout)
  assert.equal(result.kind, 'report')
  assert.equal(result.critical, 1)
  assert.deepEqual(result.criticalPackages, ['left-pad'])
})

test('the retired quick-endpoint 400 is a registry failure, not a vulnerability', () => {
  const stdout = JSON.stringify({
    message: 'audit endpoint returned an error',
    error: {
      summary: 'Invalid package tree, run  npm install  to rebuild your package-lock.json',
      detail: '',
    },
  })
  const result = classifyAuditOutput(stdout)
  assert.equal(result.kind, 'unavailable')
  assert.match(result.reason, /Invalid package tree/)
})

test('a mangled or truncated response body is a registry failure', () => {
  const result = classifyAuditOutput('npm warn audit invalid json response body')
  assert.equal(result.kind, 'unavailable')
})

test('empty output from a crashed audit is a registry failure', () => {
  const result = classifyAuditOutput('')
  assert.equal(result.kind, 'unavailable')
})

test('a report missing severity counts is treated as unusable rather than clean', () => {
  const result = classifyAuditOutput(JSON.stringify({ auditReportVersion: 2 }))
  assert.equal(result.kind, 'unavailable')
})

test('severity counts are summarised for the build log', () => {
  const summary = describeCounts({ info: 0, low: 1, moderate: 9, high: 8, critical: 0 })
  assert.match(summary, /8 high/)
  assert.match(summary, /9 moderate/)
})
