import React, { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { EmptyState, ErrorState, SectionHeading } from '../../components/ui'
import type { ApiFailure } from '../../api/classTeacher'
import type { ClassTeacherIdentity } from '../../hooks/useClassTeacherAccess'
import { colors, radius, spacing, typography } from '../../theme'

/**
 * The class context banner. Issue #61 requires school, standard, division,
 * semester, and class-teacher identity to be visible on every surface, so this
 * renders above every screen in the workspace and states plainly when a value
 * has not loaded rather than guessing one.
 */
export function ClassContextBar({
  identity,
  standard,
  division,
  semesterName,
  isStale,
}: {
  identity: ClassTeacherIdentity
  standard?: string | null
  division?: string | null
  semesterName?: string | null
  isStale?: boolean
}) {
  const school = identity.schoolName?.trim()
  const branch = identity.branchName?.trim()
  const scope = [school, branch].filter(Boolean).join(' · ')
  const classLabel = standard && division ? `Class ${standard}-${division}` : standard ? `Class ${standard}` : 'Class not set'

  const semester = semesterName?.trim() || 'Semester not selected'
  const teacher = identity.teacherCode ? `${identity.teacherName} (${identity.teacherCode})` : identity.teacherName

  // Issue #61: school, class, semester and class-teacher identity stay visible,
  // as two plain lines rather than a card of chips.
  return (
    <View style={styles.contextBar} accessibilityRole="header" accessibilityLabel={`${classLabel}, ${semester}. ${scope || 'School not linked to this account'}. ${teacher}`}>
      <View style={styles.contextIcon}>
        <Ionicons name="school-outline" size={17} color={colors.iconInk} />
      </View>
      <View style={styles.contextCopy}>
        <Text style={styles.contextClass} numberOfLines={1}>
          {classLabel}
          <Text style={styles.contextSemester}>{`  ·  ${semester}`}</Text>
        </Text>
        <Text style={styles.contextScope} numberOfLines={1}>
          {[scope || 'School not linked to this account', teacher].join(' · ')}
        </Text>
        {isStale ? <Text style={styles.staleText}>Showing the last loaded copy while it refreshes.</Text> : null}
      </View>
    </View>
  )
}

const FAILURE_TITLES: Record<ApiFailure['kind'], string> = {
  offline: 'You are offline',
  timeout: 'Still waiting for the server',
  session_expired: 'Session expired',
  not_authorized: 'Not your class',
  not_found: 'No longer available',
  invalid: 'Change was rejected',
  conflict: 'Someone else edited this',
  server: 'Server could not respond',
  unknown: 'Something went wrong',
}

/** Renders an ApiFailure honestly — the server's reason, never a guess. */
export function FailureCard({
  failure,
  onRetry,
  retryLabel = 'Try again',
}: {
  failure: ApiFailure
  onRetry?: () => void
  retryLabel?: string
}) {
  const canRetry = onRetry && failure.kind !== 'session_expired' && failure.kind !== 'not_authorized'
  const body = failure.kind === 'not_authorized'
    ? 'This class is not assigned to your account, so the server declined the request.'
    : failure.kind === 'not_found'
      ? 'This class or semester no longer exists on the server.'
      : failure.message
  const detail = failure.detail && failure.detail !== failure.message ? ` Server said: ${failure.detail}` : ''

  return (
    <ErrorState
      kind={failure.kind === 'offline' ? 'offline' : 'error'}
      title={FAILURE_TITLES[failure.kind]}
      message={`${body}${detail}`}
      actionLabel={retryLabel}
      onAction={canRetry ? onRetry : undefined}
    />
  )
}

export function SectionHeaderRow({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  return <SectionHeading title={title} subtitle={meta} action={action} />
}

export function SearchField({
  value,
  onChange,
  placeholder,
  accessibilityLabel,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  accessibilityLabel: string
}) {
  return (
    <View style={styles.searchRow}>
      <Ionicons name="search" size={16} color={colors.textSoft} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSoft}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={accessibilityLabel}
      />
      {value ? (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={styles.searchClear}
        >
          <Ionicons name="close-circle" size={17} color={colors.textSoft} />
        </Pressable>
      ) : null}
    </View>
  )
}

export function InlineLoading({ label }: { label: string }) {
  return (
    <View style={styles.inlineLoading}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.inlineLoadingText}>{label}</Text>
    </View>
  )
}

export function EmptyCard({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  return (
    <View style={styles.emptyCard}>
      <EmptyState icon={icon} title={title} body={body} />
    </View>
  )
}

/** A tappable row that reads as one target and meets the 48pt minimum. */
export function NavRow({
  icon,
  title,
  body,
  meta,
  tone = colors.accent,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
  meta?: string
  tone?: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [styles.navRow, pressed && styles.pressed, disabled && styles.navRowDisabled]}
    >
      <View style={[styles.navIcon, { backgroundColor: `${tone}16` }]}>
        <Ionicons name={icon} size={19} color={tone} />
      </View>
      <View style={styles.navCopy}>
        <View style={styles.navTitleRow}>
          <Text style={styles.navTitle} numberOfLines={1}>
            {title}
          </Text>
          {meta ? <Text style={[styles.navMeta, { color: tone }]}>{meta}</Text> : null}
        </View>
        <Text style={styles.navBody}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  contextSemester: { fontFamily: typography.fonts.bodySemibold, color: colors.textSecondary },
  contextBar: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[1] },
  contextIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSurface },
  contextCopy: { flex: 1, minWidth: 0, gap: 1 },
  contextClass: { ...typography.roles.body, fontFamily: typography.fonts.bodyBold, color: colors.nav },
  contextScope: { ...typography.roles.caption, color: colors.textMuted },
  staleText: { ...typography.roles.caption, flex: 1, color: colors.warning },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[4],
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    paddingVertical: spacing[2],
  },
  searchClear: {
    minWidth: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
  },
  inlineLoadingText: {
    ...typography.roles.label,
    color: colors.textMuted,
  },
  emptyCard: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 64, borderRadius: radius.card, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  navRowDisabled: {
    opacity: 0.55,
  },
  navIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  navCopy: {
    flex: 1,
    gap: 2,
  },
  navTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  navTitle: { ...typography.roles.rowTitle, flex: 1, color: colors.nav },
  navMeta: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  navBody: { ...typography.roles.caption, color: colors.textMuted },
  pressed: {
    opacity: 0.78,
  },
})
