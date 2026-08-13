const assert = require('node:assert/strict')
const test = require('node:test')

const {
    getQuestionVisualAssetUrls,
    normalizeQuestionVisualPayload,
    planQuestionVisualPrefetch,
    resolveQuestionVisualUrl,
    shouldShowQuestionStemText,
} = require(process.env.QUESTION_VISUAL_MODEL_PATH)

const apiBaseUrl = 'https://api.eduraa.test'

const cropQuestion = (name) => ({
    visual_payload: {
        kind: 'question_crop',
        asset_url: `/api/v1/documents/visuals/${name}.png`,
    },
})

test('preserves absolute and API visual URLs', () => {
    assert.equal(
        resolveQuestionVisualUrl('https://cdn.eduraa.test/crop.png', apiBaseUrl),
        'https://cdn.eduraa.test/crop.png',
    )
    assert.equal(
        resolveQuestionVisualUrl('/api/v1/documents/visuals/book-id/crop.png', apiBaseUrl),
        'https://api.eduraa.test/api/v1/documents/visuals/book-id/crop.png',
    )
})

test('maps legacy storage paths to the document visual endpoint', () => {
    assert.equal(
        resolveQuestionVisualUrl('/document_visuals/chapter-4-question-2.png', apiBaseUrl),
        'https://api.eduraa.test/api/v1/documents/visuals/chapter-4-question-2.png',
    )
})

test('collects multiple visual assets without duplicates', () => {
    assert.deepEqual(
        getQuestionVisualAssetUrls({
            kind: 'document_figure',
            asset_url: '/api/v1/documents/visuals/first.png',
            asset_urls: [
                '/api/v1/documents/visuals/first.png',
                '/api/v1/documents/visuals/second.png',
            ],
        }),
        [
            '/api/v1/documents/visuals/first.png',
            '/api/v1/documents/visuals/second.png',
        ],
    )
})

test('hides crop OCR interactively but falls back when its image is missing', () => {
    const crop = { kind: 'question_crop', asset_url: '/api/v1/documents/visuals/crop.png' }
    assert.equal(shouldShowQuestionStemText(crop, 'interactive'), false)
    assert.equal(shouldShowQuestionStemText(crop, 'results'), true)
    assert.equal(shouldShowQuestionStemText({ kind: 'question_crop' }, 'interactive'), true)
    assert.equal(
        shouldShowQuestionStemText(
            { kind: 'document_figure', asset_url: '/api/v1/documents/visuals/diagram.png' },
            'interactive',
        ),
        true,
    )
})

test('normalizes legacy generated-paper visual fields', () => {
    assert.deepEqual(
        normalizeQuestionVisualPayload({
            question_visual: JSON.stringify({
                image_urls: [
                    '/api/v1/ai/jee/diagrams/first.png',
                    '/api/v1/ai/jee/diagrams/second.png',
                ],
                caption: 'Two-part geometry diagram',
            }),
        }),
        {
            kind: 'generated_diagram',
            asset_url: '/api/v1/ai/jee/diagrams/first.png',
            asset_urls: [
                '/api/v1/ai/jee/diagrams/first.png',
                '/api/v1/ai/jee/diagrams/second.png',
            ],
            alt_text: 'Two-part geometry diagram',
            captions: [],
        },
    )

    assert.deepEqual(
        normalizeQuestionVisualPayload({
            question_image_url: '/api/v1/documents/visuals/legacy.png',
            question_image_alt: 'Legacy textbook figure',
        }),
        {
            kind: 'generated_diagram',
            asset_url: '/api/v1/documents/visuals/legacy.png',
            asset_urls: ['/api/v1/documents/visuals/legacy.png'],
            alt_text: 'Legacy textbook figure',
            captions: [],
        },
    )
})

test('warms the visible book figure first, then the questions just ahead', () => {
    const questions = [
        cropQuestion('q1'),
        { visual_payload: null },
        cropQuestion('q3'),
        cropQuestion('q4'),
        cropQuestion('q5'),
    ]

    assert.deepEqual(
        planQuestionVisualPrefetch(questions, { apiBaseUrl, ahead: 3, limit: 4 }),
        [
            'https://api.eduraa.test/api/v1/documents/visuals/q1.png',
            'https://api.eduraa.test/api/v1/documents/visuals/q3.png',
            'https://api.eduraa.test/api/v1/documents/visuals/q4.png',
        ],
    )
    assert.deepEqual(
        planQuestionVisualPrefetch(questions, { apiBaseUrl, startIndex: 2, ahead: 2, limit: 4 }),
        [
            'https://api.eduraa.test/api/v1/documents/visuals/q3.png',
            'https://api.eduraa.test/api/v1/documents/visuals/q4.png',
            'https://api.eduraa.test/api/v1/documents/visuals/q5.png',
        ],
    )
    assert.deepEqual(
        planQuestionVisualPrefetch(questions, { apiBaseUrl, startIndex: 3, ahead: 0, limit: 4 }),
        ['https://api.eduraa.test/api/v1/documents/visuals/q4.png'],
    )
})

test('keeps the prefetch window bounded and deduplicated', () => {
    const shared = {
        visual_payload: {
            kind: 'question_crop',
            asset_urls: [
                '/api/v1/documents/visuals/shared.png',
                '/api/v1/documents/visuals/extra.png',
            ],
        },
    }
    const questions = [shared, shared, cropQuestion('last')]

    assert.deepEqual(
        planQuestionVisualPrefetch(questions, { apiBaseUrl, ahead: 5, limit: 2 }),
        [
            'https://api.eduraa.test/api/v1/documents/visuals/shared.png',
            'https://api.eduraa.test/api/v1/documents/visuals/extra.png',
        ],
    )
    // A viewability report past the end of the paper must not skip the last figure.
    assert.deepEqual(
        planQuestionVisualPrefetch(questions, { apiBaseUrl, startIndex: 40, ahead: 3, limit: 4 }),
        ['https://api.eduraa.test/api/v1/documents/visuals/last.png'],
    )
    assert.deepEqual(planQuestionVisualPrefetch([], { apiBaseUrl }), [])
    assert.deepEqual(planQuestionVisualPrefetch(questions, { apiBaseUrl, limit: 0 }), [])
})
