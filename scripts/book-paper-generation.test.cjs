const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.BOOK_PAPER_GENERATION_MODEL_PATH
if (!modelPath) throw new Error('BOOK_PAPER_GENERATION_MODEL_PATH is required')

const {
    findLargestAvailableBookCount,
    getAvailableBookCountCandidates,
    isBookQuestionShortage,
    withBookMcqCount,
} = require(modelPath)

const shortage = () => ({
    response: {
        data: { detail: 'Not enough questions in the book for this chapter and difficulty.' },
    },
})

/** Bank that can satisfy any request up to `capacity`, and records every probe. */
function fakeBank(capacity) {
    const probes = []
    return {
        probes,
        attempt: async (count) => {
            probes.push(count)
            if (count > capacity) throw shortage()
            return { questions: Array.from({ length: count }, (_, i) => i) }
        },
    }
}

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

test('lists smaller positive counts largest-first and never offers zero', () => {
    assert.deepEqual(getAvailableBookCountCandidates(4), [3, 2, 1])
    assert.deepEqual(getAvailableBookCountCandidates(1), [])
    assert.deepEqual(getAvailableBookCountCandidates(0), [])
})

test('finds the largest fillable count without walking every option', async () => {
    const bank = fakeBank(6)
    const found = await findLargestAvailableBookCount(10, bank.attempt)

    assert.equal(found.count, 6)
    assert.equal(found.result.questions.length, 6)
    // Binary search over [1, 9] — far fewer than the 9 calls a linear walk costs.
    assert.ok(bank.probes.length <= 4, `expected <= 4 probes, got ${bank.probes.length}`)
})

test('reports nothing available when even one question cannot be filled', async () => {
    const bank = fakeBank(0)
    assert.equal(await findLargestAvailableBookCount(5, bank.attempt), null)
})

test('never asks the backend for a zero-question paper', async () => {
    const bank = fakeBank(3)
    await findLargestAvailableBookCount(8, bank.attempt)
    assert.ok(bank.probes.every((count) => count > 0), `probed ${bank.probes.join(',')}`)
})

test('propagates non-shortage failures instead of blaming the book bank', async () => {
    const boom = new Error('Network request failed')
    await assert.rejects(
        () => findLargestAvailableBookCount(10, async () => { throw boom }),
        (error) => error === boom,
    )
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