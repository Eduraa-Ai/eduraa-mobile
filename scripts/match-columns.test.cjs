const assert = require('node:assert/strict')
const test = require('node:test')

const {
    buildMatchColumnsRows,
    isMatchColumnsOptions,
    matchItemKey,
    stripMatchPrefix,
} = require(process.env.MATCH_COLUMNS_MODEL_PATH)

test('recognises the {left, right} shape and rejects MCQ rows', () => {
    assert.equal(isMatchColumnsOptions({ left: ['1. A'], right: ['A. B'] }), true)
    assert.equal(isMatchColumnsOptions({ left: ['1. A'] }), true)
    assert.equal(isMatchColumnsOptions([{ id: 'A', text: 'Oxygen' }]), false)
    assert.equal(isMatchColumnsOptions({ a: 'Oxygen', b: 'Carbon' }), false)
    assert.equal(isMatchColumnsOptions(null), false)
    assert.equal(isMatchColumnsOptions(undefined), false)
})

test('uses the authored marker as the key instead of doubling it', () => {
    const rows = buildMatchColumnsRows({
        left: ['1. Traditional fishing', '2. Present-day fishing'],
        right: ['A. Small groups', 'B. Large vessels'],
    })

    assert.deepEqual(rows.left, [
        { key: '1', label: 'Traditional fishing' },
        { key: '2', label: 'Present-day fishing' },
    ])
    assert.deepEqual(rows.right, [
        { key: 'A', label: 'Small groups' },
        { key: 'B', label: 'Large vessels' },
    ])
})

test('falls back to positional keys when items carry no marker', () => {
    const rows = buildMatchColumnsRows({
        left: ['Traditional fishing', 'Present-day fishing'],
        right: ['Small groups', 'Large vessels'],
    })

    assert.deepEqual(rows.left.map((row) => row.key), ['1', '2'])
    assert.deepEqual(rows.right.map((row) => row.key), ['A', 'B'])
    assert.equal(rows.left[0].label, 'Traditional fishing')
})

test('leaves hyphenated words intact', () => {
    assert.equal(stripMatchPrefix('Non-metals are brittle'), 'Non-metals are brittle')
    assert.equal(matchItemKey('Non-metals are brittle', '1'), '1')
})

test('handles the various list markers papers use', () => {
    assert.equal(stripMatchPrefix('iv) Roman numeral'), 'Roman numeral')
    assert.equal(stripMatchPrefix('3 - Spaced hyphen'), 'Spaced hyphen')
    assert.equal(stripMatchPrefix('10. Two digit'), 'Two digit')
    assert.equal(matchItemKey('c) lower case', 'A'), 'C')
})

test('tolerates a missing or empty column', () => {
    assert.deepEqual(buildMatchColumnsRows({ left: ['1. Only left'] }).right, [])
    assert.deepEqual(buildMatchColumnsRows({ left: [], right: [] }), { left: [], right: [] })
    assert.deepEqual(buildMatchColumnsRows(null), { left: [], right: [] })
})
