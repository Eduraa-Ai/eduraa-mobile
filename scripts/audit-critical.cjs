/**
 * Fails the build only when npm reports a critical advisory.
 *
 * `npm audit` exits non-zero both for "a critical vulnerability exists" and for
 * "the registry audit endpoint errored", so using it directly as a gate turns
 * registry outages into red builds. Arborist queries
 * `/-/npm/v1/security/advisories/bulk` first and silently falls back to the
 * long-retired `/-/npm/v1/security/audits/quick`, whose canned
 * "Invalid package tree" 400 has nothing to do with the lockfile.
 *
 * This wrapper parses the report, gates on the critical count alone, and retries
 * before treating an unusable response as infrastructure rather than a finding.
 * Usage: npm run audit:critical [--strict]
 */
const { spawnSync } = require('node:child_process')

const RETRY_DELAYS_MS = [2000, 6000]
const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'info']

const describeCounts = (counts = {}) =>
  SEVERITIES.map((severity) => `${counts[severity] || 0} ${severity}`).join(', ')

/**
 * Sorts npm's audit output into a usable report or an unusable response.
 * Returns { kind: 'report', critical, criticalPackages, counts }
 * or { kind: 'unavailable', reason }.
 */
const classifyAuditOutput = (stdout) => {
  const trimmed = (stdout || '').trim()
  if (!trimmed) return { kind: 'unavailable', reason: 'npm audit produced no output' }

  let report
  try {
    report = JSON.parse(trimmed)
  } catch {
    return { kind: 'unavailable', reason: 'npm audit did not return JSON' }
  }

  if (report && report.error) {
    const summary = report.error.summary || report.message || 'audit endpoint returned an error'
    return { kind: 'unavailable', reason: summary.trim() }
  }

  const counts = report && report.metadata && report.metadata.vulnerabilities
  if (!counts || typeof counts.critical !== 'number') {
    return { kind: 'unavailable', reason: 'npm audit returned no severity counts' }
  }

  const vulnerabilities = (report && report.vulnerabilities) || {}
  const criticalPackages = Object.keys(vulnerabilities)
    .filter((name) => vulnerabilities[name] && vulnerabilities[name].severity === 'critical')
    .sort()

  return { kind: 'report', critical: counts.critical, criticalPackages, counts }
}

const runAudit = () =>
  spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' })

const sleep = (ms) => {
  const shared = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(shared, 0, 0, ms)
}

const main = () => {
  const strict = process.argv.includes('--strict')
  let unavailable = 'npm audit did not run'

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1]
      console.log(`Audit endpoint unusable (${unavailable}); retrying in ${delay / 1000}s.`)
      sleep(delay)
    }

    const result = classifyAuditOutput(runAudit().stdout)
    if (result.kind === 'report') {
      if (result.critical > 0) {
        const named = result.criticalPackages.length
          ? `: ${result.criticalPackages.join(', ')}`
          : ''
        console.error(`Found ${result.critical} critical advisory/advisories${named}.`)
        console.error('Run `npm audit` for the full report.')
        process.exit(1)
      }
      console.log(`No critical advisories (${describeCounts(result.counts)}).`)
      return
    }
    unavailable = result.reason
  }

  const message = `Could not reach a usable npm audit endpoint: ${unavailable}`
  if (strict) {
    console.error(message)
    process.exit(1)
  }
  console.warn(`${message}. Skipping the critical-advisory gate for this run.`)
}

if (require.main === module) main()

module.exports = { classifyAuditOutput, describeCounts }
