import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNetInfo } from '@react-native-community/netinfo'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { File as ExpoFile } from 'expo-file-system'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  announcementsApi,
  type Announcement,
  type AnnouncementAttachmentInput,
  type AnnouncementDraftPayload,
  type AnnouncementState,
  type AnnouncementType,
} from '../../api/announcements'
import { getHttpStatus } from '../../api/queryReliability'
import { AppScreen, SkeletonCard, TextInputField } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import { openProtectedDocument } from '../../utils/openProtectedDocument'
import {
  announcementBodySegments,
  announcementErrorKind,
  announcementHasErrors,
  announcementsForState,
  reconcileAnnouncements,
  validateAnnouncementDraft,
  type AnnouncementDraftErrors,
} from './announcementModel'

const TYPE_OPTIONS: Array<{ id: AnnouncementType; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'announcement', label: 'Announcement', icon: 'megaphone-outline' },
  { id: 'home_work', label: 'Home work', icon: 'book-outline' },
  { id: 'class_work', label: 'Class work', icon: 'create-outline' },
  { id: 'exam_time_table', label: 'Exam timetable', icon: 'calendar-outline' },
]

const STATE_OPTIONS: Array<{ id: AnnouncementState; label: string }> = [
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
  { id: 'archived', label: 'Archived' },
]

const EMPTY_DRAFT: AnnouncementDraftPayload = {
  announcement_type: 'announcement',
  target_scope: 'all_classes',
  class_section_id: null,
  title: '',
  body: '',
  attachments: [],
  publish_state: 'draft',
}

function formatDate(value?: string | null) {
  if (!value) return 'Not published'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function typeLabel(type: AnnouncementType) {
  return TYPE_OPTIONS.find((item) => item.id === type)?.label ?? 'Announcement'
}

function extractDetail(error: unknown, fallback: string) {
  return (error as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback
}

function IconButton({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Ionicons name={icon} size={20} color={colors.nav} />
    </Pressable>
  )
}

function ConnectionNotice({ stale }: { stale?: boolean }) {
  return (
    <View accessibilityRole="alert" style={styles.connectionNotice}>
      <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
      <View style={styles.flexCopy}>
        <Text style={styles.connectionTitle}>{stale ? 'Showing your last synced inbox' : 'You’re offline'}</Text>
        <Text style={styles.connectionBody}>Pull to refresh when your connection returns. Read state on this screen is kept.</Text>
      </View>
    </View>
  )
}

function LoadingAnnouncements() {
  return (
    <View style={styles.loadingStack} accessibilityLabel="Loading announcements">
      <View style={styles.loadingIdentity}>
        <View style={styles.inboxLogo}><Ionicons name="megaphone" size={19} color={colors.white} /></View>
        <View style={styles.flexCopy}>
          <Text style={styles.inboxBrand}>EDURAA</Text>
          <Text style={styles.loadingTitle}>Syncing school announcements</Text>
          <Text style={styles.loadingBody}>Checking the latest updates for this account.</Text>
        </View>
      </View>
      <SkeletonCard lines={2} style={styles.loadingHero} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={3} />
    </View>
  )
}

function EmptyInbox({ teacher, onCompose }: { teacher?: boolean; onCompose?: () => void }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIllustration}>
        <View style={styles.emptyPaperBack} />
        <View style={styles.emptyPaperFront}>
          <Ionicons name={teacher ? 'create-outline' : 'mail-open-outline'} size={28} color={colors.accent} />
        </View>
      </View>
      <Text style={styles.emptyTitle}>{teacher ? 'A clear note can reset the whole day.' : 'You’re all caught up.'}</Text>
      <Text style={styles.emptyBody}>
        {teacher ? 'Draft the next school update here. Nothing reaches students until you publish.' : 'New class announcements will appear here when your teachers publish them.'}
      </Text>
      {teacher && onCompose ? (
        <Pressable onPress={onCompose} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
          <Text style={styles.secondaryActionText}>Start an announcement</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function ErrorPane({ error, onRetry, onBack, detail = false, kind: forcedKind }: { error?: unknown; onRetry: () => void; onBack?: () => void; detail?: boolean; kind?: ReturnType<typeof announcementErrorKind> }) {
  const kind = forcedKind ?? announcementErrorKind(getHttpStatus(error))
  const content = kind === 'permission'
    ? ['This announcement isn’t for this account', 'Your school and class access are checked again whenever an announcement opens.']
    : kind === 'missing'
      ? ['This announcement is no longer available', 'It may have been archived or removed since the inbox last refreshed.']
      : kind === 'session'
        ? ['Your session has expired', 'Sign in again to safely reconnect to your school inbox.']
        : [detail ? 'This announcement could not open' : 'Announcements could not sync', 'Check your connection and try again. Your saved work is still here.']
  return (
    <View style={styles.recoveryPage} accessibilityRole="alert">
      <View style={styles.recoveryHeader}>
        <View style={styles.inboxLogo}><Ionicons name="megaphone" size={19} color={colors.white} /></View>
        <View style={styles.flexCopy}><Text style={styles.inboxBrand}>EDURAA</Text><Text style={styles.inboxContext}>School announcements</Text></View>
        {onBack ? <IconButton label="Back to announcement inbox" icon="arrow-back" onPress={onBack} /> : null}
      </View>
      <View style={styles.errorPane}>
        <View style={styles.errorIcon}><Ionicons name={kind === 'missing' ? 'archive-outline' : 'alert-circle-outline'} size={24} color={colors.danger} /></View>
        <Text style={styles.errorTitle}>{content[0]}</Text>
        <Text style={styles.errorBody}>{content[1]}</Text>
        <View style={styles.recoveryActions}>
          {onBack ? <Pressable onPress={onBack} style={({ pressed }) => [styles.backToInboxButton, pressed && styles.pressed]}><Text style={styles.backToInboxText}>Back to inbox</Text></Pressable> : null}
          {kind !== 'session' && kind !== 'missing' ? (
            <Pressable onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function AnnouncementRow({ item, onPress, teacher }: { item: Announcement; onPress: () => void; teacher?: boolean }) {
  const unread = !teacher && item.is_read === false
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}. ${item.class_label || 'All classes'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.announcementRow, unread && styles.announcementRowUnread, pressed && styles.pressed]}
    >
      <View style={[styles.rowRail, unread && styles.rowRailUnread]} />
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowType, unread && styles.rowTypeUnread]}>{typeLabel(item.announcement_type)}</Text>
          <Text style={styles.rowDate}>{formatDate(item.published_at || item.updated_at)}</Text>
        </View>
        <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]}>{item.title || 'Untitled draft'}</Text>
        <Text style={styles.rowBody} numberOfLines={2}>{item.body || 'This draft has no message yet.'}</Text>
        <View style={styles.rowMeta}>
          <Ionicons name="people-outline" size={14} color={colors.textMuted} />
          <Text style={styles.rowMetaText}>{item.class_label || 'All authorized classes'}</Text>
          {teacher ? <Text style={styles.rowMetaText}>· {item.recipient_count} students</Text> : null}
          {item.attachments.length ? <Ionicons name="attach" size={14} color={colors.textMuted} /> : null}
        </View>
      </View>
      {unread ? <View accessibilityLabel="Unread" style={styles.unreadDot} /> : <Ionicons name="chevron-forward" size={17} color={colors.textSoft} />}
    </Pressable>
  )
}

function BodyWithLinks({ body }: { body: string }) {
  return (
    <Text style={styles.detailBody} selectable>
      {announcementBodySegments(body).map((segment, index) => (
        <Text
          key={`${segment.value}-${index}`}
          style={segment.link ? styles.detailLink : undefined}
          accessibilityRole={segment.link ? 'link' : undefined}
          onPress={segment.link ? () => void Linking.openURL(segment.value) : undefined}
        >
          {segment.value}
        </Text>
      ))}
    </Text>
  )
}

function AnnouncementDetail({ item, onBack, onEdit, onArchive }: { item: Announcement; onBack: () => void; onEdit?: () => void; onArchive?: () => void }) {
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  return (
    <AppScreen contentStyle={styles.detailScreen}>
      <View style={styles.detailHeader}>
        <IconButton label="Back to announcements" icon="arrow-back" onPress={onBack} />
        <View style={styles.detailHeaderCopy}>
          <Text style={styles.detailHeaderLabel}>SCHOOL UPDATE</Text>
          <Text style={styles.detailHeaderMeta}>{item.class_label || 'All authorized classes'}</Text>
        </View>
        {onEdit ? <IconButton label="Edit announcement" icon="create-outline" onPress={onEdit} /> : <View style={styles.iconButtonSpacer} />}
      </View>

      <View style={styles.detailAnchor}>
        <View style={styles.detailTypeLine}>
          <View style={styles.detailTypeIcon}><Ionicons name={TYPE_OPTIONS.find((option) => option.id === item.announcement_type)?.icon || 'megaphone-outline'} size={19} color={colors.accent} /></View>
          <Text style={styles.detailType}>{typeLabel(item.announcement_type)}</Text>
        </View>
        <Text style={styles.detailTitle}>{item.title}</Text>
        <View style={styles.authorLine}>
          <View style={styles.authorMark}><Text style={styles.authorMarkText}>{item.teacher_name.trim().slice(0, 1).toUpperCase() || 'E'}</Text></View>
          <View style={styles.flexCopy}>
            <Text style={styles.authorName}>{item.teacher_name}</Text>
            <Text style={styles.authorDate}>{formatDate(item.published_at || item.updated_at)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.bodySection}>
        <BodyWithLinks body={item.body} />
      </View>

      {item.attachments.length ? (
        <View style={styles.attachmentSection}>
          <Text style={styles.sectionEyebrow}>ATTACHMENTS · {item.attachments.length}</Text>
          {item.attachments.map((attachment) => (
            <Pressable
              key={attachment.id}
              onPress={async () => {
                setAttachmentError(null)
                try {
                  await openProtectedDocument(attachment.url, attachment.file_name)
                } catch (error) {
                  setAttachmentError(error instanceof Error ? error.message : 'This attachment could not open.')
                }
              }}
              style={({ pressed }) => [styles.attachmentRow, pressed && styles.pressed]}
            >
              <View style={styles.attachmentIcon}><Ionicons name={attachment.content_type.includes('pdf') ? 'document-text-outline' : 'image-outline'} size={20} color={colors.accent} /></View>
              <View style={styles.flexCopy}>
                <Text style={styles.attachmentName}>{attachment.file_name}</Text>
                <Text style={styles.attachmentMeta}>{Math.max(1, Math.round(attachment.file_size / 1024))} KB · Tap to open securely</Text>
              </View>
              <Ionicons name="open-outline" size={17} color={colors.textMuted} />
            </Pressable>
          ))}
          {attachmentError ? <Text accessibilityRole="alert" style={styles.inlineError}>{attachmentError}</Text> : null}
        </View>
      ) : null}

      {onArchive ? (
        confirmingArchive ? (
          <View accessibilityRole="alert" style={styles.archiveConfirm}>
            <View style={styles.archiveConfirmTop}>
              <View style={styles.errorIcon}><Ionicons name="archive-outline" size={22} color={colors.danger} /></View>
              <View style={styles.flexCopy}>
                <Text style={styles.archiveConfirmTitle}>Remove this from student inboxes?</Text>
                <Text style={styles.archiveConfirmBody}>The announcement stays in your archive, but students can no longer open it.</Text>
              </View>
            </View>
            <View style={styles.archiveConfirmActions}>
              <Pressable onPress={() => setConfirmingArchive(false)} style={({ pressed }) => [styles.archiveCancel, pressed && styles.pressed]}><Text style={styles.archiveCancelText}>Keep published</Text></Pressable>
              <Pressable onPress={onArchive} style={({ pressed }) => [styles.archiveConfirmAction, pressed && styles.pressed]}><Text style={styles.archiveConfirmActionText}>Archive now</Text></Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setConfirmingArchive(true)} style={({ pressed }) => [styles.archiveAction, pressed && styles.pressed]}>
            <Ionicons name="archive-outline" size={18} color={colors.danger} />
            <Text style={styles.archiveActionText}>Archive announcement</Text>
          </Pressable>
        )
      ) : null}
    </AppScreen>
  )
}

function StudentAnnouncements({ announcementId }: { announcementId?: string }) {
  const navigation = useNavigation<any>()
  const queryClient = useQueryClient()
  const netInfo = useNetInfo()
  const listQuery = useQuery({
    queryKey: ['announcements', 'student'],
    queryFn: announcementsApi.list,
    select: (items) => reconcileAnnouncements([], items),
  })
  const detailQuery = useQuery({
    queryKey: ['announcement', announcementId],
    queryFn: () => announcementsApi.get(announcementId!),
    enabled: Boolean(announcementId),
    retry: false,
  })
  const markRead = useMutation({
    mutationFn: announcementsApi.markRead,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['announcements', 'student'] })
      queryClient.setQueryData<Announcement[]>(['announcements', 'student'], (items = []) => items.map((item) => item.id === id ? { ...item, is_read: true } : item))
    },
    onSuccess: (item) => {
      queryClient.setQueryData<Announcement[]>(['announcements', 'student'], (items = []) => reconcileAnnouncements(items, items.map((current) => current.id === item.id ? item : current)))
      queryClient.setQueryData(['announcement', item.id], item)
    },
  })

  useEffect(() => {
    const item = detailQuery.data
    if (item && item.is_read === false && !markRead.isPending) markRead.mutate(item.id)
  }, [detailQuery.data?.id, detailQuery.data?.is_read])

  if (announcementId) {
    if (detailQuery.isLoading) return <AppScreen><LoadingAnnouncements /></AppScreen>
    if (detailQuery.isError || !detailQuery.data) return <AppScreen><ErrorPane error={detailQuery.error} detail onBack={() => navigation.setParams({ announcementId: undefined })} onRetry={() => void detailQuery.refetch()} /></AppScreen>
    return <AnnouncementDetail item={detailQuery.data} onBack={() => navigation.setParams({ announcementId: undefined })} />
  }

  if (listQuery.isLoading) return <AppScreen><LoadingAnnouncements /></AppScreen>
  if (listQuery.isError && !listQuery.data?.length) return <AppScreen><ErrorPane error={listQuery.error} onRetry={() => void listQuery.refetch()} /></AppScreen>
  const items = listQuery.data ?? []
  const unread = items.filter((item) => item.is_read === false).length
  return (
    <AppScreen
      contentStyle={styles.inboxScreen}
      refreshControl={<RefreshControl refreshing={listQuery.isRefetching} onRefresh={listQuery.refetch} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <View style={styles.inboxHeader}>
        <View style={styles.inboxIdentity}>
          <View style={styles.inboxLogo}><Ionicons name="megaphone" size={19} color={colors.white} /></View>
          <View>
            <Text style={styles.inboxBrand}>EDURAA</Text>
            <Text style={styles.inboxContext}>School announcements</Text>
          </View>
        </View>
        <View style={styles.unreadCounter}><Text style={styles.unreadCounterValue}>{unread}</Text><Text style={styles.unreadCounterLabel}>unread</Text></View>
      </View>
      <View style={styles.inboxIntro}>
        <Text style={styles.sectionEyebrow}>YOUR SCHOOL, CLEARLY</Text>
        <Text style={styles.inboxTitle}>School updates, clearly.</Text>
        <Text style={styles.inboxSubtitle}>Only announcements for your current school and class appear here.</Text>
      </View>
      {netInfo.isConnected === false || (listQuery.isError && items.length) ? <ConnectionNotice stale={Boolean(items.length)} /> : null}
      {items.length ? (
        <View style={styles.inboxList}>
          {items.map((item) => <AnnouncementRow key={item.id} item={item} onPress={() => navigation.navigate('Announcements', { announcementId: item.id })} />)}
        </View>
      ) : <EmptyInbox />}
    </AppScreen>
  )
}

function TeacherComposer({
  item,
  onClose,
}: {
  item?: Announcement
  onClose: () => void
}) {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const storageKey = `eduraa:announcement-draft:${user?.id || 'unknown'}`
  const classesQuery = useQuery({ queryKey: ['announcements', 'teacher', 'classes'], queryFn: announcementsApi.classes })
  const [draft, setDraft] = useState<AnnouncementDraftPayload>(() => item ? {
    announcement_type: item.announcement_type,
    target_scope: item.target_scope,
    class_section_id: item.class_section_id,
    title: item.title,
    body: item.body,
    attachments: [],
    publish_state: item.publish_state === 'published' ? 'published' : 'draft',
  } : EMPTY_DRAFT)
  const [remoteId, setRemoteId] = useState<string | null>(item?.id ?? null)
  const [errors, setErrors] = useState<AnnouncementDraftErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [replaceAttachments, setReplaceAttachments] = useState(false)
  const [hydrated, setHydrated] = useState(Boolean(item))
  const publishLock = useRef(false)

  useEffect(() => {
    if (item || hydrated) return
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!raw) return
        const saved = JSON.parse(raw) as Partial<AnnouncementDraftPayload> & { remoteId?: string }
        setDraft({ ...EMPTY_DRAFT, ...saved, attachments: [] })
        setRemoteId(saved.remoteId || null)
        setNotice('Your unfinished words were restored on this device.')
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true))
  }, [hydrated, item, storageKey])

  useEffect(() => {
    if (!hydrated || item?.publish_state === 'published') return
    const timeout = setTimeout(() => {
      const { attachments: _attachments, ...safeDraft } = draft
      void AsyncStorage.setItem(storageKey, JSON.stringify({ ...safeDraft, remoteId })).catch(() => undefined)
    }, 250)
    return () => clearTimeout(timeout)
  }, [draft, hydrated, item?.publish_state, remoteId, storageKey])

  const saveMutation = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      const payload = { ...draft, publish_state: item?.publish_state === 'published' ? 'published' as const : 'draft' as const }
      let saved: Announcement
      if (remoteId) {
        saved = await announcementsApi.update(remoteId, {
          ...payload,
          attachments: replaceAttachments || !item ? draft.attachments : undefined,
        })
      } else {
        saved = await announcementsApi.create(payload)
        setRemoteId(saved.id)
      }
      if (publish && saved.publish_state === 'draft') saved = await announcementsApi.publish(saved.id)
      return saved
    },
    onSuccess: async (saved, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['announcements', 'teacher'] })
      if (variables.publish || saved.publish_state === 'published') {
        await AsyncStorage.removeItem(storageKey).catch(() => undefined)
        onClose()
      } else {
        setNotice('Draft saved. Only you can see it.')
      }
    },
    onError: (error) => setNotice(extractDetail(error, 'Could not save this draft. Your words remain on this device.')),
    onSettled: () => { publishLock.current = false },
  })

  const update = <K extends keyof AnnouncementDraftPayload>(key: K, value: AnnouncementDraftPayload[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key === 'class_section_id' || key === 'target_scope' ? 'audience' : key]: undefined }))
    setNotice(null)
  }

  const submit = (publish: boolean) => {
    if (publishLock.current || saveMutation.isPending) return
    const nextErrors = publish ? validateAnnouncementDraft(draft, classesQuery.data ?? []) : {}
    if (publish && announcementHasErrors(nextErrors)) {
      setErrors(nextErrors)
      setNotice('A few details need your attention before students can see this.')
      return
    }
    publishLock.current = true
    saveMutation.mutate({ publish })
  }

  const pickAttachments = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
      multiple: true,
      copyToCacheDirectory: true,
    })
    if (result.canceled || !result.assets?.length) return
    if (draft.attachments.length + result.assets.length > 5) {
      setErrors((current) => ({ ...current, attachments: 'Attach no more than five files.' }))
      return
    }
    const oversized = result.assets.find((asset) => (asset.size ?? 0) > 10 * 1024 * 1024)
    if (oversized) {
      setErrors((current) => ({ ...current, attachments: `${oversized.name} is larger than 10 MB.` }))
      return
    }
    try {
      const attachments: AnnouncementAttachmentInput[] = await Promise.all(result.assets.map(async (asset) => ({
        file_name: asset.name || 'attachment',
        content_type: asset.mimeType || 'application/pdf',
        data_base64: await new ExpoFile(asset.uri).base64(),
      })))
      setReplaceAttachments(true)
      update('attachments', [...draft.attachments, ...attachments])
      setErrors((current) => ({ ...current, attachments: undefined }))
    } catch {
      setErrors((current) => ({ ...current, attachments: 'This file could not be prepared. Choose it again.' }))
    }
  }

  const isPrincipal = user?.role === 'principal'
  const audienceTitle = isPrincipal ? 'All school classes' : 'All my classes'
  const audienceBody = isPrincipal ? 'Every active student in your branch.' : 'Every active student across your authorized class-teacher sections.'

  const audienceLabel = draft.target_scope === 'all_classes'
    ? isPrincipal ? 'All school classes' : `All ${classesQuery.data?.length || ''} authorized classes`.replace('All  authorized', 'All authorized')
    : classesQuery.data?.find((entry) => entry.id === draft.class_section_id)
      ? `Std ${classesQuery.data?.find((entry) => entry.id === draft.class_section_id)?.standard} · Division ${classesQuery.data?.find((entry) => entry.id === draft.class_section_id)?.division}`
      : 'Class not selected'
  const isPublishedEdit = item?.publish_state === 'published'

  return (
    <AppScreen
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      contentStyle={styles.composeScreen}
    >
      <View style={styles.composeHeader}>
        <IconButton label="Close composer" icon="close" onPress={onClose} />
        <View style={styles.composeHeaderCopy}>
          <Text style={styles.sectionEyebrow}>{isPublishedEdit ? 'EDIT PUBLISHED UPDATE' : (isPrincipal ? 'PRINCIPAL PUBLICATION DESK' : 'TEACHER PUBLICATION DESK')}</Text>
          <Text style={styles.composeHeaderTitle}>{isPublishedEdit ? 'Keep the message precise.' : 'Say it once. Make it clear.'}</Text>
        </View>
      </View>

      {notice ? <View accessibilityRole="alert" style={[styles.draftNotice, errors && styles.draftNotice]}><Ionicons name={saveMutation.isError ? 'cloud-offline-outline' : 'shield-checkmark-outline'} size={17} color={saveMutation.isError ? colors.warning : colors.success} /><Text style={styles.draftNoticeText}>{notice}</Text></View> : null}

      <View style={styles.formSection}>
        <Text style={styles.formStep}>01 · PURPOSE</Text>
        <View style={styles.typeGrid}>
          {TYPE_OPTIONS.map((option) => {
            const selected = draft.announcement_type === option.id
            return <Pressable key={option.id} disabled={isPublishedEdit} onPress={() => update('announcement_type', option.id)} style={({ pressed }) => [styles.typeOption, selected && styles.typeOptionSelected, pressed && styles.pressed]}><Ionicons name={option.icon} size={18} color={selected ? colors.accent : colors.textMuted} /><Text style={[styles.typeOptionText, selected && styles.typeOptionTextSelected]}>{option.label}</Text></Pressable>
          })}
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formStep}>02 · AUDIENCE</Text>
        {classesQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        <Pressable disabled={isPublishedEdit} onPress={() => { update('target_scope', 'all_classes'); update('class_section_id', null) }} style={({ pressed }) => [styles.audienceOption, draft.target_scope === 'all_classes' && styles.audienceOptionSelected, pressed && styles.pressed]}>
          <View style={styles.audienceIcon}><Ionicons name="school-outline" size={19} color={colors.accent} /></View>
          <View style={styles.flexCopy}><Text style={styles.audienceTitle}>{audienceTitle}</Text><Text style={styles.audienceBody}>{audienceBody}</Text></View>
          <Ionicons name={draft.target_scope === 'all_classes' ? 'radio-button-on' : 'radio-button-off'} size={21} color={draft.target_scope === 'all_classes' ? colors.accent : colors.textSoft} />
        </Pressable>
        <View style={styles.classChips}>
          {(classesQuery.data ?? []).map((entry) => {
            const selected = draft.target_scope === 'class' && draft.class_section_id === entry.id
            return <Pressable key={entry.id} disabled={isPublishedEdit} onPress={() => { update('target_scope', 'class'); update('class_section_id', entry.id) }} style={({ pressed }) => [styles.classChip, selected && styles.classChipSelected, pressed && styles.pressed]}><Text style={[styles.classChipTitle, selected && styles.classChipTitleSelected]}>Std {entry.standard} · {entry.division}</Text><Text style={styles.classChipCount}>{entry.student_count} students</Text></Pressable>
          })}
        </View>
        {errors.audience ? <Text accessibilityRole="alert" style={styles.inlineError}>{errors.audience}</Text> : null}
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formStep}>03 · MESSAGE</Text>
        <TextInputField label="Title" value={draft.title} onChangeText={(value) => update('title', value)} placeholder="What should students notice first?" maxLength={255} error={errors.title} />
        <TextInputField label="Complete message" value={draft.body} onChangeText={(value) => update('body', value)} placeholder="Write the complete update. Links beginning with https:// will be tappable." multiline textAlignVertical="top" maxLength={5000} style={styles.bodyInput} error={errors.body} />
        <Text style={styles.characterCount}>{draft.body.length} / 5,000</Text>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formStep}>04 · ATTACHMENTS</Text>
        {item?.attachments.length && !replaceAttachments ? <Text style={styles.existingFiles}>{item.attachments.length} existing file{item.attachments.length === 1 ? '' : 's'} will stay attached.</Text> : null}
        {draft.attachments.map((attachment, index) => <View key={`${attachment.file_name}-${index}`} style={styles.stagedFile}><Ionicons name="attach" size={17} color={colors.accent} /><Text style={styles.stagedFileName}>{attachment.file_name}</Text><Pressable accessibilityLabel={`Remove ${attachment.file_name}`} onPress={() => update('attachments', draft.attachments.filter((_, fileIndex) => fileIndex !== index))}><Ionicons name="close-circle" size={20} color={colors.textMuted} /></Pressable></View>)}
        <Pressable onPress={() => void pickAttachments()} style={({ pressed }) => [styles.addFileAction, pressed && styles.pressed]}><Ionicons name="add" size={19} color={colors.accent} /><Text style={styles.addFileText}>{item?.attachments.length && !replaceAttachments ? 'Replace attached files' : 'Add files'}</Text><Text style={styles.addFileMeta}>PDF, image, Word, Excel · 10 MB each</Text></Pressable>
        {errors.attachments ? <Text accessibilityRole="alert" style={styles.inlineError}>{errors.attachments}</Text> : null}
      </View>

      <View style={styles.publishReview}>
        <View style={styles.publishReviewTop}><View><Text style={styles.publishReviewEyebrow}>FINAL CHECK</Text><Text style={styles.publishReviewTitle}>{isPublishedEdit ? 'Changes stay with the same audience' : 'Students see this after publish'}</Text></View><Ionicons name="shield-checkmark" size={24} color={colors.accent} /></View>
        <View style={styles.reviewLine}><Text style={styles.reviewLabel}>Audience</Text><Text style={styles.reviewValue}>{audienceLabel}</Text></View>
        <View style={styles.reviewLine}><Text style={styles.reviewLabel}>State</Text><Text style={styles.reviewValue}>{isPublishedEdit ? 'Published · updating' : 'Draft · ready to publish'}</Text></View>
        <View style={styles.reviewLine}><Text style={styles.reviewLabel}>Author</Text><Text style={styles.reviewValue}>{user?.display_name || 'Current teacher'}</Text></View>
        <View style={styles.reviewLine}><Text style={styles.reviewLabel}>Timestamp</Text><Text style={styles.reviewValue}>{isPublishedEdit ? 'Updated when saved' : 'Added when published'}</Text></View>
      </View>

      <View style={styles.composeActions}>
        {!isPublishedEdit ? <Pressable disabled={saveMutation.isPending} onPress={() => submit(false)} style={({ pressed }) => [styles.saveDraftAction, pressed && styles.pressed]}><Text style={styles.saveDraftText}>{saveMutation.isPending ? 'Saving…' : 'Save draft'}</Text></Pressable> : null}
        <Pressable disabled={saveMutation.isPending} onPress={() => submit(true)} style={({ pressed }) => [styles.publishAction, saveMutation.isPending && styles.disabled, pressed && styles.pressed]}>{saveMutation.isPending ? <ActivityIndicator color={colors.white} /> : <Ionicons name={isPublishedEdit ? 'checkmark' : 'send'} size={18} color={colors.white} />}<Text style={styles.publishActionText}>{isPublishedEdit ? 'Save changes' : 'Publish now'}</Text></Pressable>
      </View>
    </AppScreen>
  )
}

function TeacherAnnouncements() {
  const netInfo = useNetInfo()
  const queryClient = useQueryClient()
  const [state, setState] = useState<AnnouncementState>('published')
  const [mode, setMode] = useState<'list' | 'compose' | 'detail'>('list')
  const [selected, setSelected] = useState<Announcement | undefined>()
  const listQuery = useQuery({ queryKey: ['announcements', 'teacher'], queryFn: announcementsApi.list })
  const archiveMutation = useMutation({
    mutationFn: announcementsApi.archive,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['announcements', 'teacher'] })
      setMode('list')
      setSelected(undefined)
      setState('archived')
    },
  })
  if (mode === 'compose') return <TeacherComposer item={selected} onClose={() => { setMode('list'); setSelected(undefined) }} />
  if (mode === 'detail' && selected) return <AnnouncementDetail item={selected} onBack={() => setMode('list')} onEdit={selected.publish_state === 'archived' ? undefined : () => setMode('compose')} onArchive={selected.publish_state === 'published' ? () => archiveMutation.mutate(selected.id) : undefined} />
  if (listQuery.isLoading) return <AppScreen><LoadingAnnouncements /></AppScreen>
  if (listQuery.isError && !listQuery.data?.length) return <AppScreen><ErrorPane error={listQuery.error} onRetry={() => void listQuery.refetch()} /></AppScreen>
  const allItems = listQuery.data ?? []
  const items = announcementsForState(allItems, state)
  return (
    <AppScreen contentStyle={styles.teacherScreen} refreshControl={<RefreshControl refreshing={listQuery.isRefetching} onRefresh={listQuery.refetch} tintColor={colors.accent} colors={[colors.accent]} />}>
      <View style={styles.teacherHero}>
        <View style={styles.teacherHeroGlow} />
        <View style={styles.teacherHeroTop}><Text style={styles.teacherHeroEyebrow}>COMMUNICATION DESK</Text><View style={styles.teacherHeroMark}><Ionicons name="megaphone" size={18} color={colors.accent} /></View></View>
        <Text style={styles.teacherHeroTitle}>Announcements</Text>
        <Text style={styles.teacherHeroBody}>Draft privately, verify the audience, then publish.</Text>
        <Pressable onPress={() => { setSelected(undefined); setMode('compose') }} style={({ pressed }) => [styles.heroAction, pressed && styles.pressed]}><Ionicons name="create-outline" size={18} color={colors.nav} /><Text style={styles.heroActionText}>Write announcement</Text></Pressable>
      </View>
      {netInfo.isConnected === false || (listQuery.isError && allItems.length) ? <ConnectionNotice stale={Boolean(allItems.length)} /> : null}
      <View style={styles.stateTabs}>
        {STATE_OPTIONS.map((option) => { const count = announcementsForState(allItems, option.id).length; const selectedState = state === option.id; return <Pressable key={option.id} onPress={() => setState(option.id)} style={[styles.stateTab, selectedState && styles.stateTabSelected]}><Text style={[styles.stateTabText, selectedState && styles.stateTabTextSelected]}>{option.label}</Text><Text style={[styles.stateTabCount, selectedState && styles.stateTabCountSelected]}>{count}</Text></Pressable> })}
      </View>
      {items.length ? <View style={styles.teacherList}>{items.map((item) => <AnnouncementRow teacher key={item.id} item={item} onPress={() => { setSelected(item); setMode(item.publish_state === 'draft' ? 'compose' : 'detail') }} />)}</View> : <EmptyInbox teacher onCompose={() => setMode('compose')} />}
    </AppScreen>
  )
}

export default function AnnouncementsScreen() {
  const route = useRoute<any>()
  const role = useAuthStore((state) => state.user?.role)
  if (role === 'teacher' || role === 'principal') return <TeacherAnnouncements />
  if (role === 'student') return <StudentAnnouncements announcementId={route.params?.announcementId} />
  return <AppScreen><ErrorPane kind="permission" onRetry={() => undefined} /></AppScreen>
}

const styles = StyleSheet.create({
  flexCopy: { flex: 1 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
  iconButton: { width: 46, height: 46, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, ...shadows.xs },
  iconButtonSpacer: { width: 46 },
  connectionNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], borderLeftWidth: 3, borderLeftColor: colors.warning, paddingVertical: spacing[3], paddingHorizontal: spacing[4], backgroundColor: colors.warningSurface },
  connectionTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  connectionBody: { marginTop: 2, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  loadingStack: { gap: spacing[4] },
  loadingIdentity: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.nav },
  loadingTitle: { marginTop: 3, color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 17 },
  loadingBody: { marginTop: 2, color: colors.navMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  loadingHero: { minHeight: 108 },
  emptyState: { alignItems: 'center', paddingVertical: spacing[10], paddingHorizontal: spacing[4] },
  emptyIllustration: { width: 92, height: 84, marginBottom: spacing[5] },
  emptyPaperBack: { position: 'absolute', width: 60, height: 70, top: 0, right: 3, borderRadius: 18, backgroundColor: colors.accentSurfaceStrong, transform: [{ rotate: '8deg' }] },
  emptyPaperFront: { position: 'absolute', width: 64, height: 72, bottom: 0, left: 3, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.borderBrand, ...shadows.sm },
  emptyTitle: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 20, textAlign: 'center' },
  emptyBody: { maxWidth: 310, marginTop: spacing[2], color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 14, textAlign: 'center' },
  secondaryAction: { minHeight: 46, marginTop: spacing[4], paddingHorizontal: spacing[5], borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurfaceStrong },
  secondaryActionText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  recoveryPage: { flex: 1, minHeight: 560 },
  recoveryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  errorPane: { flex: 1, minHeight: 400, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[5] },
  errorIcon: { width: 54, height: 54, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSurface },
  errorTitle: { marginTop: spacing[4], color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 21, textAlign: 'center' },
  errorBody: { maxWidth: 310, marginTop: spacing[2], color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 14, textAlign: 'center' },
  recoveryActions: { marginTop: spacing[5], flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing[3] },
  retryButton: { minHeight: 48, paddingHorizontal: spacing[6], borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nav },
  retryText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  backToInboxButton: { minHeight: 48, paddingHorizontal: spacing[5], borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.backgroundElevated },
  backToInboxText: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  announcementRow: { minHeight: 140, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4], paddingRight: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, backgroundColor: colors.backgroundElevated },
  announcementRowUnread: { backgroundColor: '#fffaf2' },
  rowRail: { width: 3, alignSelf: 'stretch', borderRadius: radius.full, backgroundColor: 'transparent' },
  rowRailUnread: { backgroundColor: colors.accent },
  rowMain: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[2] },
  rowType: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' },
  rowTypeUnread: { color: colors.accentStrong },
  rowDate: { color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 10 },
  rowTitle: { marginTop: spacing[2], color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 16 },
  rowTitleUnread: { color: colors.nav, fontFamily: typography.fonts.headingSemibold },
  rowBody: { marginTop: 4, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 13 },
  rowMeta: { marginTop: spacing[3], flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  rowMetaText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11 },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  detailScreen: { gap: 0, paddingBottom: spacing[12] },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[7] },
  detailHeaderCopy: { flex: 1 },
  detailHeaderLabel: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 10, letterSpacing: 1.1 },
  detailHeaderMeta: { marginTop: 2, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  detailAnchor: { marginHorizontal: -spacing[5], paddingHorizontal: spacing[5], paddingTop: spacing[7], paddingBottom: spacing[8], backgroundColor: colors.nav },
  detailTypeLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  detailTypeIcon: { width: 36, height: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(249,115,22,0.14)' },
  detailType: { color: colors.accentLight, fontFamily: typography.fonts.bodyBold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  detailTitle: { marginTop: spacing[5], color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 29, letterSpacing: -0.5 },
  authorLine: { marginTop: spacing[6], flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  authorMark: { width: 38, height: 38, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  authorMarkText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 15 },
  authorName: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  authorDate: { marginTop: 2, color: colors.navMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11 },
  bodySection: { paddingVertical: spacing[7], borderBottomWidth: 1, borderBottomColor: colors.border },
  detailBody: { color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 17 },
  detailLink: { color: colors.info, textDecorationLine: 'underline' },
  attachmentSection: { paddingVertical: spacing[6], gap: spacing[3] },
  sectionEyebrow: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 10, letterSpacing: 1.2 },
  attachmentRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  attachmentIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface },
  attachmentName: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  attachmentMeta: { marginTop: 2, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11 },
  inlineError: { color: colors.danger, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  archiveAction: { minHeight: 52, marginTop: spacing[6], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderRadius: radius.full, backgroundColor: colors.dangerSurface },
  archiveActionText: { color: colors.danger, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  archiveConfirm: { marginTop: spacing[6], gap: spacing[4], padding: spacing[4], borderRadius: radius.xl, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.dangerSurface },
  archiveConfirmTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  archiveConfirmTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 14 },
  archiveConfirmBody: { marginTop: 3, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  archiveConfirmActions: { flexDirection: 'row', gap: spacing[2] },
  archiveCancel: { minHeight: 46, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.backgroundElevated },
  archiveCancelText: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  archiveConfirmAction: { minHeight: 46, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.danger },
  archiveConfirmActionText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  inboxScreen: { paddingBottom: spacing[16] },
  inboxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inboxIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  inboxLogo: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nav },
  inboxBrand: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 11, letterSpacing: 2.1 },
  inboxContext: { marginTop: 2, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11 },
  unreadCounter: { minWidth: 56, alignItems: 'flex-end' },
  unreadCounterValue: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 23 },
  unreadCounterLabel: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10 },
  inboxIntro: { gap: spacing[2], paddingTop: spacing[2], paddingBottom: spacing[2] },
  inboxTitle: { maxWidth: 350, color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 27, letterSpacing: -0.5 },
  inboxSubtitle: { maxWidth: 340, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 14 },
  inboxList: { overflow: 'hidden', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.backgroundElevated },
  composeScreen: { paddingBottom: spacing[12], gap: spacing[6] },
  composeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  composeHeaderCopy: { flex: 1 },
  composeHeaderTitle: { marginTop: 3, color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 20 },
  draftNotice: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.successSurface },
  draftNoticeText: { flex: 1, color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  formSection: { gap: spacing[3] },
  formStep: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 10, letterSpacing: 1.15 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  typeOption: { minHeight: 48, width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[3], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  typeOptionSelected: { borderColor: colors.borderBrand, backgroundColor: colors.accentSurface },
  typeOptionText: { flex: 1, color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  typeOptionTextSelected: { color: colors.accentStrong },
  audienceOption: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  audienceOptionSelected: { borderColor: colors.borderBrand, backgroundColor: colors.accentSurface },
  audienceIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundElevated },
  audienceTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  audienceBody: { marginTop: 2, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11 },
  classChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  classChip: { minWidth: 118, minHeight: 58, paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  classChipSelected: { borderColor: colors.nav, backgroundColor: colors.nav },
  classChipTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  classChipTitleSelected: { color: colors.white },
  classChipCount: { marginTop: 3, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10 },
  bodyInput: { minHeight: 144, paddingTop: spacing[3] },
  characterCount: { marginTop: -spacing[2], textAlign: 'right', color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 10 },
  existingFiles: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  stagedFile: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[3], borderRadius: radius.lg, backgroundColor: colors.accentSurface },
  stagedFileName: { flex: 1, color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  addFileAction: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[3], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderBrand },
  addFileText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  addFileMeta: { flex: 1, textAlign: 'right', color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 9 },
  publishReview: { gap: spacing[3], padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.nav },
  publishReviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: spacing[2] },
  publishReviewEyebrow: { color: colors.accentLight, fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 1.1 },
  publishReviewTitle: { marginTop: 3, color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 16 },
  reviewLine: { flexDirection: 'row', gap: spacing[3], paddingTop: spacing[2], borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  reviewLabel: { width: 70, color: colors.navMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11 },
  reviewValue: { flex: 1, color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 11, textAlign: 'right' },
  composeActions: { flexDirection: 'row', gap: spacing[3] },
  saveDraftAction: { minHeight: 54, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderStrong },
  saveDraftText: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  publishAction: { minHeight: 54, flex: 1.35, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderRadius: radius.full, backgroundColor: colors.accent },
  publishActionText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  teacherScreen: { paddingBottom: spacing[16] },
  teacherHero: { minHeight: 184, overflow: 'hidden', padding: spacing[4], borderRadius: 24, backgroundColor: colors.nav },
  teacherHeroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -110, top: -90, backgroundColor: 'rgba(249,115,22,0.13)' },
  teacherHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teacherHeroEyebrow: { color: colors.accentLight, fontFamily: typography.fonts.bodyBold, fontSize: 10, letterSpacing: 1.15 },
  teacherHeroMark: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(249,115,22,0.14)' },
  teacherHeroTitle: { maxWidth: 310, marginTop: spacing[3], color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 25, letterSpacing: -0.5 },
  teacherHeroBody: { maxWidth: 310, marginTop: spacing[2], color: colors.navMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 13 },
  heroAction: { minHeight: 46, alignSelf: 'flex-start', marginTop: spacing[3], flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4], borderRadius: radius.full, backgroundColor: colors.white },
  heroActionText: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  stateTabs: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.borderStrong },
  stateTab: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  stateTabSelected: { borderBottomColor: colors.accent },
  stateTabText: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  stateTabTextSelected: { color: colors.nav },
  stateTabCount: { color: colors.textSoft, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  stateTabCountSelected: { color: colors.accentStrong },
  teacherList: { overflow: 'hidden', borderBottomWidth: 1, borderColor: colors.borderStrong },
})
