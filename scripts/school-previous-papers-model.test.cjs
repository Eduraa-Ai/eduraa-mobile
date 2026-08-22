const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.SCHOOL_PREVIOUS_PAPERS_MODEL_PATH
if (!modelPath) throw new Error('Set SCHOOL_PREVIOUS_PAPERS_MODEL_PATH to the compiled model.')

const {
  filterPracticeSchoolPapers,
  filterSharedSchoolPapers,
  getSchoolPreviousPaperFilters,
  schoolPaperActions,
  schoolPaperFilename,
  schoolPaperYear,
} = require(modelPath)

const shared = [
  {
    id: 'pdf-1',
    title: 'Algebra Annual Paper',
    description: null,
    original_filename: 'algebra.pdf',
    content_type: 'application/pdf',
    file_size_bytes: 100,
    subject_label: 'Mathematics',
    target_scope: 'class',
    class_label: '10 A',
    standard: '10',
    division: 'A',
    status: 'published',
    uploaded_by_teacher_id: 'teacher-1',
    teacher_name: 'Long Teacher Name',
    view_url: '/question-papers/pdf-1/view',
    download_url: '/question-papers/pdf-1/download',
    published_at: '2025-04-15T00:00:00Z',
    created_at: '2025-04-01T00:00:00Z',
    updated_at: '2025-04-15T00:00:00Z',
  },
  {
    id: 'pdf-2',
    title: 'Partial paper',
    original_filename: 'partial.pdf',
    content_type: 'application/pdf',
    file_size_bytes: 0,
    target_scope: 'all_classes',
    status: 'archived',
    uploaded_by_teacher_id: 'teacher-1',
    teacher_name: '',
    view_url: '/question-papers/pdf-2/view',
    download_url: '/question-papers/pdf-2/download',
    created_at: 'invalid-date',
    updated_at: '2025-04-15T00:00:00Z',
  },
]

const practice = [
  {
    id: 'paper-1',
    title: 'Geometry Practice',
    subject_name: 'Mathematics',
    standard: '10',
    division: 'A',
    category: 'Annual',
    total_marks: 80,
    status: 'published',
    created_at: '2024-09-01T00:00:00Z',
  },
]

test('derives contract filters while tolerating partial optional metadata', () => {
  assert.deepEqual(getSchoolPreviousPaperFilters(shared, practice), {
    subjects: ['Mathematics'],
    standards: ['10'],
    years: ['2025', '2024'],
    statuses: ['archived', 'published'],
  })
  assert.equal(schoolPaperYear('invalid-date'), null)
})

test('filters shared and structured papers by visible school metadata', () => {
  const filters = { search: 'teacher', subject: 'Mathematics', standard: '10', year: '2025', status: 'published' }
  assert.deepEqual(filterSharedSchoolPapers(shared, filters).map((paper) => paper.id), ['pdf-1'])
  assert.deepEqual(
    filterPracticeSchoolPapers(practice, { search: 'annual', subject: 'Mathematics', standard: '10', year: '2024' }).map((paper) => paper.id),
    ['paper-1'],
  )
})

test('keeps student and teacher actions separate', () => {
  assert.deepEqual(schoolPaperActions('student', 'practice'), ['attempt'])
  assert.deepEqual(schoolPaperActions('student', 'shared'), ['open_pdf'])
  assert.deepEqual(schoolPaperActions('teacher', 'practice'), ['open_details'])
  assert.deepEqual(schoolPaperActions('teacher', 'shared'), ['open_pdf'])
  assert.deepEqual(schoolPaperActions('principal', 'practice'), [])
})

test('preserves safe PDF filenames', () => {
  assert.equal(schoolPaperFilename(shared[0]), 'Algebra Annual Paper.pdf')
  assert.equal(schoolPaperFilename({ ...shared[0], title: 'Already.PDF' }), 'Already.PDF')
})
