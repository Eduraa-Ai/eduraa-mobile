const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.PREVIOUS_PAPERS_MODEL_PATH
if (!modelPath) throw new Error('Set PREVIOUS_PAPERS_MODEL_PATH to the compiled Previous Papers model.')
const model = require(modelPath)

function paper(overrides = {}) {
  return {
    id: 'paper-main-2024',
    title: 'JEE Main 2024 · Paper 1',
    exam_family: 'jee_main',
    exam: 'JEE Main',
    year: 2024,
    session_label: 'Session 1',
    shift_label: 'Shift 1',
    paper_label: 'Paper 1',
    question_count: 90,
    subjects: ['Physics', 'Chemistry', 'Mathematics'],
    has_solutions: true,
    ...overrides,
  }
}

function chapter(index) {
  return {
    previous_paper_id: 'paper-main-2024',
    subject: 'Physics',
    branch: null,
    chapter_id: `chapter-${index}`,
    chapter_title: `Chapter ${index}`,
    topic_slug: `chapter-${index}`,
    question_count: index,
  }
}

const papers = [
  paper(),
  paper({ id: 'paper-advanced-2023', title: 'JEE Advanced 2023 · Paper 1', exam_family: 'jee_advanced', exam: 'JEE Advanced', year: 2023 }),
  paper({ id: 'paper-main-2022', title: 'JEE Main 2022 · Paper 2', year: 2022 }),
  paper({ id: 'paper-undated', title: 'JEE Main archive', year: null }),
]

test('derives unique exams and descending non-empty years', () => {
  assert.deepEqual(model.getPreviousPaperFilters(papers), {
    exams: ['JEE Main', 'JEE Advanced'],
    years: ['2024', '2023', '2022'],
  })
})

test('filters by exam and year with AND semantics', () => {
  assert.deepEqual(
    model.filterPreviousPapers(papers, 'JEE Main', '2022').map((item) => item.id),
    ['paper-main-2022'],
  )
  assert.deepEqual(
    model.filterPreviousPapers(papers, 'JEE Advanced', '2024'),
    [],
  )
})

test('keeps a visible paper selection and reconciles a hidden one', () => {
  const visible = model.filterPreviousPapers(papers, 'JEE Main', null)
  assert.equal(model.reconcileSelectedPaperId(visible, 'paper-main-2022'), 'paper-main-2022')
  assert.equal(model.reconcileSelectedPaperId(visible, 'paper-advanced-2023'), 'paper-main-2024')
  assert.equal(model.reconcileSelectedPaperId([], 'paper-main-2024'), null)
})

test('shows a concise chapter set until the learner expands it', () => {
  const chapters = Array.from({ length: 8 }, (_, index) => chapter(index + 1))
  assert.deepEqual(model.getVisibleChapters(chapters, false, 6).map((item) => item.chapter_id), [
    'chapter-1',
    'chapter-2',
    'chapter-3',
    'chapter-4',
    'chapter-5',
    'chapter-6',
  ])
  assert.equal(model.getVisibleChapters(chapters, true, 6).length, 8)
})

test('normalizes string and FastAPI validation errors into renderable text', () => {
  assert.equal(
    model.getApiErrorMessage({ response: { data: { detail: 'No questions match this selection.' } } }, 'Fallback'),
    'No questions match this selection.',
  )
  assert.equal(
    model.getApiErrorMessage({
      response: {
        data: {
          detail: [
            { type: 'missing', loc: ['body', 'subject'], msg: 'Subject is required', input: null },
            { type: 'value_error', loc: ['body', 'chapter_id'], msg: 'Chapter is unavailable', input: 'missing' },
          ],
        },
      },
    }, 'Fallback'),
    'Subject is required Chapter is unavailable',
  )
  assert.equal(model.getApiErrorMessage({ response: { data: { detail: { code: 'bad' } } } }, 'Fallback'), 'Fallback')
  assert.equal(model.getApiErrorMessage(new Error('Network down'), 'Fallback'), 'Network down')
})
