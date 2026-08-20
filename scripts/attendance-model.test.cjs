const assert = require('node:assert/strict')
const test = require('node:test')
const model = require(process.env.ATTENDANCE_MODEL_PATH || '../src/screens/workspace/attendanceModel')

const records = [
  { id: 'r1', status: 'present', note: null },
  { id: 'r2', status: 'absent', note: 'Sick' },
]

test('attendance draft reports only real status transitions', () => {
  assert.deepEqual(model.statusesFromRecords(records), { r1: 'present', r2: 'absent' })
  assert.deepEqual(model.changedAttendanceRecords(records, { r1: 'late', r2: 'absent' }), [
    { record_id: 'r1', status: 'late', note: null },
  ])
  assert.equal(model.hasAttendanceChanges(records, { r1: 'present', r2: 'absent' }, '', null), false)
  assert.equal(model.hasAttendanceChanges(records, { r1: 'present', r2: 'half_day' }, '', null), true)
})

test('school date-only values do not shift across UTC boundaries', () => {
  const formatted = model.formatSchoolDate('2026-08-19')
  assert.match(formatted, /Aug/)
  assert.match(formatted, /19/)
})

test('attendance API carries optimistic concurrency and correction contracts', () => {
  const fs = require('node:fs')
  const api = fs.readFileSync('src/api/attendance.ts', 'utf8')
  assert.match(api, /expected_revision: expectedRevision/)
  assert.match(api, /createCorrection/)
  assert.match(api, /resolutionNote: string/)
})
