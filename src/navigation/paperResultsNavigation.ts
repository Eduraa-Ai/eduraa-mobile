type NavigationLike = {
  canGoBack?: () => boolean
  getParent?: () => NavigationLike | undefined
  getState?: () => { routeNames?: string[] }
  goBack?: () => void
  navigate?: (...args: any[]) => void
}

function routeNames(navigation: NavigationLike | undefined) {
  return navigation?.getState?.().routeNames ?? []
}

export function navigateToCheckedPapers(
  navigation: NavigationLike,
  checkedPaperId?: string,
) {
  let candidate: NavigationLike | undefined = navigation

  while (candidate) {
    const names = routeNames(candidate)
    const resultsRoute = names.includes('Results')
      ? 'Results'
      : names.includes('StaffResults')
        ? 'StaffResults'
        : null

    if (resultsRoute && candidate.navigate) {
      candidate.navigate(
        resultsRoute,
        checkedPaperId
          ? { screen: 'ResultDetail', params: { checkedPaperId } }
          : { screen: 'ResultsList' },
      )
      return true
    }

    candidate = candidate.getParent?.()
  }

  return false
}

export function returnToCheckedPapers(navigation: NavigationLike) {
  if (navigation.canGoBack?.() && navigation.goBack) {
    navigation.goBack()
    return true
  }

  return navigateToCheckedPapers(navigation)
}
