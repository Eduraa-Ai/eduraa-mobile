import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNetInfo } from '@react-native-community/netinfo'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppScreen, EmptyState, ErrorState, SkeletonCard } from '../../components/ui'
import {
  doubtErrorCode,
  doubtErrorMessage,
  doubtHttpStatus,
  doubtsApi,
  type DoubtDetail,
  type DoubtStatus,
  type DoubtSummary,
} from '../../api/doubts'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import {
  createClientRequestId,
  doubtDraftStorageKey,
  emptyDoubtDraft,
  filterDoubts,
  selectTeacher,
  validateDoubtDraft,
  type DoubtDraft,
  type DoubtDraftErrors,
} from './doubtWorkspaceModel'

const statusTheme: Record<DoubtStatus, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; surface: string }> = {
  pending: { label: 'Pending', icon: 'time-outline', color: colors.warning, surface: colors.warningSurface },
  answered: { label: 'Answered', icon: 'checkmark-circle-outline', color: colors.info, surface: colors.infoSurface },
  resolved: { label: 'Resolved', icon: 'shield-checkmark-outline', color: colors.success, surface: colors.successSurface },
}

const filterOptions: Array<{ key: DoubtStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'answered', label: 'Answered' },
  { key: 'resolved', label: 'Resolved' },
]

function relativeDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  const diff = Date.now() - date.getTime()
  const minutes = Math.max(0, Math.round(diff / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function ScreenHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to doubts"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={21} color={colors.nav} />
        </Pressable>
      ) : (
        <View style={styles.brandMark}>
          <Ionicons name="chatbubble-ellipses" size={20} color={colors.accent} />
        </View>
      )}
      <View style={styles.headerCopy}>
        <Text style={styles.headerEyebrow}>PRIVATE ACADEMIC DESK</Text>
        <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
      </View>
    </View>
  )
}

function StatusPill({ status }: { status: DoubtStatus }) {
  const theme = statusTheme[status]
  return (
    <View style={[styles.statusPill, { backgroundColor: theme.surface }]} accessibilityLabel={`Status: ${theme.label}`}>
      <Ionicons name={theme.icon} size={14} color={theme.color} />
      <Text style={[styles.statusPillText, { color: theme.color }]}>{theme.label}</Text>
    </View>
  )
}

function FocusPanel({ items, isTeacher }: { items: DoubtSummary[]; isTeacher: boolean }) {
  const pending = items.filter((item) => item.status === 'pending').length
  const answered = items.filter((item) => item.status === 'answered').length
  return (
    <View style={styles.focusPanel} accessible accessibilityLabel={`${pending} pending and ${answered} answered doubts`}>
      <View style={styles.focusGlow} />
      <View style={styles.focusTop}>
        <View style={styles.focusIcon}>
          <Ionicons name={isTeacher ? 'file-tray-full-outline' : 'lock-closed-outline'} size={20} color="#fdba74" />
        </View>
        <View style={styles.focusCopy}>
          <Text style={styles.focusKicker}>{isTeacher ? 'ASSIGNED QUEUE' : 'PRIVATE BY SCHOOL ROLE'}</Text>
          <Text style={styles.focusPrivacy}>Only the assigned student and teacher can read these threads.</Text>
        </View>
      </View>
      <View style={styles.focusQueueRow}>
        <View style={styles.focusAttention}>
          <View style={styles.focusDot} />
          <Text style={styles.focusAttentionText}>
            <Text style={styles.focusCount}>{pending}</Text> {isTeacher ? 'need your reply' : 'waiting for teacher'}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={15} color="#aab5c6" />
      </View>
    </View>
  )
}

function DoubtRow({ item, isTeacher, onPress }: { item: DoubtSummary; isTeacher: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${statusTheme[item.status].label}. ${item.subject}`}
      style={({ pressed }) => [styles.threadRow, pressed && styles.threadPressed]}
    >
      <View style={styles.threadRail} />
      <View style={styles.threadContent}>
        <View style={styles.threadMetaRow}>
          <Text style={styles.threadSubject}>{item.subject}</Text>
          <StatusPill status={item.status} />
        </View>
        <Text style={styles.threadTitle}>{item.title}</Text>
        <Text style={styles.threadPreview} numberOfLines={2}>{item.last_message || 'Open the thread to read the question.'}</Text>
        <View style={styles.threadFooter}>
          <Text style={styles.threadPerson} numberOfLines={1}>{isTeacher ? `${item.student_name} · ${item.class_label ?? 'Assigned class'}` : item.teacher_name}</Text>
          <Text style={styles.threadDate}>{relativeDate(item.latest_message_at)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
    </Pressable>
  )
}

function InlineNotice({ message, offline = false, onRetry }: { message: string; offline?: boolean; onRetry?: () => void }) {
  return (
    <View style={[styles.notice, offline && styles.offlineNotice]} accessibilityRole="alert">
      <Ionicons name={offline ? 'cloud-offline-outline' : 'information-circle-outline'} size={18} color={offline ? colors.warning : colors.info} />
      <Text style={styles.noticeText}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={onRetry} style={styles.noticeAction}>
          <Text style={styles.noticeActionText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  multiline = false,
  maxLength,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  error?: string
  multiline?: boolean
  maxLength: number
}) {
  return (
    <View style={styles.inputGroup}>
      <View style={styles.inputLabelRow}>
        <Text style={styles.inputLabel}>{label}</Text>
        <Text style={styles.inputCount}>{value.length}/{maxLength}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSoft}
        multiline={multiline}
        maxLength={maxLength}
        textAlignVertical={multiline ? 'top' : 'center'}
        autoCapitalize="sentences"
        returnKeyType={multiline ? 'default' : 'next'}
        accessibilityLabel={label}
        accessibilityHint={error}
        style={[styles.textInput, multiline && styles.textArea, error && styles.inputError]}
      />
      {error ? <Text style={styles.errorText} accessibilityRole="alert">{error}</Text> : null}
    </View>
  )
}

function ComposeView({ onBack, onCreated }: { onBack: () => void; onCreated: (detail: DoubtDetail) => void }) {
  const user = useAuthStore((state) => state.user)
  const netInfo = useNetInfo()
  const queryClient = useQueryClient()
  const storageKey = doubtDraftStorageKey(user?.id ?? 'unknown')
  const [draft, setDraft] = useState<DoubtDraft>(() => emptyDoubtDraft(createClientRequestId()))
  const [errors, setErrors] = useState<DoubtDraftErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const hydrated = useRef(false)
  const accepted = useRef(false)
  const draftRef = useRef(draft)
  const screenRef = useRef<ScrollView>(null)

  const teachersQuery = useQuery({
    queryKey: ['doubt-teachers', user?.id],
    queryFn: doubtsApi.teacherOptions,
    retry: 1,
  })

  useEffect(() => {
    const frame = requestAnimationFrame(() => screenRef.current?.scrollTo({ x: 0, y: 0, animated: false }))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    let active = true
    void AsyncStorage.getItem(storageKey).then((raw) => {
      if (!active) return
      if (raw) {
        try {
          const stored = JSON.parse(raw) as Partial<DoubtDraft>
          if (stored.clientRequestId) setDraft((current) => ({ ...current, ...stored }))
        } catch {
          // A damaged draft is replaced locally; no server data is affected.
        }
      }
      hydrated.current = true
    })
    return () => { active = false }
  }, [storageKey])

  useEffect(() => {
    draftRef.current = draft
    if (!hydrated.current) return
    const timeout = setTimeout(() => {
      void AsyncStorage.setItem(storageKey, JSON.stringify(draft))
    }, 250)
    return () => clearTimeout(timeout)
  }, [draft, storageKey])

  useEffect(() => () => {
    if (hydrated.current && !accepted.current) {
      void AsyncStorage.setItem(storageKey, JSON.stringify(draftRef.current))
    }
  }, [storageKey])

  const createMutation = useMutation({
    mutationFn: doubtsApi.create,
    onSuccess: async (detail) => {
      accepted.current = true
      queryClient.setQueryData(['doubt-detail', user?.id, detail.doubt.id], detail)
      await queryClient.invalidateQueries({ queryKey: ['doubts', user?.id] })
      await AsyncStorage.removeItem(storageKey)
      setDraft(emptyDoubtDraft(createClientRequestId()))
      onCreated(detail)
    },
    onError: (error) => {
      setSubmitError(doubtErrorMessage(error, 'This doubt could not be sent. Your draft is safe—try again.'))
    },
  })

  const submit = () => {
    const nextErrors = validateDoubtDraft(draft)
    setErrors(nextErrors)
    setSubmitError(null)
    if (Object.keys(nextErrors).length) return
    if (netInfo.isConnected === false || netInfo.isInternetReachable === false) {
      setSubmitError('You are offline. Your draft is safe on this device; send it when you reconnect.')
      return
    }
    if (createMutation.isPending) return
    createMutation.mutate({
      teacher_id: draft.teacherId,
      subject_id: draft.subjectId || null,
      subject: draft.subject,
      title: draft.title.trim(),
      description: draft.details.trim(),
      client_request_id: draft.clientRequestId,
    })
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <AppScreen key="doubt-compose" scrollRef={screenRef} tone="auth" ambient={false} protectedChrome keyboardShouldPersistTaps="handled" contentOffset={{ x: 0, y: 0 }} contentStyle={styles.screen}>
      <ScreenHeader title="Ask a focused question" onBack={onBack} />
      <View style={styles.composeIntro}>
        <View style={styles.composeStep}><Text style={styles.composeStepText}>1</Text></View>
        <View style={styles.composeIntroCopy}>
          <Text style={styles.composeTitle}>Give your teacher the context they need.</Text>
          <Text style={styles.composeBody}>Your draft stays on this device until it is accepted. Attachments are intentionally unavailable.</Text>
        </View>
      </View>

      {netInfo.isConnected === false ? <InlineNotice offline message="Offline · your draft will stay here" /> : null}

      <View style={styles.formSection}>
        <Text style={styles.inputLabel}>Subject teacher</Text>
        {teachersQuery.isLoading ? <SkeletonCard lines={2} /> : null}
        {teachersQuery.isError ? (
          <ErrorState
            kind={netInfo.isConnected === false ? 'offline' : 'error'}
            title={doubtHttpStatus(teachersQuery.error) === 403 ? 'Teacher access changed' : 'Teachers could not load'}
            message="Reconnect or refresh. Anything already typed will stay here."
            onAction={() => void teachersQuery.refetch()}
          />
        ) : null}
        {teachersQuery.data?.length ? (
          <View style={styles.teacherList}>
            {teachersQuery.data.map((option) => {
              const selected = option.teacher_id === draft.teacherId && (option.subject_id ?? '') === draft.subjectId
              return (
                <Pressable
                  key={`${option.teacher_id}:${option.subject_id}`}
                  onPress={() => {
                    setDraft((current) => selectTeacher(current, option))
                    setErrors((current) => ({ ...current, teacher: undefined }))
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${option.subject_name}, ${option.teacher_name}`}
                  style={({ pressed }) => [styles.teacherOption, selected && styles.teacherSelected, pressed && styles.pressed]}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                  <View style={styles.teacherCopy}>
                    <Text style={styles.teacherSubject}>{option.subject_name}</Text>
                    <Text style={styles.teacherName}>{option.teacher_name}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        ) : null}
        {!teachersQuery.isLoading && !teachersQuery.isError && !teachersQuery.data?.length ? (
          <EmptyState icon="people-outline" title="No assigned teacher yet" body="Ask your school to map a subject teacher before creating a doubt." />
        ) : null}
        {errors.teacher ? <Text style={styles.errorText} accessibilityRole="alert">{errors.teacher}</Text> : null}
      </View>

      <LabeledInput
        label="Concise title"
        value={draft.title}
        onChangeText={(title) => { setDraft((current) => ({ ...current, title })); setErrors((current) => ({ ...current, title: undefined, guardrail: undefined })) }}
        placeholder="e.g. Why does acceleration change here?"
        error={errors.title}
        maxLength={160}
      />
      <LabeledInput
        label="Question details"
        value={draft.details}
        onChangeText={(details) => { setDraft((current) => ({ ...current, details })); setErrors((current) => ({ ...current, details: undefined, guardrail: undefined })) }}
        placeholder="Share the step, formula, chapter, or assignment where you got stuck."
        error={errors.details}
        multiline
        maxLength={5000}
      />

      {errors.guardrail ? <InlineNotice message={errors.guardrail} /> : null}
      {submitError ? <InlineNotice offline={netInfo.isConnected === false} message={submitError} /> : null}

      <Pressable
        onPress={submit}
        disabled={createMutation.isPending || !teachersQuery.data?.length}
        accessibilityRole="button"
        accessibilityLabel={createMutation.isPending ? 'Sending doubt' : 'Send doubt to teacher'}
        accessibilityState={{ disabled: createMutation.isPending || !teachersQuery.data?.length }}
        style={({ pressed }) => [styles.primaryButton, (createMutation.isPending || !teachersQuery.data?.length) && styles.buttonDisabled, pressed && styles.buttonPressed]}
      >
        {createMutation.isPending ? <ActivityIndicator color={colors.white} /> : <Ionicons name="arrow-up-circle" size={20} color={colors.white} />}
        <Text style={styles.primaryButtonText}>{createMutation.isPending ? 'Sending once…' : 'Send to teacher'}</Text>
      </Pressable>
      <Text style={styles.formFootnote}>Private by design · no group chat · no attachments</Text>
    </AppScreen>
    </KeyboardAvoidingView>
  )
}

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const user = useAuthStore((state) => state.user)
  const isTeacher = user?.role === 'teacher'
  const netInfo = useNetInfo()
  const queryClient = useQueryClient()
  const [reply, setReply] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const screenRef = useRef<ScrollView>(null)

  const detailQuery = useQuery({
    queryKey: ['doubt-detail', user?.id, id],
    queryFn: () => doubtsApi.detail(id),
    refetchOnWindowFocus: 'always',
    staleTime: 30_000,
  })

  useEffect(() => {
    const frame = requestAnimationFrame(() => screenRef.current?.scrollTo({ x: 0, y: 0, animated: false }))
    return () => cancelAnimationFrame(frame)
  }, [id, detailQuery.data?.doubt.status])

  const acceptDetail = (detail: DoubtDetail) => {
    queryClient.setQueryData(['doubt-detail', user?.id, id], detail)
    void queryClient.invalidateQueries({ queryKey: ['doubts', user?.id] })
  }

  const replyMutation = useMutation({
    mutationFn: ({ body, revision }: { body: string; revision: number }) => doubtsApi.reply(id, body, revision),
    onSuccess: (detail) => { acceptDetail(detail); setReply(''); setActionError(null) },
    onError: async (error) => {
      if (doubtErrorCode(error) === 'stale_doubt') await detailQuery.refetch()
      setActionError(doubtErrorMessage(error, 'Your reply is still here. Refresh and try again.'))
    },
  })

  const resolveMutation = useMutation({
    mutationFn: (revision: number) => doubtsApi.resolve(id, revision),
    onSuccess: (detail) => { acceptDetail(detail); setActionError(null) },
    onError: async (error) => {
      if (doubtErrorCode(error) === 'stale_doubt') await detailQuery.refetch()
      setActionError(doubtErrorMessage(error, 'The status changed before this action. Refresh and try again.'))
    },
  })

  if (detailQuery.isLoading) {
    return (
      <AppScreen key="doubt-thread-loading" scrollRef={screenRef} tone="auth" ambient={false} protectedChrome contentOffset={{ x: 0, y: 0 }} contentStyle={styles.screen}>
        <ScreenHeader title="Opening your thread" onBack={onBack} />
        <SkeletonCard lines={2} style={styles.threadHeroSkeleton} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </AppScreen>
    )
  }

  if (!detailQuery.data) {
    const missing = doubtHttpStatus(detailQuery.error) === 404
    const forbidden = doubtHttpStatus(detailQuery.error) === 403
    return (
      <AppScreen key="doubt-thread-error" scrollRef={screenRef} tone="auth" ambient={false} protectedChrome contentOffset={{ x: 0, y: 0 }} contentStyle={styles.screen}>
        <ScreenHeader title="Doubt unavailable" onBack={onBack} />
        <ErrorState
          kind={netInfo.isConnected === false ? 'offline' : 'error'}
          title={missing ? 'This thread is no longer available' : forbidden ? 'Your access changed' : 'The thread could not load'}
          message={missing ? 'It may have been deleted or reassigned. Return to your current list.' : 'Your private list is safe. Reconnect or refresh to try again.'}
          actionLabel={missing ? 'Back to doubts' : 'Retry'}
          onAction={missing ? onBack : () => void detailQuery.refetch()}
        />
      </AppScreen>
    )
  }

  const detail = detailQuery.data
  const doubt = detail.doubt
  const resolved = doubt.status === 'resolved'
  const answeredAt = detail.history.find((item) => item.to_status === 'answered')?.created_at
  const resolvedAt = detail.history.find((item) => item.to_status === 'resolved')?.created_at
  const activity = [
    `Asked ${relativeDate(doubt.created_at)}`,
    answeredAt ? `Answered ${relativeDate(answeredAt)}` : 'Waiting for an answer',
    ...(resolvedAt ? [`Resolved ${relativeDate(resolvedAt)}`] : []),
  ].join('  ·  ')
  const sendReply = () => {
    const body = reply.trim()
    if (body.length < 2) { setActionError('Write a little more before sending.'); return }
    if (netInfo.isConnected === false) { setActionError('You are offline. Your reply is still here.'); return }
    if (replyMutation.isPending) return
    replyMutation.mutate({ body, revision: doubt.revision })
  }

  return (
    <AppScreen
      scrollRef={screenRef}
      tone="auth"
      ambient={false}
      protectedChrome
      contentOffset={{ x: 0, y: 0 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={detailQuery.isRefetching} onRefresh={() => void detailQuery.refetch()} tintColor={colors.accent} />}
      contentStyle={styles.screen}
    >
      <ScreenHeader title={doubt.title} onBack={onBack} />
      {detailQuery.isError && detail ? <InlineNotice message="Showing the last saved thread. Pull to refresh when connected." offline /> : null}

      <View style={styles.threadHero}>
        <View style={styles.threadHeroTop}>
          <StatusPill status={doubt.status} />
          <Text style={styles.threadHeroDate}>Updated {relativeDate(doubt.latest_message_at)}</Text>
        </View>
        <View style={styles.threadHeroIdentity}>
          <Text style={styles.threadHeroSubject}>{doubt.subject}</Text>
          <Text style={styles.threadHeroContext}>{isTeacher ? `${doubt.student_name} · ${doubt.class_label ?? 'Assigned student'}` : `With ${doubt.teacher_name}`}</Text>
        </View>
      </View>

      <View style={styles.conversationHeader}>
        <Text style={styles.conversationTitle}>Conversation</Text>
        <Text style={styles.conversationMeta}>{detail.messages.length} {detail.messages.length === 1 ? 'message' : 'messages'}</Text>
      </View>
      <View style={styles.messageStack}>
        {detail.messages.map((message) => {
          const mine = message.sender_id === user?.id
          return (
            <View key={message.id} style={[styles.message, mine ? styles.messageMine : styles.messageOther]} accessible accessibilityLabel={`${message.sender_name}, ${relativeDate(message.created_at)}: ${message.body}`}>
              <Text style={[styles.messageAuthor, mine && styles.messageAuthorMine]}>{mine ? 'You' : message.sender_name}</Text>
              <Text style={[styles.messageBody, mine && styles.messageBodyMine]} selectable>{message.body}</Text>
              <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>{relativeDate(message.created_at)}</Text>
            </View>
          )
        })}
      </View>

      <View style={styles.historyStrip}>
        <Ionicons name="time-outline" size={18} color={colors.accent} />
        <View style={styles.historyCopy}>
          <Text style={styles.historyTitle}>Activity</Text>
          <Text style={styles.historyBody}>{activity}</Text>
        </View>
      </View>

      {resolved ? (
        <View style={styles.resolvedPanel}>
          <Ionicons name="shield-checkmark" size={24} color={colors.success} />
          <View style={styles.resolvedCopy}>
            <Text style={styles.resolvedTitle}>This doubt is resolved.</Text>
            <Text style={styles.resolvedBody}>The full academic thread remains available. Start a new doubt for a different question.</Text>
          </View>
        </View>
      ) : (
        <View style={styles.replyPanel}>
          <View style={styles.replyLabelRow}>
            <Text style={styles.inputLabel}>{isTeacher ? 'Answer the student' : 'Add useful context'}</Text>
            <Text style={styles.inputCount}>{reply.length}/5000</Text>
          </View>
          <TextInput
            value={reply}
            onChangeText={(value) => { setReply(value); setActionError(null) }}
            multiline
            maxLength={5000}
            textAlignVertical="top"
            placeholder={isTeacher ? 'Explain the next step clearly and academically.' : 'Add the exact step or example you tried.'}
            placeholderTextColor={colors.textSoft}
            accessibilityLabel={isTeacher ? 'Answer the student' : 'Add context to your doubt'}
            style={styles.replyInput}
          />
          {actionError ? <InlineNotice message={actionError} offline={netInfo.isConnected === false} /> : null}
          <View style={styles.replyActions}>
            {isTeacher ? (
              <Pressable
                onPress={() => resolveMutation.mutate(doubt.revision)}
                disabled={resolveMutation.isPending || replyMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Resolve this doubt"
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                {resolveMutation.isPending ? <ActivityIndicator color={colors.success} /> : <Ionicons name="checkmark-done" size={19} color={colors.success} />}
                <Text style={styles.secondaryButtonText}>Resolve</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={sendReply}
              disabled={replyMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={replyMutation.isPending ? 'Sending reply' : 'Send reply'}
              style={({ pressed }) => [styles.replyButton, pressed && styles.buttonPressed]}
            >
              {replyMutation.isPending ? <ActivityIndicator color={colors.white} /> : <Ionicons name="send" size={17} color={colors.white} />}
              <Text style={styles.replyButtonText}>{isTeacher ? 'Send answer' : 'Send context'}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </AppScreen>
  )
}

export default function DoubtsScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const user = useAuthStore((state) => state.user)
  const isTeacher = user?.role === 'teacher'
  const netInfo = useNetInfo()
  const [filter, setFilter] = useState<DoubtStatus | 'all'>('all')
  const [activeId, setActiveId] = useState<string | null>(route.params?.doubtId ?? null)
  const [composing, setComposing] = useState(false)
  const screenRef = useRef<ScrollView>(null)

  const listQuery = useQuery({
    queryKey: ['doubts', user?.id],
    queryFn: doubtsApi.list,
    refetchOnWindowFocus: 'always',
    staleTime: 30_000,
  })

  useEffect(() => {
    const frame = requestAnimationFrame(() => screenRef.current?.scrollTo({ x: 0, y: 0, animated: false }))
    return () => cancelAnimationFrame(frame)
  }, [listQuery.isError && !listQuery.data])

  useEffect(() => {
    if (route.params?.doubtId) setActiveId(route.params.doubtId)
  }, [route.params?.doubtId])

  const filtered = useMemo(() => filterDoubts(listQuery.data ?? [], filter), [filter, listQuery.data])

  if (composing && !isTeacher) {
    return <ComposeView onBack={() => setComposing(false)} onCreated={(detail) => { setComposing(false); setActiveId(detail.doubt.id) }} />
  }
  if (activeId) return <ThreadView id={activeId} onBack={() => { setActiveId(null); navigation.setParams?.({ doubtId: undefined }) }} />

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppScreen
        scrollRef={screenRef}
        key="doubt-list"
        tone="auth"
        ambient={false}
        protectedChrome
        contentOffset={{ x: 0, y: 0 }}
        refreshControl={<RefreshControl refreshing={listQuery.isRefetching} onRefresh={() => void listQuery.refetch()} tintColor={colors.accent} />}
        contentStyle={styles.screen}
      >
        <ScreenHeader title={isTeacher ? 'Student doubts' : 'Ask your teacher'} onBack={() => navigation.canGoBack() && navigation.goBack()} />

        {listQuery.data ? <FocusPanel items={listQuery.data} isTeacher={isTeacher} /> : null}
        {listQuery.isLoading ? (
          <View style={styles.loadingStack}>
            <SkeletonCard lines={2} style={styles.focusSkeleton} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </View>
        ) : null}

        {listQuery.isError && !listQuery.data ? (
          <ErrorState
            kind={netInfo.isConnected === false ? 'offline' : 'error'}
            title={doubtHttpStatus(listQuery.error) === 403 ? 'Doubts are not available for this role' : netInfo.isConnected === false ? 'Your private desk is offline' : 'Doubts could not load'}
            message="Reconnect or retry. Existing server threads are unchanged."
            onAction={() => void listQuery.refetch()}
          />
        ) : null}
        {listQuery.isError && listQuery.data ? <InlineNotice offline message="Showing your last saved list. Pull to refresh when connected." /> : null}

        {listQuery.data ? (
          <>
            <View style={styles.listHeadingRow}>
              <View style={styles.listHeadingCopy}>
                <Text style={styles.listTitle}>{isTeacher ? 'Assigned queue' : 'Your threads'}</Text>
                <Text style={styles.listSubtitle}>{isTeacher ? 'Answer clearly, then resolve when complete.' : 'Every thread stays between you and the assigned teacher.'}</Text>
              </View>
              {!isTeacher ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Create a new doubt" onPress={() => setComposing(true)} style={({ pressed }) => [styles.addButton, pressed && styles.buttonPressed]}>
                  <Ionicons name="add" size={22} color={colors.white} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.filters} accessibilityRole="tablist">
              {filterOptions.map((option) => {
                const selected = filter === option.key
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setFilter(option.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    style={[styles.filter, selected && styles.filterSelected]}
                  >
                    <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{option.label}</Text>
                  </Pressable>
                )
              })}
            </View>
            {filtered.length ? (
              <View style={styles.threadList}>{filtered.map((item) => <DoubtRow key={item.id} item={item} isTeacher={isTeacher} onPress={() => setActiveId(item.id)} />)}</View>
            ) : (
              <View>
                <EmptyState
                  icon={isTeacher ? 'checkmark-done-circle-outline' : 'chatbubble-ellipses-outline'}
                  title={filter === 'all' ? (isTeacher ? 'Your queue is clear' : 'No doubts yet') : `No ${filter} doubts`}
                  body={isTeacher ? 'Assigned student questions will appear here.' : 'Ask one focused academic question whenever you get stuck.'}
                />
                {!isTeacher && filter === 'all' ? (
                  <Pressable onPress={() => setComposing(true)} accessibilityRole="button" style={styles.emptyAction}>
                    <Text style={styles.emptyActionText}>Ask a teacher</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </>
        ) : null}
      </AppScreen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { paddingBottom: spacing[20], gap: spacing[4], backgroundColor: '#fbf6ec' },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  brandMark: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nav },
  iconButton: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e0d6c8', backgroundColor: colors.white },
  headerCopy: { flex: 1 },
  headerEyebrow: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 1.25 },
  headerTitle: { marginTop: 2, color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
  pressed: { opacity: 0.7 },
  focusPanel: { position: 'relative', overflow: 'hidden', minHeight: 116, padding: spacing[4], borderRadius: radius.lg, backgroundColor: '#07152d', ...shadows.md },
  focusGlow: { position: 'absolute', width: 150, height: 150, borderRadius: 75, right: -55, bottom: -80, backgroundColor: 'rgba(243,108,33,0.18)' },
  focusTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  focusIcon: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  focusCopy: { flex: 1 },
  focusKicker: { color: '#fdba74', fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 1.05 },
  focusPrivacy: { marginTop: 3, color: '#b7c1d0', fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  focusQueueRow: { minHeight: 26, marginTop: spacing[2], paddingTop: spacing[2], borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  focusAttention: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  focusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fb923c' },
  focusAttentionText: { color: '#fed7aa', fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  focusCount: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 17 },
  statusPill: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing[2], borderRadius: radius.full },
  statusPillText: { fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  loadingStack: { gap: spacing[4] },
  focusSkeleton: { minHeight: 116 },
  threadHeroSkeleton: { minHeight: 104 },
  notice: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[3], borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.infoSurface },
  offlineNotice: { backgroundColor: colors.warningSurface },
  noticeText: { flex: 1, color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 17 },
  noticeAction: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  noticeActionText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  listHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  listHeadingCopy: { flex: 1, minWidth: 0 },
  listTitle: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 20 },
  listSubtitle: { flexShrink: 1, marginTop: 3, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  addButton: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, ...shadows.sm },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  filters: { flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: '#efe7db' },
  filter: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  filterSelected: { backgroundColor: colors.white, ...shadows.xs },
  filterText: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  filterTextSelected: { color: colors.nav },
  threadList: { overflow: 'hidden', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#d8cdbf' },
  threadRow: { minHeight: 150, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4], borderBottomWidth: 1, borderBottomColor: '#e8dfd3' },
  threadPressed: { backgroundColor: '#fff7ed' },
  threadRail: { width: 4, alignSelf: 'stretch', borderRadius: radius.full, backgroundColor: colors.accent },
  threadContent: { flex: 1, gap: spacing[2] },
  threadMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  threadSubject: { flex: 1, color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' },
  threadTitle: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 16, lineHeight: 21 },
  threadPreview: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  threadFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  threadPerson: { flex: 1, color: colors.textSecondary, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  threadDate: { color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 10 },
  composeIntro: { flexDirection: 'row', gap: spacing[4], paddingVertical: spacing[3], borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#d8cdbf' },
  composeStep: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nav },
  composeStepText: { color: '#fdba74', fontFamily: typography.fonts.heading, fontSize: 18 },
  composeIntroCopy: { flex: 1 },
  composeTitle: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 18, lineHeight: 23 },
  composeBody: { marginTop: spacing[1], color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  formSection: { gap: spacing[3] },
  teacherList: { gap: spacing[2] },
  teacherOption: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], borderRadius: radius.md, borderWidth: 1, borderColor: '#d8cdbf', backgroundColor: colors.white },
  teacherSelected: { borderColor: colors.accent, backgroundColor: colors.accentSurface },
  radio: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.textSoft },
  radioSelected: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  teacherCopy: { flex: 1 },
  teacherSubject: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 14 },
  teacherName: { marginTop: 2, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11 },
  inputGroup: { gap: spacing[2] },
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inputLabel: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  inputCount: { color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 10 },
  textInput: { minHeight: 54, paddingHorizontal: spacing[4], borderWidth: 1, borderColor: '#d8cdbf', borderRadius: radius.md, backgroundColor: colors.white, color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 14 },
  textArea: { minHeight: 150, paddingTop: spacing[4], lineHeight: 21 },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerSurface },
  errorText: { color: colors.danger, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  primaryButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderRadius: radius.md, backgroundColor: colors.nav, ...shadows.sm },
  primaryButtonText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 14 },
  buttonDisabled: { opacity: 0.46 },
  formFootnote: { alignSelf: 'center', color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  emptyAction: { alignSelf: 'center', minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[5], borderRadius: radius.md, backgroundColor: colors.nav },
  emptyActionText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  threadHero: { padding: spacing[4], borderRadius: radius.lg, borderWidth: 1, borderColor: '#e0d6c8', backgroundColor: colors.white, ...shadows.sm },
  threadHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  threadHeroDate: { color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 10 },
  threadHeroIdentity: { marginTop: spacing[3], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  threadHeroSubject: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  threadHeroContext: { flex: 1, color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 11, textAlign: 'right' },
  conversationHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  conversationTitle: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 19 },
  conversationMeta: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  messageStack: { gap: spacing[3] },
  message: { maxWidth: '91%', padding: spacing[4], borderRadius: radius.lg },
  messageMine: { alignSelf: 'flex-end', borderBottomRightRadius: radius.xs, backgroundColor: colors.nav },
  messageOther: { alignSelf: 'flex-start', borderBottomLeftRadius: radius.xs, borderWidth: 1, borderColor: '#e0d6c8', backgroundColor: colors.white },
  messageAuthor: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  messageAuthorMine: { color: '#fdba74' },
  messageBody: { marginTop: spacing[2], color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 14, lineHeight: 21 },
  messageBodyMine: { color: colors.white },
  messageTime: { marginTop: spacing[2], color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 9 },
  messageTimeMine: { color: '#aab5c6' },
  historyStrip: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#d8cdbf' },
  historyCopy: { flex: 1 },
  historyTitle: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  historyBody: { marginTop: 2, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10 },
  resolvedPanel: { flexDirection: 'row', gap: spacing[3], padding: spacing[5], borderRadius: radius.lg, backgroundColor: colors.successSurface },
  resolvedCopy: { flex: 1 },
  resolvedTitle: { color: colors.success, fontFamily: typography.fonts.headingSemibold, fontSize: 16 },
  resolvedBody: { marginTop: spacing[1], color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 17 },
  replyPanel: { gap: spacing[3], padding: spacing[4], borderRadius: radius.xl, borderWidth: 1, borderColor: '#e0d6c8', backgroundColor: colors.white },
  replyLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  replyInput: { minHeight: 130, padding: spacing[4], borderRadius: radius.md, backgroundColor: colors.backgroundTint, color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 14, lineHeight: 21 },
  replyActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[2] },
  secondaryButton: { minWidth: 112, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderRadius: radius.md, borderWidth: 1, borderColor: colors.success, backgroundColor: colors.successSurface },
  secondaryButtonText: { color: colors.success, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  replyButton: { minWidth: 134, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderRadius: radius.md, backgroundColor: colors.nav },
  replyButtonText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
})
