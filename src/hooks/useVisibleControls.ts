import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { b2cApi } from '../api/b2c'
import { mobileControls, MobileControl, roleCanSeeControl } from '../data/mobileControlCatalog'
import { useAuthStore } from '../stores/authStore'
import { useClassTeacherAccess } from './useClassTeacherAccess'

type User = ReturnType<typeof useAuthStore.getState>['user']
type B2CProfile = Awaited<ReturnType<typeof b2cApi.getProfile>>

function isCompetitiveProfile(user: User, profile?: B2CProfile) {
  return (
    user?.b2c_education_level === 'competitive_exams' ||
    user?.b2c_education_level === 'competitive_exam' ||
    profile?.education_level === 'competitive_exams'
  )
}

function isJeeProfile(user: User, profile?: B2CProfile) {
  const haystack = [
    user?.b2c_board,
    user?.b2c_standard,
    user?.b2c_target_exam,
    ...(user?.b2c_subjects ?? []),
    profile?.school_board,
    profile?.school_standard,
    ...(profile?.subjects ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes('jee')
}

/**
 * The catalog controls the signed-in user may open. Home and the staff
 * "All tools" sheet both read this, so the two lists can never drift apart.
 */
export function useVisibleControls() {
  const user = useAuthStore((state) => state.user)

  const b2cQuery = useQuery({
    queryKey: ['workspace-b2c-profile', user?.id],
    queryFn: b2cApi.getProfile,
    enabled: user?.role === 'b2c_student',
  })

  const classTeacherAccess = useClassTeacherAccess({ enabled: user?.role === 'teacher' })

  const controls = useMemo<MobileControl[]>(() => {
    if (!user?.role) return []
    const competitive = isCompetitiveProfile(user, b2cQuery.data)
    const jee = isJeeProfile(user, b2cQuery.data)
    const requiresB2CEntitlements = user.role === 'b2c_student'

    return mobileControls.filter((control) => {
      if (control.hiddenOnWeb || !roleCanSeeControl(user.role, control)) return false
      // Class-teacher gating applies to teachers only; students read announcements.
      if (control.requiresClassTeacher && user.role === 'teacher') {
        // The JWT claim can be stale in both directions, so the server's
        // answer is the gate. Issue #61 forbids a client flag deciding this.
        if (!classTeacherAccess.isAuthorized) return false
      }
      if (requiresB2CEntitlements && control.requiresCompetitiveExam && !competitive) return false
      if (requiresB2CEntitlements && control.requiresJee && !jee) return false
      return true
    })
  }, [b2cQuery.data, classTeacherAccess.isAuthorized, user])

  return { controls, isPersonalizing: user?.role === 'b2c_student' && b2cQuery.isLoading }
}
