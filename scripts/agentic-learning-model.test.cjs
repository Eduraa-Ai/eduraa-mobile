const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.AGENTIC_LEARNING_MODEL_PATH
if (!modelPath) throw new Error('Set AGENTIC_LEARNING_MODEL_PATH to the compiled Agentic Learning model.')
const model = require(modelPath)

const subjects = [
  { subject_id: 'physics', subject_name: 'Physics', unresolved_count: 2, total_subtopics: 14, average_mastery: 48, mastery_trend: [] },
  { subject_id: 'chemistry', subject_name: 'Chemistry', unresolved_count: 1, total_subtopics: 11, average_mastery: 41, mastery_trend: [] },
  { subject_id: 'maths', subject_name: 'Mathematics', unresolved_count: 0, total_subtopics: 15, average_mastery: 76, mastery_trend: [] },
]

function topic(overrides = {}) {
  return {
    topic_id: 'flux', subject_id: 'physics', topic_name: 'Electric field lines & flux', status: 'needs_repair',
    mastery_score: 32, confidence: 41, attempt_count: 5, summary: 'Repeated sign error.', has_diagram: true,
    pyq_frequency: 12, ...overrides,
  }
}

test('clamps unstable percentage values', () => {
  assert.equal(model.clampPercent(-9), 0)
  assert.equal(model.clampPercent(101.4), 100)
  assert.equal(model.clampPercent(Number.NaN), 0)
})

test('counts open concepts without negative values', () => {
  assert.equal(model.totalOpenConcepts(subjects), 3)
  assert.equal(model.totalOpenConcepts([{ ...subjects[0], unresolved_count: -2 }]), 0)
})

test('uses a local presentation tone without changing stored status', () => {
  assert.equal(model.topicTone(topic()), 'repair')
  assert.equal(model.topicTone(topic({ mastery_score: 58 })), 'polish')
  assert.equal(model.topicTone(topic({ mastery_score: 81 })), 'stable')
  assert.equal(model.topicTone(topic({ status: 'resolved' })), 'resolved')
})

test('maps tones to student-facing status labels', () => {
  assert.equal(model.topicStatusLabel(topic()), 'Repair now')
  assert.equal(model.topicStatusLabel(topic({ mastery_score: 58 })), 'Needs polish')
  assert.equal(model.topicStatusLabel(topic({ mastery_score: 81 })), 'Stable')
})

test('selects only an available priority action', () => {
  const actions = [
    { id: 'disabled', label: 'Disabled', icon: '', action_kind: '', available: false, target_topic_id: 'x' },
    { id: 'ready', label: 'Ready', icon: '', action_kind: '', available: true, target_topic_id: 'flux' },
  ]
  assert.equal(model.priorityAction(actions).id, 'ready')
})

test('selects the weakest unresolved subject and next open topic', () => {
  assert.equal(model.weakestSubject(subjects).subject_id, 'chemistry')
  const topics = [topic({ status: 'resolved' }), topic({ topic_id: 'kirchhoff', status: 'needs_polish' })]
  assert.equal(model.nextOpenTopic(topics, 'flux').topic_id, 'kirchhoff')
})

test('accessibility label carries non-color learning state', () => {
  const label = model.topicAccessibilityLabel(topic())
  assert.match(label, /Repair now/)
  assert.match(label, /32 percent mastery/)
})

test('previous-year question counts are announced only to exam-track learners', () => {
  // A B2B school learner must not be told about previous-year questions: the
  // metric is competitive-exam framing and does not apply to their curriculum.
  const schoolLabel = model.topicAccessibilityLabel(topic(), false)
  assert.doesNotMatch(schoolLabel, /previous-year questions/)

  const examLabel = model.topicAccessibilityLabel(topic(), true)
  assert.match(examLabel, /12 previous-year questions/)
})
