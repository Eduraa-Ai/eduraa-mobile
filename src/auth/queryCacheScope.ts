import type { AccountMinimal } from '../types'

type CacheClearer = () => void

let clearPrivateQueryCache: CacheClearer | null = null

export function accountCacheScope(
  account: Pick<AccountMinimal, 'id' | 'role'> | null | undefined,
) {
  return account ? `${account.role}:${account.id}` : null
}

export function registerPrivateQueryCacheClearer(clearer: CacheClearer) {
  clearPrivateQueryCache = clearer
}

export function clearRegisteredPrivateQueryCache() {
  clearPrivateQueryCache?.()
}

export function shouldClearQueryCache(
  previousAccountScope: string | null | undefined,
  currentAccountScope: string | null,
) {
  return previousAccountScope != null && previousAccountScope !== currentAccountScope
}
