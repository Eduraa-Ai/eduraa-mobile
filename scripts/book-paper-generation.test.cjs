const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.BOOK_PAPER_GENERATION_MODEL_PATH
if (!modelPath) throw new Error('BOOK_PAPER_GENERATION_MODEL_PATH is required')

const {
    getAvailableBookCountCandidates,
    isBookQuestionShortage,
    withBookMcqCount,
} = require(modelPath)

test('recognizes only the backend book-bank shortage error', () => {
    assert.equal(
        isBookQuestionShortage({
            response: {
                data: {
                    detail: 'Not enough questions in the book for this chapter and difficulty.',
                },
            },
        }),
        true,
    )
    assert.equal(isBookQuestionShortage(new Error('Network request failed')), false)
})

test('tries every smaller positive count from largest to smallest', () => {
    assert.deepEqual(getAvailableBookCountCandidates(4), [3, 2, 1])
    assert.deepEqual(getAvailableBookCountCandidates(1), [])
})

test('keeps MCQ count, marks, and blueprint slots aligned', () => {
    const payload = {
        subject_id: 'chemistry',
        chapter_ids: ['atomic-structure'],
        difficulty: 'medium',
        title_line_1: 'Chemistry Paper',
        mcq_count: 4,
        short_answer_count: 0,
        long_answer_count: 0,
        fill_blank_count: 0,
        match_columns_count: 0,
        true_false_count: 0,
        marks_per_mcq: 2,
        blueprint_header: { title: 'Chemistry Paper', target_marks: 8 },
        blueprint_sections: [
            {
                id: 'section-mcq',
                title: 'MCQ',
                question_type: 'mcq',
                slots: [1, 2, 3, 4].map((number) => ({
                    id: `slot-${number}`,
                    question_type: 'mcq',
                    marks: 2,
                    is_placeholder: true,
                })),
            },
        ],
    }

    const adjusted = withBookMcqCount(payload, 2)
    assert.equal(adjusted.mcq_count, 2)
    assert.equal(adjusted.blueprint_header.target_marks, 4)
    assert.deepEqual(
        adjusted.blueprint_sections[0].slots.map((slot) => slot.id),
        ['slot-1', 'slot-2'],
    )
})