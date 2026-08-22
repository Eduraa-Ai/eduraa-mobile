const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.ANNOUNCEMENT_MODEL_PATH
if (!modelPath) throw new Error('Set ANNOUNCEMENT_MODEL_PATH to the compiled model.')
const {
  announcementBodySegments,
  announcementErrorKind,
  reconcileAnnouncements,
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
