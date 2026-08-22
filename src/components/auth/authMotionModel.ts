export type AuthMotionState = 'intro' | 'idle' | 'identity' | 'password' | 'submitting' | 'error' | 'offline' | 'success'

export type CircuitGroup = 'center' | 'identity' | 'password'

export function routeTarget(state: AuthMotionState, group: CircuitGroup) {
  if (state === 'success') return 1
  if (state === 'offline') return 0.12
  if (state === 'error') return group === 'center' ? 0.38 : 0.2
  if (state === 'submitting') return group === 'center' ? 0.92 : 0.62
  if (state === 'identity') return group === 'identity' ? 0.78 : group === 'center' ? 0.5 : 0.2
  if (state === 'password') return group === 'password' ? 0.78 : group === 'center' ? 0.5 : 0.2
  return group === 'center' ? 0.36 : 0.28
}

export function getStaticAuthMotionTargets(state: AuthMotionState) {
  return {
    entrance: 1,
    lockupEntrance: 1,
    signalProgress: 1,
    centerEnergy: state === 'success' ? 0.8 : routeTarget(state, 'center'),
    identityEnergy: routeTarget(state, 'identity'),
    passwordEnergy: routeTarget(state, 'password'),
    seamOffset: 0,
    nodeBloom: state === 'success' ? 0.86 : 0.24,
  } as const
}

export function getAuthHandoffDelay(reducedMotion: boolean, transition: 'login' | 'registration') {
  if (reducedMotion) return 0
  return transition === 'registration' ? 160 : 180
}

export function shouldStackRegistrationChoices(fontScale: number) {
  return fontScale >= 1.2
}
