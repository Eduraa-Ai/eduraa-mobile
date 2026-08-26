const assert = require('node:assert/strict')
const test = require('node:test')
const model = require(process.env.ATTENDANCE_MODEL_PATH || '../src/screens/workspace/attendanceModel')

const records = [
  { id: 'r1', status: 'present', note: null },
  { id: 'r2', status: 'absent', note: 'Sick' },
]

test('attendance draft reports only real status transitions', () => {
  assert.deepEqual(model.statusesFromRecords(records), {
    r1: { status: 'present', note: '' },
    r2: { status: 'absent', note: 'Sick' },
  })
  assert.deepEqual(model.changedAttendanceRecords(records, {
    r1: { status: 'late', note: 'Bus delay' },
    r2: { status: 'absent', note: 'Sick' },
  }), [
    { record_id: 'r1', status: 'late', note: 'Bus delay' },
  ])
  assert.equal(model.hasAttendanceChanges(records, {
    r1: { status: 'present', note: '' },
    r2: { status: 'absent', note: 'Sick' },
  }, '', null), false)
  assert.equal(model.hasAttendanceChanges(records, {
    r1: { status: 'present', note: '' },
    r2: { status: 'half_day', note: 'Sick' },
  }, '', null), true)
})

test('attendance draft detects note-only edits and restores legacy local drafts', () => {
  assert.deepEqual(model.changedAttendanceRecords(records, {
    r1: { status: 'present', note: 'Arrived with class' },
    r2: { status: 'absent', note: 'Sick' },
  }), [
    { record_id: 'r1', status: 'present', note: 'Arrived with class' },
  ])
  assert.deepEqual(model.restoreAttendanceDraft({ statuses: { r1: 'late', r2: 'absent' } }, records), {
    r1: { status: 'late', note: '' },
    r2: { status: 'absent', note: 'Sick' },
  })
})

test('attendance roster filtering matches web search and exception controls', () => {
  const roster = [
    { id: 'r1', student_name: 'Aarav Singh', student_code: 'S-001', status: 'present' },
    { id: 'r2', student_name: 'Mira Shah', student_code: 'S-002', status: 'late' },
  ]
  assert.deepEqual(model.filterAttendanceRecords(roster, '002', 'all').map((item) => item.id), ['r2'])
  assert.deepEqual(model.filterAttendanceRecords(roster, '', 'exceptions').map((item) => item.id), ['r2'])
  assert.deepEqual(model.filterAttendanceRecords(roster, 'aarav', 'present').map((item) => item.id), ['r1'])
})

test('changed filter shows only teacher edits and still composes with search', () => {
  const original = [
    { id: 'r1', student_name: 'Aarav Singh', student_code: 'S-001', status: 'present', note: null },
    { id: 'r2', student_name: 'Mira Shah', student_code: 'S-002', status: 'present', note: null },
    { id: 'r3', student_name: 'Kabir Rao', student_code: 'S-003', status: 'late', note: null },
  ]
  const live = [
    { ...original[0], status: 'absent', note: 'Parent informed' },
    original[1],
    { ...original[2], note: 'Bus delay' },
  ]
  assert.deepEqual(model.filterAttendanceRecords(live, '', 'changed', original).map((item) => item.id), ['r1', 'r3'])
  assert.deepEqual(model.filterAttendanceRecords(live, 'mira', 'changed', original), [])
})

test('student selection narrows the roster before status and search filters', () => {
  const roster = [
    { id: 'r1', student_id: 's1', student_name: 'Aarav Singh', student_code: 'S-001', status: 'present' },
    { id: 'r2', student_id: 's2', student_name: 'Mira Shah', student_code: 'S-002', status: 'late' },
  ]
  assert.deepEqual(model.filterAttendanceRecords(roster, '', 'all', [], 's2').map((item) => item.id), ['r2'])
  assert.deepEqual(model.filterAttendanceRecords(roster, 'aarav', 'all', [], 's2'), [])
})

test('attendance API exposes date-aware dashboards and leadership override', () => {
  const fs = require('node:fs')
  const api = fs.readFileSync('src/api/attendance.ts', 'utf8')
  assert.match(api, /attendance_date: attendanceDate/)
  assert.match(api, /attendance\/teacher\/classes/)
  assert.match(api, /class_section_id: classSectionId/)
  assert.match(api, /overrideRecord/)
  assert.match(api, /records\/\$\{recordId\}\/override/)
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
