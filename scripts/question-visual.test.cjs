const assert = require('node:assert/strict')
const test = require('node:test')

const {
    getQuestionVisualAssetUrls,
    normalizeQuestionVisualPayload,
    resolveQuestionVisualUrl,
    shouldShowQuestionStemText,
} = require(process.env.QUESTION_VISUAL_MODEL_PATH)

const apiBaseUrl = 'https://api.eduraa.test'

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
