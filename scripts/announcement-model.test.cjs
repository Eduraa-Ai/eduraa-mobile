const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.ANNOUNCEMENT_MODEL_PATH
if (!modelPath) throw new Error('Set ANNOUNCEMENT_MODEL_PATH to the compiled model.')
const {
  announcementRequiresClass,
  announcementBodySegments,
  announcementErrorKind,
  clearAnnouncementDetail,
  reconcileAnnouncements,
  returnFromAnnouncements,
  validateAnnouncementDraft,
} = require(modelPath)

const classes = [{ id: 'class-a', standard: '10', division: 'A', student_count: 20 }]
const baseDraft = {
  announcement_type: 'announcement',
  target_scope: 'class',
  class_section_id: 'class-a',
  title: 'Library timing',
  body: 'The library closes at 4 PM.',
  attachments: [],
  publish_state: 'draft',
}

function item(overrides = {}) {
  return {
    id: 'announcement-1', teacher_id: 'teacher-1', teacher_name: 'Synthetic Teacher',
    announcement_type: 'announcement', target_scope: 'class', class_section_id: 'class-a',
    class_label: 'Std 10 - A', title: 'Library timing', body: 'Closes at 4 PM.',
    recipient_count: 20, attachments: [], publish_state: 'published',
    published_at: '2026-08-19T18:00:00Z', archived_at: null,
    updated_at: '2026-08-19T18:00:00Z', created_at: '2026-08-19T17:00:00Z',
    is_read: false, ...overrides,
  }
}

test('requires an authorized explicit audience and complete message before publish', () => {
  assert.deepEqual(validateAnnouncementDraft(baseDraft, classes), {})
  assert.equal(validateAnnouncementDraft({ ...baseDraft, class_section_id: 'another-school-class' }, classes).audience, 'Choose a class you currently teach.')
  assert.ok(validateAnnouncementDraft({ ...baseDraft, title: '', body: '' }, classes).title)
  assert.ok(validateAnnouncementDraft({ ...baseDraft, title: '', body: '' }, classes).body)
})

test('rejects unsupported timetable attachments inline', () => {
  const errors = validateAnnouncementDraft({
    ...baseDraft,
    announcement_type: 'exam_time_table',
    attachments: [{ file_name: 'table.docx', content_type: 'application/msword', data_base64: 'c3ludGhldGlj' }],
  }, classes)
  assert.match(errors.attachments, /images or PDFs/i)
})

test('home work, class work, and exam timetables require a specific authorized class', () => {
  for (const announcementType of ['home_work', 'class_work', 'exam_time_table']) {
    assert.equal(announcementRequiresClass(announcementType), true)

    const errors = validateAnnouncementDraft({
      ...baseDraft,
      announcement_type: announcementType,
      target_scope: 'all',
      class_section_id: null,
      attachments: announcementType === 'exam_time_table'
        ? [{ file_name: 'timetable.pdf', content_type: 'application/pdf', data_base64: 'c3ludGhldGlj' }]
        : [],
    }, classes)

    assert.match(errors.audience, /choose one class/i)
  }

  assert.equal(announcementRequiresClass('announcement'), false)
})

test('exam timetable accepts attachment-only publishing but still requires an image or PDF', () => {
  const attachmentOnly = {
    ...baseDraft,
    announcement_type: 'exam_time_table',
    title: '',
    body: '',
  }

  const missingAttachmentErrors = validateAnnouncementDraft(attachmentOnly, classes)
  assert.equal(missingAttachmentErrors.title, undefined)
  assert.equal(missingAttachmentErrors.body, undefined)
  assert.match(missingAttachmentErrors.attachments, /image or PDF timetable/i)

  const validErrors = validateAnnouncementDraft({
    ...attachmentOnly,
    attachments: [{ file_name: 'timetable.png', content_type: 'image/png', data_base64: 'c3ludGhldGlj' }],
  }, classes)
  assert.deepEqual(validErrors, {})
})

test('announcement navigation clears details without undefined routes and returns to role-safe roots', () => {
  const replaceCalls = []
  clearAnnouncementDetail({ replace: (routeName) => replaceCalls.push(routeName) })
  assert.deepEqual(replaceCalls, ['Announcements'])

  const paramCalls = []
  clearAnnouncementDetail({ setParams: (params) => paramCalls.push(params) })
  assert.deepEqual(paramCalls, [{ announcementId: undefined }])

  const backCalls = []
  assert.equal(returnFromAnnouncements({
    canGoBack: () => true,
    goBack: () => backCalls.push('back'),
  }, false), 'back')
  assert.deepEqual(backCalls, ['back'])

  const studentStates = []
  const teacherStates = []
  assert.equal(returnFromAnnouncements({ reset: (state) => studentStates.push(state) }, false), 'HomeMain')
  assert.equal(returnFromAnnouncements({ reset: (state) => teacherStates.push(state) }, true), 'StaffWorkspace')
  assert.deepEqual(studentStates, [{ index: 0, routes: [{ name: 'HomeMain' }] }])
  assert.deepEqual(teacherStates, [{ index: 0, routes: [{ name: 'StaffWorkspace' }] }])
})

test('reconciles refreshes without duplicates or losing optimistic read state', () => {
  const current = [item({ is_read: true })]
  const incoming = [item({ is_read: false }), item({ id: 'announcement-2', published_at: '2026-08-20T18:00:00Z' })]
  const reconciled = reconcileAnnouncements(current, incoming)
  assert.deepEqual(reconciled.map((entry) => entry.id), ['announcement-2', 'announcement-1'])
  assert.equal(reconciled[1].is_read, true)
})

test('linkifies only absolute http links and classifies recovery states', () => {
  const segments = announcementBodySegments('Read https://school.example/schedule and reply in class.')
  assert.equal(segments.filter((segment) => segment.link).length, 1)
  assert.equal(announcementErrorKind(403), 'permission')
  assert.equal(announcementErrorKind(404), 'missing')
  assert.equal(announcementErrorKind(), 'network')
})
