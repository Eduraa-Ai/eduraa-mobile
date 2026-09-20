import type { Announcement, AnnouncementDraftPayload, TeacherAnnouncementClass } from '../../api/announcements'

const CLASS_ONLY_ANNOUNCEMENT_TYPES = new Set<Announcement['announcement_type']>([
  'home_work',
  'class_work',
  'exam_time_table',
])

export interface AnnouncementDraftErrors {
  audience?: string
  title?: string
  body?: string
  attachments?: string
}

export function validateAnnouncementDraft(
  draft: AnnouncementDraftPayload,
  classes: readonly TeacherAnnouncementClass[],
): AnnouncementDraftErrors {
  const errors: AnnouncementDraftErrors = {}
  if (announcementRequiresClass(draft.announcement_type) && draft.target_scope !== 'class') {
    errors.audience = 'Choose one class for home work, class work, or an exam timetable.'
  } else if (draft.target_scope === 'class') {
    if (!draft.class_section_id) errors.audience = 'Choose the class that should receive this.'
    else if (!classes.some((item) => item.id === draft.class_section_id)) errors.audience = 'Choose a class you currently teach.'
  } else if (!classes.length) {
    errors.audience = 'No authorized class audience is available.'
  }
  if (draft.announcement_type !== 'exam_time_table') {
    if (!draft.title.trim()) errors.title = 'Add a clear title students can scan quickly.'
    else if (draft.title.trim().length > 255) errors.title = 'Keep the title within 255 characters.'
    if (!draft.body.trim()) errors.body = 'Add the complete message students need.'
    else if (draft.body.trim().length > 5000) errors.body = 'Keep the message within 5,000 characters.'
  }
  if (draft.attachments.length > 5) errors.attachments = 'Attach no more than five files.'
  if (draft.announcement_type === 'exam_time_table' && !draft.attachments.length) {
    errors.attachments = 'Add an image or PDF timetable before publishing.'
  } else if (
    draft.announcement_type === 'exam_time_table' &&
    draft.attachments.some((item) => !item.content_type.startsWith('image/') && item.content_type !== 'application/pdf')
  ) {
    errors.attachments = 'Exam timetables can include images or PDFs only.'
  }
  return errors
}

export function announcementRequiresClass(type: Announcement['announcement_type']) {
  return CLASS_ONLY_ANNOUNCEMENT_TYPES.has(type)
}

export function announcementHasErrors(errors: AnnouncementDraftErrors) {
  return Object.values(errors).some(Boolean)
}

export function announcementTimestamp(item: Announcement) {
  return item.published_at || item.updated_at || item.created_at
}

export function reconcileAnnouncements(
  current: readonly Announcement[],
  incoming: readonly Announcement[],
) {
  const previous = new Map(current.map((item) => [item.id, item]))
  const deduped = new Map<string, Announcement>()
  for (const item of incoming) {
    const cached = previous.get(item.id)
    deduped.set(item.id, {
      ...item,
      is_read: item.is_read === true || cached?.is_read === true,
    })
  }
  return [...deduped.values()].sort(
    (left, right) => new Date(announcementTimestamp(right)).getTime() - new Date(announcementTimestamp(left)).getTime(),
  )
}

export function announcementsForState(items: readonly Announcement[], state: Announcement['publish_state']) {
  return items.filter((item) => item.publish_state === state)
}

export interface AnnouncementBodySegment {
  value: string
  link: boolean
}

export function announcementBodySegments(body: string): AnnouncementBodySegment[] {
  const matches = body.split(/(https?:\/\/[^\s]+)/gi).filter(Boolean)
  return matches.map((value) => ({ value, link: /^https?:\/\//i.test(value) }))
}

export function announcementErrorKind(status?: number) {
  if (status === 401) return 'session' as const
  if (status === 403) return 'permission' as const
  if (status === 404) return 'missing' as const
  return 'network' as const
}

type AnnouncementNavigationLike = {
  canGoBack?: () => boolean
  goBack?: () => void
  navigate?: (routeName: string) => void
  replace?: (routeName: string) => void
  reset?: (state: { index: number; routes: Array<{ name: string }> }) => void
  setParams?: (params: { announcementId?: undefined }) => void
}

export function clearAnnouncementDetail(navigation: AnnouncementNavigationLike) {
  if (navigation.replace) navigation.replace('Announcements')
  else navigation.setParams?.({ announcementId: undefined })
}

export function returnFromAnnouncements(navigation: AnnouncementNavigationLike, isTeacher: boolean) {
  if (navigation.canGoBack?.() && navigation.goBack) {
    navigation.goBack()
    return 'back' as const
  }
  const destination = isTeacher ? 'StaffWorkspace' : 'HomeMain'
  if (navigation.reset) navigation.reset({ index: 0, routes: [{ name: destination }] })
  else navigation.navigate?.(destination)
  return destination
}
