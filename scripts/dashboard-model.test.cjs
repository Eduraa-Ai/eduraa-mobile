const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const model = require(process.env.DASHBOARD_MODEL_PATH || '../src/screens/workspace/dashboardModel')

test('dashboard roles resolve only to backend-authorized dashboard families', () => {
  assert.equal(model.resolveStaffDashboardKind('teacher'), 'teacher')
  assert.equal(model.resolveStaffDashboardKind('principal'), 'institution')
  assert.equal(model.resolveStaffDashboardKind('school_super_admin'), 'institution')
  assert.equal(model.resolveStaffDashboardKind('admin'), 'operations')
  assert.equal(model.resolveStaffDashboardKind('branch_admin'), 'operations')
  assert.equal(model.resolveStaffDashboardKind('developer'), 'operations')
})

test('teacher dashboard normalizes metrics and prioritizes at-risk students', () => {
  const view = model.buildStaffDashboardModel({
    kind: 'teacher',
    data: {
      teacher: { first_name: 'Mira', last_name: 'Shah', school_name: 'Eduraa School' },
      summary: {
        roster_students: 30,
        active_students: 27,
        submissions: 42,
        papers: 6,
        average_percent: 68.25,
        change_vs_prev_week: 2.4,
        at_risk_students: 1,
        integrity_flags: 0,
      },
      students: [
        { student_id: 'strong', student_name: 'Strong Student', average_percent: 92, submissions_count: 4, risk_level: 'strong' },
        { student_id: 'risk', student_name: 'Risk Student', average_percent: 35, submissions_count: 2, risk_level: 'at_risk' },
      ],
    },
  }, 'teacher')

  assert.equal(view.metrics[1].value, '68.3%')
  assert.equal(view.rows[0].id, 'risk')
  assert.equal(view.rows[0].tone, 'danger')
})

test('operations dashboard handles empty attendance without NaN and gives a useful empty state', () => {
  const view = model.buildStaffDashboardModel({
    kind: 'operations',
    data: {
      attendance_date: '2026-08-26',
      total_classes: 0,
      submitted_classes: 0,
      pending_classes: 0,
      total_students: 0,
      present_count: 0,
      absent_count: 0,
      late_count: 0,
      half_day_count: 0,
      excused_count: 0,
      reopened_sheets: 0,
      classes: [],
      pending: [],
    },
  }, 'branch_admin')

  assert.equal(view.metrics[3].value, '0.0%')
  assert.equal(view.rows.length, 0)
  assert.match(view.emptyTitle, /on track/i)
})

test('workspace dashboard control opens a registered screen instead of the active tab', () => {
  const workspace = fs.readFileSync('src/screens/workspace/WorkspaceScreen.tsx', 'utf8')
  const navigation = fs.readFileSync('src/navigation/index.tsx', 'utf8')
  const catalog = fs.readFileSync('src/data/mobileControlCatalog.ts', 'utf8')

  assert.match(workspace, /control\.id === 'dashboard'[\s\S]*navigation\.navigate\('Dashboard'\)/)
  assert.match(navigation, /StaffWorkspaceStack\.Screen[\s\S]*name="Dashboard"[\s\S]*component=\{DashboardScreen\}/)
  assert.match(catalog, /id: 'dashboard'[\s\S]*target: \{ kind: 'detail' \}/)
})
