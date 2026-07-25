export function shouldClearQueryCache(
  previousUserId: string | null | undefined,
  currentUserId: string | null,
) {
  return previousUserId != null && previousUserId !== currentUserId
}
