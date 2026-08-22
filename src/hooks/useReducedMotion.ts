import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    let mounted = true
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion)
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled)
    })

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return reducedMotion
}
