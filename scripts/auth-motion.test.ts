import assert from 'node:assert/strict'
import test from 'node:test'
import { getAuthHandoffDelay, getStaticAuthMotionTargets, shouldStackRegistrationChoices } from '../src/components/auth/authMotionModel'

test('reduced motion resolves immediately to a stable idle composition', () => {
  assert.deepEqual(getStaticAuthMotionTargets('idle'), {
    entrance: 1,
    lockupEntrance: 1,
    signalProgress: 1,
    centerEnergy: 0.36,
    identityEnergy: 0.28,
    passwordEnergy: 0.28,
    seamOffset: 0,
    nodeBloom: 0.24,
  })
})

test('reduced motion removes auth handoff delays', () => {
  assert.equal(getAuthHandoffDelay(true, 'login'), 0)
  assert.equal(getAuthHandoffDelay(true, 'registration'), 0)
  assert.equal(getAuthHandoffDelay(false, 'login'), 180)
  assert.equal(getAuthHandoffDelay(false, 'registration'), 160)
})

test('large accessibility text switches registration choices to a stacked layout', () => {
  assert.equal(shouldStackRegistrationChoices(1), false)
  assert.equal(shouldStackRegistrationChoices(1.19), false)
  assert.equal(shouldStackRegistrationChoices(1.2), true)
  assert.equal(shouldStackRegistrationChoices(2), true)
})

test('reduced motion preserves semantic error and success states without animation', () => {
  assert.deepEqual(getStaticAuthMotionTargets('error'), {
    entrance: 1,
    lockupEntrance: 1,
    signalProgress: 1,
    centerEnergy: 0.38,
    identityEnergy: 0.2,
    passwordEnergy: 0.2,
    seamOffset: 0,
    nodeBloom: 0.24,
  })
  assert.deepEqual(getStaticAuthMotionTargets('success'), {
    entrance: 1,
    lockupEntrance: 1,
    signalProgress: 1,
    centerEnergy: 0.8,
    identityEnergy: 1,
    passwordEnergy: 1,
    seamOffset: 0,
    nodeBloom: 0.86,
  })
})
