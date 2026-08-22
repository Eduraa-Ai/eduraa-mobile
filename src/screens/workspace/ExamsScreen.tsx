import React, { ReactNode, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, DateField, ErrorState, GradientHeroCard, MultiSelectField, SelectField, SelectableChip, SkeletonCard, TextInputField } from '../../components/ui'
import { examsApi, ExamPayload } from '../../api/exams'
import { cheatSheetsApi, CheatSheetSyllabus, CheatSheetSyllabusList } from '../../api/cheatSheets'
import { checkedPapersApi } from '../../api/checkedPapers'
import { papersApi } from '../../api/papers'
import { SCAN_UPLOAD_OPTIONS_QUERY_KEY } from '../../api/scanUpload'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import type { Exam, PaperListItem, Role, StudentExamRead, StudentExamPaper } from '../../types'
import { presentPdf } from '../../utils/pdfDownload'
import {
  selectNewestDownloadableAttempt,
  selectNewestRetestableAttempt,
} from './examWorkspaceModel'

type ExamTab = 'teacher' | 'practice'
type LearnerPaperTarget = {
  paperId: string
  title: string
  examId?: string
  submitted: boolean
  ownedPractice: boolean
}
type LearnerPaperAction = 'download' | 'retest' | 'delete'
type ActionNotice = {
  tone: 'success' | 'error'
  message: string
}
type ActionConfirmation = {
  action: 'retest' | 'delete'
  target: LearnerPaperTarget
}
type SubjectVisual = {
  icon: keyof typeof Ionicons.glyphMap
  tone: string
}

const adminRoles: Role[] = ['admin', 'developer', 'principal', 'school_super_admin', 'branch_admin']
const defaultSemesterOptions = ['Semester 1', 'Semester 2', 'Annual']
const fallbackSubjectVisual: SubjectVisual = { icon: 'document-text-outline', tone: colors.accent }
const subjectVisuals: Array<SubjectVisual & { keys: string[] }> = [
  { keys: ['physics', 'mechanics', 'electricity', 'magnetism', 'optics'], icon: 'planet-outline', tone: colors.info },
  { keys: ['chemistry', 'chemical', 'organic', 'inorganic'], icon: 'flask-outline', tone: colors.accent },
  { keys: ['math', 'mathematics', 'algebra', 'geometry', 'calculus', 'trigonometry'], icon: 'calculator-outline', tone: colors.warning },
  { keys: ['biology', 'zoology', 'botany', 'anatomy', 'life science'], icon: 'leaf-outline', tone: colors.success },
  { keys: ['computer', 'coding', 'programming', 'technology', 'ict'], icon: 'code-slash-outline', tone: colors.ai.violet },
  { keys: ['english', 'language', 'literature', 'grammar'], icon: 'book-outline', tone: colors.info },
  { keys: ['history', 'civics', 'political'], icon: 'library-outline', tone: colors.warning },
  { keys: ['geography', 'earth', 'environment'], icon: 'earth-outline', tone: colors.success },
  { keys: ['economics', 'commerce', 'business', 'accounts', 'accountancy'], icon: 'cash-outline', tone: colors.accent },
]

function isLearner(role?: Role) {
  return role === 'student' || role === 'b2c_student'
}

function isAdminLike(role?: Role) {
  return role ? adminRoles.includes(role) : false
}

function formatDate(value?: string | null) {
  if (!value) return 'No date'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    // react-native-web's Alert.alert() is a no-op, so fall back to the browser dialog.
    window.alert(message ? `${title}\n\n${message}` : title)
    return
  }
  Alert.alert(title, message)
}

function confirmDestructive(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // react-native-web's Alert.alert() is a no-op, so a button inside it never fires.
    if (window.confirm(`${title}\n\n${message}`)) onConfirm()
    return
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ])
}

function extractDetail(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function compact(parts: Array<string | number | null | undefined>) {
  return parts.filter((part) => part !== null && part !== undefined && String(part).trim()).join(' / ')
}

function resolveSubjectVisual(value: string): SubjectVisual {
  const normalized = value.toLowerCase()
  return subjectVisuals.find((subject) => subject.keys.some((key) => normalized.includes(key))) ?? fallbackSubjectVisual
}

function routeNames(nav: any): string[] {
  return nav?.getState?.().routeNames ?? []
}

function MetricTile({ value, label, tone = colors.text }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={[styles.metricValue, { color: tone }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

function LibraryStat({ value, label, tone = colors.text }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <View style={styles.libraryStat}>
      <Text style={[styles.libraryStatValue, { color: tone }]}>{value}</Text>
      <Text style={styles.libraryStatLabel}>{label}</Text>
    </View>
  )
}

function SectionHeader({ title, subtitle, count }: { title: string; subtitle: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {typeof count === 'number' ? (
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : null}
    </View>
  )
}

function ExamModeButton({ label, icon, selected, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={`${label} exams`}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.examModeButton, selected && styles.examModeButtonActive, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={16} color={selected ? colors.accent : colors.textMuted} />
      <Text style={[styles.examModeText, selected && styles.examModeTextActive]}>{label}</Text>
    </Pressable>
  )
}

function ExamWorkspaceHero({
  activeTab,
  isB2C,
  teacherCount,
  practiceCount,
  teacherCompletedCount,
  practiceCompletedCount,
  onTeacher,
  onPractice,
}: {
  activeTab: ExamTab
  isB2C: boolean
  teacherCount: number
  practiceCount: number
  teacherCompletedCount: number
  practiceCompletedCount: number
  onTeacher: () => void
  onPractice: () => void
}) {
  const focusLabel = activeTab === 'practice' || isB2C ? 'Practice papers' : 'Teacher papers'
  const queueSummary = activeTab === 'practice' || isB2C
    ? practiceCount
      ? `${practiceCount} practice ${practiceCount === 1 ? 'paper' : 'papers'} · ${practiceCompletedCount} submitted`
      : 'Your practice queue is clear'
    : teacherCount
      ? `${teacherCount} assigned ${teacherCount === 1 ? 'exam' : 'exams'} · ${teacherCompletedCount} ${teacherCompletedCount === 1 ? 'paper' : 'papers'} submitted`
      : 'No teacher exams assigned'

  return (
    <View style={styles.examHero}>
      <View style={styles.examQueueRail} />
      <View style={styles.examHeroTop}>
        <View style={styles.examHeroIcon}>
          <Ionicons name="school-outline" size={20} color={colors.accent} />
        </View>
        <View style={styles.examHeroCopy}>
          <Text style={styles.examHeroKicker}>Exam queue · {queueSummary}</Text>
          <Text style={styles.examHeroTitle}>{focusLabel}</Text>
        </View>
      </View>

      {!isB2C ? (
        <View style={styles.examModeSwitch}>
          <ExamModeButton label="Teacher" icon="calendar-clear-outline" selected={activeTab === 'teacher'} onPress={onTeacher} />
          <ExamModeButton label="Practice" icon="flash-outline" selected={activeTab === 'practice'} onPress={onPractice} />
        </View>
      ) : null}
    </View>
  )
}

function openPaperAttempt(navigation: any, paperId: string, examId?: string | null, launchKey?: string) {
  const parent = navigation.getParent?.()
  const params = { screen: 'AttemptPaper', params: { paperId, examId: examId || undefined, launchKey } }

  if (routeNames(navigation).includes('Papers')) {
    navigation.navigate('Papers', params)
    return
  }
  if (routeNames(parent).includes('Papers')) {
    parent.navigate('Papers', params)
    return
  }
  if (routeNames(navigation).includes('StaffPapers')) {
    navigation.navigate('StaffPapers', params)
    return
  }
  if (routeNames(parent).includes('StaffPapers')) {
    parent.navigate('StaffPapers', params)
    return
  }
  navigation.navigate('AttemptPaper', { paperId, examId: examId || undefined, launchKey })
}

function PaperActionButton({
  label,
  icon,
  tone = 'default',
  disabled,
  loading,
  onPress,
  hint,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  tone?: 'default' | 'primary' | 'danger'
  disabled?: boolean
  loading?: boolean
  onPress: () => void
  hint?: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.paperActionButton,
        tone === 'danger' && styles.paperActionButtonDanger,
        disabled && styles.paperActionButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone === 'danger' ? colors.danger : tone === 'primary' ? colors.accent : colors.text} />
      ) : (
        <Ionicons name={icon} size={16} color={tone === 'danger' ? colors.danger : tone === 'primary' ? colors.accent : colors.textMuted} />
      )}
      <Text style={[styles.paperActionText, tone === 'primary' && styles.paperActionTextPrimary, tone === 'danger' && styles.paperActionTextDanger]}>
        {label}
      </Text>
    </Pressable>
  )
}

function LearnerPaperActions({
  target,
  busyAction,
  onOpen,
  onMore,
}: {
  target: LearnerPaperTarget
  busyAction?: LearnerPaperAction
  onOpen: () => void
  onMore: () => void
}) {
  const hasSecondaryActions = target.submitted || target.ownedPractice

  return (
    <View style={styles.paperActions}>
      <PaperActionButton
        label={target.submitted ? 'Open' : 'Start'}
        icon="arrow-forward-outline"
        tone="primary"
        onPress={onOpen}
      />
      {hasSecondaryActions ? (
        <PaperActionButton
          label="More"
          icon="ellipsis-horizontal-outline"
          disabled={Boolean(busyAction)}
          hint="Shows download, retest, and owned-paper controls."
          onPress={onMore}
        />
      ) : null}
    </View>
  )
}

function PaperActionsSheet({
  target,
  busyAction,
  onClose,
  onDownload,
  onRetest,
  onDelete,
}: {
  target: LearnerPaperTarget | null
  busyAction?: LearnerPaperAction
  onClose: () => void
  onDownload: (target: LearnerPaperTarget) => void
  onRetest: (target: LearnerPaperTarget) => void
  onDelete: (target: LearnerPaperTarget) => void
}) {
  if (!target) return null

  const action = (
    label: string,
    body: string,
    icon: keyof typeof Ionicons.glyphMap,
    actionKey: LearnerPaperAction,
    onPress: () => void,
    danger = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: busyAction === actionKey, disabled: Boolean(busyAction) }}
      disabled={Boolean(busyAction)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetAction,
        danger && styles.sheetActionDanger,
        pressed && !busyAction && styles.pressed,
      ]}
    >
      <View style={[styles.sheetActionIcon, danger && styles.sheetActionIconDanger]}>
        {busyAction === actionKey ? (
          <ActivityIndicator size="small" color={danger ? colors.danger : colors.accent} />
        ) : (
          <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.accent} />
        )}
      </View>
      <View style={styles.sheetActionCopy}>
        <Text style={[styles.sheetActionTitle, danger && styles.sheetActionTitleDanger]}>{label}</Text>
        <Text style={styles.sheetActionBody}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={danger ? colors.danger : colors.textSoft} />
    </Pressable>
  )

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.confirmationOverlay}>
        <Pressable
          accessibilityLabel="Close paper actions"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.paperActionsSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={styles.sheetKicker}>Paper actions</Text>
              <Text style={styles.sheetTitle}>{target.title}</Text>
            </View>
            <Pressable
              accessibilityLabel="Close paper actions"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.sheetClose, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.sheetActionList}>
            {target.submitted
              ? action(
                'Download checked PDF',
                'Save the latest released result and teacher feedback.',
                'download-outline',
                'download',
                () => onDownload(target),
              )
              : null}
            {target.submitted
              ? action(
                'Start a fresh retest',
                'Create a blank attempt while keeping every previous result.',
                'refresh-outline',
                'retest',
                () => onRetest(target),
              )
              : null}
            {target.ownedPractice
              ? action(
                'Delete practice paper',
                'Remove this owned paper and its linked attempts.',
                'trash-outline',
                'delete',
                () => onDelete(target),
                true,
              )
              : null}
          </View>
        </View>
      </View>
    </Modal>
  )
}

function ActionConfirmationSheet({
  confirmation,
  onCancel,
  onConfirm,
}: {
  confirmation: ActionConfirmation | null
  onCancel: () => void
  onConfirm: (confirmation: ActionConfirmation) => void
}) {
  if (!confirmation) return null

  const isDelete = confirmation.action === 'delete'
  const title = isDelete ? 'Delete practice paper?' : 'Start a fresh retest?'
  const body = isDelete
    ? `“${confirmation.target.title}” and its linked attempts will be permanently removed. Teacher-assigned exams are never deleted here.`
    : 'This creates a new attempt of the same paper. Your previous result remains saved.'

  return (
    <Modal
      animationType="fade"
      transparent
      visible
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.confirmationOverlay}>
        <Pressable
          accessibilityLabel="Close confirmation"
          accessibilityRole="button"
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.confirmationSheet}>
          <View style={[styles.confirmationIcon, isDelete && styles.confirmationIconDanger]}>
            <Ionicons
              name={isDelete ? 'trash-outline' : 'refresh-outline'}
              size={23}
              color={isDelete ? colors.danger : colors.accent}
            />
          </View>
          <Text style={styles.confirmationTitle}>{title}</Text>
          <Text style={styles.confirmationBody}>{body}</Text>
          <View style={styles.confirmationActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.confirmationButton, pressed && styles.pressed]}
            >
              <Text style={styles.confirmationButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onConfirm(confirmation)}
              style={({ pressed }) => [
                styles.confirmationButton,
                styles.confirmationPrimary,
                isDelete && styles.confirmationPrimaryDanger,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.confirmationPrimaryText}>
                {isDelete ? 'Delete paper' : 'Start retest'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function LearnerExamCard({
  exam,
  onOpenPaper,
  onMore,
  busyFor,
}: {
  exam: StudentExamRead
  onOpenPaper: (paper: StudentExamPaper) => void
  onMore: (target: LearnerPaperTarget) => void
  busyFor: (target: LearnerPaperTarget) => LearnerPaperAction | undefined
}) {
  const completed = exam.papers.filter((paper) => paper.is_submitted_by_me).length
  const progress = exam.papers.length ? Math.round((completed / exam.papers.length) * 100) : 0
  const visual = resolveSubjectVisual(compact([exam.subject_name, exam.name]))
  const examMarks = exam.papers.reduce((sum, paper) => sum + paper.total_marks, 0)

  return (
    <AnimatedCard style={styles.examCard}>
      <View style={styles.examCardTop}>
        <View style={[styles.examSubjectIcon, { backgroundColor: `${visual.tone}14`, borderColor: `${visual.tone}35` }]}>
          <Ionicons name={visual.icon} size={19} color={visual.tone} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.examCardKicker}>{exam.subject_name || 'Assigned exam'}</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>{exam.name}</Text>
          <Text style={styles.cardMeta}>{compact([exam.teacher_name, formatDate(exam.exam_date)])}</Text>
        </View>
        <View style={[styles.examStatusPill, completed === exam.papers.length && exam.papers.length > 0 && styles.examStatusPillDone]}>
          <Text style={[styles.examStatusText, completed === exam.papers.length && exam.papers.length > 0 && styles.examStatusTextDone]}>
            {completed === exam.papers.length && exam.papers.length > 0 ? 'Done' : 'Open'}
          </Text>
        </View>
      </View>

      <View style={styles.examProgressRow}>
        <View style={styles.examProgressCopy}>
          <Text style={styles.examProgressText}>{completed}/{exam.papers.length} papers submitted</Text>
          <Text style={styles.examProgressMeta}>{exam.duration_minutes ? `${exam.duration_minutes} min` : 'No timer'} / {examMarks} marks</Text>
        </View>
        <Text style={styles.examProgressPercent}>{progress}%</Text>
      </View>
      <View style={styles.examProgressTrack}>
        <View style={[styles.examProgressFill, { width: `${Math.max(5, progress)}%`, backgroundColor: visual.tone }]} />
      </View>

      <View style={styles.paperList}>
        {exam.papers.map((paper) => {
          const target: LearnerPaperTarget = {
            paperId: paper.id,
            title: paper.title,
            examId: exam.id,
            submitted: Boolean(paper.is_submitted_by_me),
            ownedPractice: false,
          }
          return (
            <View key={paper.id} style={styles.paperRow}>
              <View style={styles.paperRowHeader}>
                <View style={styles.paperRowCopy}>
                  <Text style={styles.paperRowTitle}>{paper.title}</Text>
                  <Text style={styles.paperRowMeta}>{paper.total_marks} marks / {paper.is_submitted_by_me ? 'Submitted' : 'Not submitted'}</Text>
                </View>
                <View style={[styles.paperStateDot, paper.is_submitted_by_me && styles.paperStateDotDone]} />
              </View>
              <LearnerPaperActions
                target={target}
                busyAction={busyFor(target)}
                onOpen={() => onOpenPaper(paper)}
                onMore={() => onMore(target)}
              />
            </View>
          )
        })}
      </View>
    </AnimatedCard>
  )
}

function PracticePaperCard({
  paper,
  onOpen,
  onMore,
  busyAction,
}: {
  paper: PaperListItem
  onOpen: () => void
  onMore: (target: LearnerPaperTarget) => void
  busyAction?: LearnerPaperAction
}) {
  const subject = paper.subject_name || 'Practice paper'
  const subjectVisual = resolveSubjectVisual(compact([paper.subject_name, paper.title, paper.category]))

  const target: LearnerPaperTarget = {
    paperId: paper.id,
    title: paper.title,
    submitted: Boolean(paper.is_submitted_by_me),
    ownedPractice: true,
  }

  return (
    <View style={styles.practiceCard}>
      <View style={[styles.practiceAccent, { backgroundColor: subjectVisual.tone }]} />
      <View style={styles.practiceTop}>
        <View style={[styles.practiceIcon, { backgroundColor: `${subjectVisual.tone}14`, borderColor: `${subjectVisual.tone}35` }]}>
          <Ionicons name={subjectVisual.icon} size={18} color={subjectVisual.tone} />
        </View>
        <View style={styles.practiceCopy}>
          <Text style={[styles.practiceSubject, { color: subjectVisual.tone }]}>{subject}</Text>
          <Text style={styles.practiceTitle}>{paper.title}</Text>
          <Text style={styles.practiceMeta}>{compact([`${paper.total_marks} marks`, formatDate(paper.created_at)])}</Text>
        </View>
        <View style={[styles.paperStateDot, paper.is_submitted_by_me && styles.paperStateDotDone]} />
      </View>
      <View style={styles.practiceFooter}>
        <View style={[styles.readyPill, paper.is_submitted_by_me && styles.readyPillSubmitted]}>
          <View style={[styles.readyDot, paper.is_submitted_by_me && styles.readyDotSubmitted]} />
          <Text style={[styles.readyText, paper.is_submitted_by_me && styles.readyTextSubmitted]}>
            {paper.is_submitted_by_me ? 'Submitted' : 'Ready'}
          </Text>
        </View>
        <Text style={styles.openText}>{paper.is_submitted_by_me ? 'Attempt saved' : 'Ready to begin'}</Text>
      </View>
      <LearnerPaperActions
        target={target}
        busyAction={busyAction}
        onOpen={onOpen}
        onMore={() => onMore(target)}
      />
    </View>
  )
}

function LearnerExamLoading() {
  return (
    <AppScreen contentStyle={styles.learnerScreen} padded>
      <View accessibilityLabel="Loading exam workspace" style={styles.examSkeletonHero}>
        <View style={styles.examSkeletonTitle} />
        <View style={styles.examSkeletonMeta} />
        <View style={styles.examSkeletonSwitch} />
      </View>
      <View style={styles.section}>
        <View style={styles.examSkeletonSectionTitle} />
        <SkeletonCard lines={2} style={styles.examSkeletonCard} />
        <SkeletonCard lines={2} style={styles.examSkeletonCard} />
      </View>
    </AppScreen>
  )
}

function LearnerEmptyState({
  kind,
  onAction,
}: {
  kind: 'teacher' | 'practice'
  onAction: () => void
}) {
  const isTeacher = kind === 'teacher'
  return (
    <AnimatedCard style={styles.learnerEmptyCard}>
      <View style={styles.learnerEmptyIcon}>
        <Ionicons name={isTeacher ? 'calendar-clear-outline' : 'flash-outline'} size={21} color={colors.accent} />
      </View>
      <View style={styles.learnerEmptyCopy}>
        <Text style={styles.learnerEmptyTitle}>{isTeacher ? 'You are all caught up' : 'Build your first practice paper'}</Text>
        <Text style={styles.learnerEmptyBody}>
          {isTeacher
            ? 'Your teacher’s next assessment will appear here automatically. Personal practice is ready now.'
            : 'Generate a focused paper, then return here to start, download, retest, or remove it.'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        style={({ pressed }) => [styles.learnerEmptyAction, pressed && styles.pressed]}
      >
        <Text style={styles.learnerEmptyActionText}>{isTeacher ? 'Open practice papers' : 'Generate a paper'}</Text>
        <Ionicons name="arrow-forward-outline" size={16} color={colors.white} />
      </Pressable>
    </AnimatedCard>
  )
}

function StudentExamsView({ role }: { role?: Role }) {
  const navigation = useNavigation<any>()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<ExamTab>(role === 'b2c_student' ? 'practice' : 'teacher')
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null)
  const [confirmation, setConfirmation] = useState<ActionConfirmation | null>(null)
  const [actionTarget, setActionTarget] = useState<LearnerPaperTarget | null>(null)
  const isB2C = role === 'b2c_student'

  const teacherExamsQuery = useQuery({
    queryKey: ['exams', 'student'],
    queryFn: examsApi.listStudentExams,
    enabled: role === 'student',
  })

  const practiceQuery = useQuery({
    queryKey: ['exams', 'practice', role],
    queryFn: examsApi.listPracticePapers,
  })

  const teacherExams = teacherExamsQuery.data ?? []
  const practicePapers = practiceQuery.data ?? []
  const completedAssignedCount = teacherExams.reduce((sum, exam) => sum + exam.papers.filter((paper) => paper.is_submitted_by_me).length, 0)
  const completedPracticeCount = practicePapers.filter((paper) => paper.is_submitted_by_me).length
  const isLoading = teacherExamsQuery.isLoading || practiceQuery.isLoading
  const refreshing = teacherExamsQuery.isRefetching || practiceQuery.isRefetching

  const downloadMutation = useMutation({
    mutationFn: async (target: LearnerPaperTarget) => {
      const attempts = await papersApi.listAttempts(target.paperId, { exam_id: target.examId })
      const downloadableAttempt = selectNewestDownloadableAttempt(attempts.items)
      if (!downloadableAttempt) {
        throw new Error('The checked PDF will be available after checking finishes and results are released.')
      }
      const pdf = await checkedPapersApi.downloadPdf(downloadableAttempt.id)
      await presentPdf(pdf)
      return target
    },
    onMutate: () => setActionNotice(null),
    onSuccess: (target) => {
      setActionNotice({ tone: 'success', message: `Downloaded the latest checked result for “${target.title}”.` })
    },
    onError: (error) => {
      setActionNotice({ tone: 'error', message: extractDetail(error, 'Unable to download this checked paper.') })
    },
  })

  const retestMutation = useMutation({
    mutationFn: async (target: LearnerPaperTarget) => {
      const attempts = await papersApi.listAttempts(target.paperId, { exam_id: target.examId })
      if (!selectNewestRetestableAttempt(attempts.items)) {
        throw new Error('Finish and submit the current attempt before starting a retest.')
      }
      const attempt = await papersApi.createAttempt(target.paperId, {
        exam_id: target.examId,
        reason: 'retest',
      })
      return { target, attempt }
    },
    onMutate: () => setActionNotice(null),
    onSuccess: ({ target, attempt }) => {
      queryClient.setQueryData(
        ['paper-attempt', target.paperId, target.examId],
        attempt,
      )
      setActionNotice({ tone: 'success', message: 'Fresh retest started. Your previous result remains saved.' })
      openPaperAttempt(navigation, target.paperId, target.examId, `retest-${attempt.id}`)
    },
    onError: (error) => {
      setActionNotice({ tone: 'error', message: extractDetail(error, 'Could not start this retest. Please try again.') })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (target: LearnerPaperTarget) => {
      await examsApi.deletePracticePaper(target.paperId)
      return target
    },
    onMutate: () => setActionNotice(null),
    onSuccess: async (target) => {
      await queryClient.invalidateQueries({ queryKey: ['exams', 'practice'] })
      setActionNotice({ tone: 'success', message: `Deleted “${target.title}”. Teacher exams were not affected.` })
    },
    onError: (error) => {
      setActionNotice({ tone: 'error', message: extractDetail(error, 'Unable to delete this practice paper.') })
    },
  })

  const busyFor = (target: LearnerPaperTarget): LearnerPaperAction | undefined => {
    if (downloadMutation.isPending && downloadMutation.variables?.paperId === target.paperId) return 'download'
    if (retestMutation.isPending && retestMutation.variables?.paperId === target.paperId) return 'retest'
    if (deleteMutation.isPending && deleteMutation.variables?.paperId === target.paperId) return 'delete'
    return undefined
  }

  const confirmRetest = (target: LearnerPaperTarget) => {
    setConfirmation({ action: 'retest', target })
  }

  const confirmDelete = (target: LearnerPaperTarget) => {
    setConfirmation({ action: 'delete', target })
  }

  const runConfirmedAction = (nextConfirmation: ActionConfirmation) => {
    setConfirmation(null)
    if (nextConfirmation.action === 'delete') {
      deleteMutation.mutate(nextConfirmation.target)
      return
    }
    retestMutation.mutate(nextConfirmation.target)
  }

  if (isLoading) {
    return <LearnerExamLoading />
  }

  if ((isB2C || teacherExamsQuery.isError) && practiceQuery.isError) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState title="Exams unavailable" message="Unable to load exams." onAction={() => {
          void teacherExamsQuery.refetch()
          void practiceQuery.refetch()
        }} />
      </AppScreen>
    )
  }

  return (
    <View style={styles.root}>
      <AppScreen
        contentStyle={styles.learnerScreen}
        padded
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          void teacherExamsQuery.refetch()
          void practiceQuery.refetch()
        }} tintColor={colors.accent} colors={[colors.accent]} />}
      >

      <ExamWorkspaceHero
        activeTab={activeTab}
        isB2C={isB2C}
        teacherCount={teacherExams.length}
        practiceCount={practicePapers.length}
        teacherCompletedCount={completedAssignedCount}
        practiceCompletedCount={completedPracticeCount}
        onTeacher={() => {
          setActionNotice(null)
          setActionTarget(null)
          setActiveTab('teacher')
        }}
        onPractice={() => {
          setActionNotice(null)
          setActionTarget(null)
          setActiveTab('practice')
        }}
      />

      {actionNotice ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.actionNotice, actionNotice.tone === 'error' && styles.actionNoticeError]}
        >
          <Ionicons
            name={actionNotice.tone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
            size={17}
            color={actionNotice.tone === 'error' ? colors.danger : colors.success}
          />
          <Text style={[styles.actionNoticeText, actionNotice.tone === 'error' && styles.actionNoticeTextError]}>
            {actionNotice.message}
          </Text>
        </View>
      ) : null}

      {activeTab === 'teacher' && !isB2C ? (
        <View style={styles.section}>
          <SectionHeader title="Assigned exams" subtitle="Teacher-created exams matched to your class and subjects." count={teacherExams.length} />
          {teacherExamsQuery.isError ? (
            <ErrorState
              title="Teacher exams unavailable"
              message="Practice papers are still available. Retry this section when your connection settles."
              onAction={() => void teacherExamsQuery.refetch()}
            />
          ) : teacherExams.length === 0 ? (
            <LearnerEmptyState
              kind="teacher"
              onAction={() => {
                setActionTarget(null)
                setActiveTab('practice')
              }}
            />
          ) : (
            teacherExams.map((exam) => (
              <LearnerExamCard
                key={exam.id}
                exam={exam}
                onOpenPaper={(paper) => openPaperAttempt(navigation, paper.id, exam.id)}
                onMore={setActionTarget}
                busyFor={busyFor}
              />
            ))
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <SectionHeader title="Practice papers" subtitle="Recent generated papers ready to attempt." count={practicePapers.length} />
          {practiceQuery.isError ? (
            <ErrorState
              title="Practice papers unavailable"
              message={isB2C ? 'Check your connection and retry.' : 'Teacher exams are still available in the other tab.'}
              onAction={() => void practiceQuery.refetch()}
            />
          ) : practicePapers.length === 0 ? (
            <LearnerEmptyState
              kind="practice"
              onAction={() => navigation.getParent?.()?.navigate('Papers', { screen: 'GeneratePaper' })}
            />
          ) : (
            practicePapers.map((paper) => (
              <PracticePaperCard
                key={paper.id}
                paper={paper}
                onOpen={() => openPaperAttempt(navigation, paper.id)}
                onMore={setActionTarget}
                busyAction={busyFor({
                  paperId: paper.id,
                  title: paper.title,
                  submitted: Boolean(paper.is_submitted_by_me),
                  ownedPractice: true,
                })}
              />
            ))
          )}
        </View>
      )}
      </AppScreen>
      <PaperActionsSheet
        target={actionTarget}
        busyAction={actionTarget ? busyFor(actionTarget) : undefined}
        onClose={() => setActionTarget(null)}
        onDownload={(target) => {
          setActionTarget(null)
          downloadMutation.mutate(target)
        }}
        onRetest={(target) => {
          setActionTarget(null)
          confirmRetest(target)
        }}
        onDelete={(target) => {
          setActionTarget(null)
          confirmDelete(target)
        }}
      />
      <ActionConfirmationSheet
        confirmation={confirmation}
        onCancel={() => setConfirmation(null)}
        onConfirm={runConfirmedAction}
      />
    </View>
  )
}

interface ExamFormState {
  name: string
  subjectId: string
  standard: string
  division: string
  semester: string
  examDate: string
  durationMinutes: string
  autoGradeEnabled: boolean
  resultsPublished: boolean
  teacherId: string
  paperIds: string[]
}

const emptyForm: ExamFormState = {
  name: '',
  subjectId: '',
  standard: '',
  division: '',
  semester: '',
  examDate: '',
  durationMinutes: '',
  autoGradeEnabled: true,
  resultsPublished: true,
  teacherId: '',
  paperIds: [],
}

function formFromExam(exam: Exam): ExamFormState {
  return {
    name: exam.name,
    subjectId: exam.subject_id || '',
    standard: exam.standard || '',
    division: exam.division || '',
    semester: exam.semester || '',
    examDate: exam.exam_date || '',
    durationMinutes: exam.duration_minutes ? String(exam.duration_minutes) : '',
    autoGradeEnabled: exam.auto_grade_enabled,
    resultsPublished: exam.results_published,
    teacherId: exam.teacher_id,
    paperIds: exam.paper_ids ?? [],
  }
}

function StaffCardActionButton({
  label,
  icon,
  disabled,
  loading,
  onPress,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  disabled?: boolean
  loading?: boolean
  onPress: () => void
}) {
  const tintColor = colors.accent

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.staffCardActionButton,
        styles.staffCardActionButtonShare,
        disabled && styles.staffCardActionButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tintColor} />
      ) : (
        <Ionicons name={icon} size={16} color={tintColor} />
      )}
      <Text style={[styles.staffCardActionText, { color: tintColor }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function StaffExamCard({
  exam,
  linkedPapers,
  selected,
  syllabus,
  sharingSyllabus,
  onPress,
  onShareSyllabus,
}: {
  exam: Exam
  linkedPapers: PaperListItem[]
  selected: boolean
  syllabus?: CheatSheetSyllabus
  sharingSyllabus?: boolean
  onPress: () => void
  onShareSyllabus: () => void
}) {
  return (
    <AnimatedCard style={selected ? styles.cardSelected : styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${exam.name}`}
        onPress={onPress}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <View style={styles.cardTop}>
          <View style={styles.iconBubble}>
            <Ionicons name="calendar-number" size={18} color={colors.accent} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>{exam.name}</Text>
            <Text style={styles.cardMeta}>{compact([exam.teacher_name, exam.standard, exam.division, formatDate(exam.exam_date)])}</Text>
          </View>
          <SelectableChip label={exam.results_published ? 'Published' : 'Hidden'} selected={exam.results_published} />
        </View>
        <View style={styles.miniGrid}>
          <MetricTile value={exam.paper_ids?.length ?? 0} label="Papers" />
          <MetricTile value={exam.duration_minutes || '-'} label="Minutes" />
        </View>
      </Pressable>

      {linkedPapers.length > 0 ? (
        <View style={styles.examPapersList}>
          {linkedPapers.map((paper) => (
            <View key={paper.id} style={styles.examPaperChip}>
              <Ionicons name="document-text-outline" size={13} color={colors.textMuted} />
              <Text style={styles.examPaperChipText} numberOfLines={1}>{paper.title}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.staffCardActions}>
        <StaffCardActionButton
          label="Edit"
          icon="create-outline"
          onPress={onPress}
        />
        <StaffCardActionButton
          label={syllabus ? 'Update syllabus' : 'Share syllabus'}
          icon="share-social-outline"
          loading={sharingSyllabus}
          onPress={onShareSyllabus}
        />
      </View>
    </AnimatedCard>
  )
}

function StaffExamsView({ role }: { role?: Role }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [form, setForm] = useState<ExamFormState>(emptyForm)
  const scrollRef = useRef<ScrollView>(null)

  const examsQuery = useQuery({ queryKey: ['exams', 'staff'], queryFn: examsApi.listStaffExams })
  const subjectsQuery = useQuery({ queryKey: ['exams', 'subjects'], queryFn: examsApi.listSubjects })
  const papersQuery = useQuery({ queryKey: ['exams', 'papers'], queryFn: examsApi.listPublishedPapers })
  const optionsQuery = useQuery({ queryKey: ['exams', 'paper-options'], queryFn: examsApi.getPaperOptions, enabled: role === 'teacher' })
  const teachersQuery = useQuery({ queryKey: ['exams', 'teachers'], queryFn: examsApi.listTeachers, enabled: isAdminLike(role) })
  const syllabiQuery = useQuery({ queryKey: ['exams', 'syllabi'], queryFn: cheatSheetsApi.listSharedSyllabi })

  const subjects = subjectsQuery.data ?? []
  const papers = papersQuery.data ?? []
  const exams = examsQuery.data ?? []
  const teachers = teachersQuery.data ?? []
  const syllabiByExamId = useMemo(() => {
    const map = new Map<string, CheatSheetSyllabus>()
    for (const syllabus of syllabiQuery.data?.items ?? []) {
      map.set(syllabus.exam_id, syllabus)
    }
    return map
  }, [syllabiQuery.data])
  const papersByExamId = useMemo(() => {
    const byId = new Map(papers.map((paper) => [paper.id, paper]))
    const map = new Map<string, PaperListItem[]>()
    for (const exam of exams) {
      map.set(exam.id, (exam.paper_ids ?? []).map((id) => byId.get(id)).filter((paper): paper is PaperListItem => Boolean(paper)))
    }
    return map
  }, [exams, papers])
  const standardOptions = useMemo(() => {
    const fromPapers = papers.map((paper) => paper.standard).filter(Boolean) as string[]
    return Array.from(new Set([...(optionsQuery.data?.standards ?? []), ...fromPapers]))
  }, [optionsQuery.data?.standards, papers])
  const divisionOptions = useMemo(() => {
    const fromPapers = papers.map((paper) => paper.division).filter(Boolean) as string[]
    return Array.from(new Set([...(optionsQuery.data?.divisions ?? []), ...fromPapers]))
  }, [optionsQuery.data?.divisions, papers])

  const visibleSubjects = useMemo(() => {
    if (role !== 'teacher') return subjects
    const taught = new Set((user?.subjects_taught ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean))
    if (taught.size === 0) return subjects
    return subjects.filter((subject) => taught.has(subject.name.trim().toLowerCase()))
  }, [role, subjects, user?.subjects_taught])

  const subjectSelectOptions = visibleSubjects.map((subject) => ({ value: subject.id, label: subject.name }))
  const teacherSelectOptions = teachers
    .filter((teacher) => teacher.is_active && teacher.is_approved)
    .map((teacher) => ({ value: teacher.id, label: compact([`${teacher.first_name} ${teacher.last_name}`, teacher.teacher_id, teacher.email]) }))
  const standardSelectOptions = standardOptions.map((value) => ({ value, label: value }))
  const divisionSelectOptions = divisionOptions.map((value) => ({ value, label: value }))
  const semesterSelectOptions = useMemo(() => {
    const fromExams = exams.map((exam) => exam.semester).filter((value): value is string => Boolean(value))
    return Array.from(new Set([...defaultSemesterOptions, ...fromExams])).map((value) => ({ value, label: value }))
  }, [exams])

  const filteredPapers = useMemo(() => {
    return papers.filter((paper) => {
      if (form.subjectId && paper.subject_id && paper.subject_id !== form.subjectId) return false
      if (form.standard && paper.standard && paper.standard !== form.standard) return false
      if (form.division && paper.division && paper.division !== form.division) return false
      return true
    })
  }, [form.division, form.standard, form.subjectId, papers])

  const paperSelectOptions = useMemo(
    () => filteredPapers.map((paper) => ({ value: paper.id, label: compact([paper.title, `${paper.total_marks} marks`]) })),
    [filteredPapers],
  )

  const resetForm = () => {
    setSelectedExam(null)
    setForm(emptyForm)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = form.name.trim()
      if (!trimmedName) throw new Error('Exam name is required.')
      if (!form.examDate.trim()) throw new Error('Exam date is required.')
      if (isAdminLike(role) && !form.teacherId) throw new Error('Teacher is required.')
      const duration = form.durationMinutes.trim() ? Number(form.durationMinutes.trim()) : null
      if (duration !== null && (!Number.isInteger(duration) || duration <= 0)) {
        throw new Error('Duration must be a positive whole number.')
      }

      const payload: ExamPayload = {
        name: trimmedName,
        subject_id: form.subjectId || null,
        standard: form.standard || null,
        division: form.division || null,
        semester: form.semester.trim() || null,
        exam_date: form.examDate.trim() || null,
        duration_minutes: duration,
        auto_grade_enabled: form.autoGradeEnabled,
        results_published: form.resultsPublished,
        teacher_id: isAdminLike(role) ? form.teacherId : undefined,
        paper_ids: form.paperIds,
      }

      return selectedExam ? examsApi.update(selectedExam.id, payload) : examsApi.create(payload)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['exams', 'staff'] }),
        queryClient.invalidateQueries({ queryKey: SCAN_UPLOAD_OPTIONS_QUERY_KEY }),
      ])
      notify(selectedExam ? 'Exam updated' : 'Exam created', 'The exam list has been refreshed.')
      resetForm()
    },
    onError: (error) => {
      notify('Save failed', error instanceof Error ? error.message : extractDetail(error, 'Unable to save exam.'))
    },
  })

  const shareSyllabusMutation = useMutation({
    mutationFn: (exam: Exam) => cheatSheetsApi.shareSyllabus(exam.id),
    onSuccess: (syllabus) => {
      queryClient.setQueryData(['exams', 'syllabi'], (current: CheatSheetSyllabusList | undefined) => {
        const items = (current?.items ?? []).filter((existing) => existing.exam_id !== syllabus.exam_id)
        return { items: [...items, syllabus], total: items.length + 1 }
      })
      notify('Syllabus shared', `The syllabus for "${syllabus.exam_name ?? ''}" is now available to students.`)
    },
    onError: (error) => {
      notify('Share failed', extractDetail(error, 'Unable to share this exam syllabus.'))
    },
  })

  const isLoading = examsQuery.isLoading || subjectsQuery.isLoading || papersQuery.isLoading || teachersQuery.isLoading
  const isError = examsQuery.isError || subjectsQuery.isError || papersQuery.isError
  const refreshing = examsQuery.isRefetching || subjectsQuery.isRefetching || papersQuery.isRefetching || teachersQuery.isRefetching || syllabiQuery.isRefetching

  if (isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading exams</Text>
      </AppScreen>
    )
  }

  if (isError) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState title="Exams unavailable" message="Unable to load exam management data." onAction={() => {
          void examsQuery.refetch()
          void subjectsQuery.refetch()
          void papersQuery.refetch()
        }} />
      </AppScreen>
    )
  }

  return (
    <AppScreen
      ref={scrollRef}
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
        void examsQuery.refetch()
        void subjectsQuery.refetch()
        void papersQuery.refetch()
        void teachersQuery.refetch()
        void syllabiQuery.refetch()
      }} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <GradientHeroCard
        eyebrow="EXAMS"
        title="Exam manager"
        subtitle="Create, schedule, link papers, and control grading visibility from mobile."
      />

      <AnimatedCard style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <MetricTile value={exams.length} label="Exams" />
          <MetricTile value={papers.length} label="Papers" />
          <MetricTile value={subjects.length} label="Subjects" />
        </View>
      </AnimatedCard>

      <View style={styles.section}>
        <SectionHeader title={selectedExam ? 'Edit exam' : 'Create exam'} subtitle="Matches the website exam form and backend validation." count={form.paperIds.length} />
        <AnimatedCard style={styles.formCard}>
          <TextInputField
            label="Exam name"
            value={form.name}
            onChangeText={(name) => setForm((current) => ({ ...current, name }))}
            placeholder="e.g. Physics unit test"
            left={<Ionicons name="create" size={17} color={colors.textMuted} />}
          />
          {isAdminLike(role) ? (
            <SelectField
              label="Teacher"
              value={form.teacherId}
              placeholder={teacherSelectOptions.length ? 'Select teacher' : 'No approved teachers'}
              options={teacherSelectOptions}
              onChange={(teacherId) => setForm((current) => ({ ...current, teacherId }))}
              disabled={teacherSelectOptions.length === 0}
            />
          ) : null}
          <SelectField
            label="Subject"
            value={form.subjectId}
            placeholder="Select subject"
            options={subjectSelectOptions}
            onChange={(subjectId) => setForm((current) => ({ ...current, subjectId }))}
            disabled={subjectSelectOptions.length === 0}
          />
          <View style={styles.twoColumn}>
            <View style={styles.fieldHalf}>
              <SelectField
                label="Standard"
                value={form.standard}
                placeholder="Standard"
                options={standardSelectOptions}
                onChange={(standard) => setForm((current) => ({ ...current, standard }))}
                disabled={standardSelectOptions.length === 0}
              />
            </View>
            <View style={styles.fieldHalf}>
              <SelectField
                label="Division"
                value={form.division}
                placeholder="Division"
                options={divisionSelectOptions}
                onChange={(division) => setForm((current) => ({ ...current, division }))}
                disabled={divisionSelectOptions.length === 0}
              />
            </View>
          </View>
          <View style={styles.twoColumn}>
            <View style={styles.fieldHalf}>
              <DateField
                label="Exam date"
                value={form.examDate}
                onChange={(examDate) => setForm((current) => ({ ...current, examDate }))}
                placeholder="Select date"
              />
            </View>
            <View style={styles.fieldHalf}>
              <TextInputField
                label="Duration"
                value={form.durationMinutes}
                onChangeText={(durationMinutes) => setForm((current) => ({ ...current, durationMinutes }))}
                placeholder="Minutes"
                keyboardType="number-pad"
                left={<Ionicons name="timer" size={17} color={colors.textMuted} />}
              />
            </View>
          </View>
          <SelectField
            label="Semester"
            value={form.semester}
            placeholder="Select semester"
            options={semesterSelectOptions}
            onChange={(semester) => setForm((current) => ({ ...current, semester }))}
          />
          <MultiSelectField
            label="Papers"
            values={form.paperIds}
            placeholder="Select papers"
            options={paperSelectOptions}
            onChange={(paperIds) => setForm((current) => ({ ...current, paperIds }))}
            disabled={paperSelectOptions.length === 0}
          />
          <View style={styles.chipRow}>
            <SelectableChip
              label="Auto grade"
              selected={form.autoGradeEnabled}
              onPress={() => setForm((current) => ({ ...current, autoGradeEnabled: !current.autoGradeEnabled }))}
            />
            <SelectableChip
              label="Publish results"
              selected={form.resultsPublished}
              onPress={() => setForm((current) => ({ ...current, resultsPublished: !current.resultsPublished }))}
            />
          </View>
          <View style={styles.actionRow}>
            <AnimatedButton label={selectedExam ? 'Update exam' : 'Create exam'} loading={saveMutation.isPending} disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()} style={styles.actionButton} />
            <AnimatedButton label="Clear" variant="ghost" onPress={resetForm} style={styles.actionButton} />
          </View>
        </AnimatedCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Existing exams" subtitle="Tap an exam to edit its mobile form." count={exams.length} />
        {exams.length === 0 ? (
          <AnimatedCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>No exams created yet.</Text>
          </AnimatedCard>
        ) : (
          exams.map((exam) => (
            <StaffExamCard
              key={exam.id}
              exam={exam}
              linkedPapers={papersByExamId.get(exam.id) ?? []}
              selected={selectedExam?.id === exam.id}
              syllabus={syllabiByExamId.get(exam.id)}
              sharingSyllabus={shareSyllabusMutation.isPending && shareSyllabusMutation.variables?.id === exam.id}
              onPress={() => {
                setSelectedExam(exam)
                setForm(formFromExam(exam))
                scrollRef.current?.scrollTo({ y: 0, animated: true })
              }}
              onShareSyllabus={() => shareSyllabusMutation.mutate(exam)}
            />
          ))
        )}
      </View>
    </AppScreen>
  )
}

export default function ExamsScreen() {
  const role = useAuthStore((state) => state.user?.role)
  return isLearner(role) ? <StudentExamsView role={role} /> : <StaffExamsView role={role} />
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    paddingBottom: spacing[20],
  },
  learnerScreen: {
    gap: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: 120,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  summaryCard: {
    gap: spacing[4],
  },
  libraryStats: {
    minHeight: 74,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3],
    ...shadows.sm,
  },
  libraryStat: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: colors.slate[50],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    gap: 4,
  },
  libraryStatValue: {
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 20,
    lineHeight: 23,
  },
  libraryStatLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  metricTile: {
    flex: 1,
    minHeight: 78,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    justifyContent: 'space-between',
  },
  metricValue: {
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 22,
  },
  metricLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  section: {
    gap: spacing[3],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  sectionCopy: {
    flex: 1,
  },
  sectionTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  sectionSubtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  countPill: {
    minWidth: 24,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  examHero: {
    position: 'relative',
    paddingLeft: spacing[4],
    paddingRight: spacing[1],
    paddingVertical: spacing[2],
    gap: spacing[3],
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
  },
  examQueueRail: {
    position: 'absolute',
    left: 0,
    top: spacing[2],
    bottom: spacing[2],
    width: 3,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  examHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  examHeroIcon: {
    width: 38,
    height: 38,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  examHeroCopy: {
    flex: 1,
  },
  examHeroKicker: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    lineHeight: 13,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  examHeroTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 24,
    lineHeight: 28,
    marginTop: 2,
  },
  examModeSwitch: {
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
  },
  examModeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  examModeButtonActive: {
    borderBottomColor: colors.accent,
  },
  examModeText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  examModeTextActive: {
    color: colors.accent,
  },
  card: {
    gap: spacing[4],
  },
  examCard: {
    gap: spacing[4],
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    padding: spacing[4],
  },
  examCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  examSubjectIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  examCardKicker: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  examStatusPill: {
    minHeight: 30,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  examStatusPillDone: {
  },
  examStatusText: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  examStatusTextDone: {
    color: colors.success,
  },
  examProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  examProgressCopy: {
    flex: 1,
  },
  examProgressText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  examProgressMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    marginTop: 2,
  },
  examProgressPercent: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
  },
  examProgressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
    overflow: 'hidden',
  },
  examProgressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  actionNotice: {
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${colors.success}35`,
    backgroundColor: colors.successSurface,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  actionNoticeError: {
    borderColor: `${colors.danger}35`,
    backgroundColor: colors.dangerSurface,
  },
  actionNoticeText: {
    flex: 1,
    color: colors.success,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  actionNoticeTextError: {
    color: colors.danger,
  },
  practiceCard: {
    position: 'relative',
    minHeight: 112,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[4],
    overflow: 'hidden',
    ...shadows.sm,
  },
  practiceAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.accent,
  },
  practiceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  practiceIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  practiceCopy: {
    flex: 1,
  },
  practiceSubject: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  practiceTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 21,
  },
  practiceMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    marginTop: 2,
  },
  practiceArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate[950],
  },
  practiceFooter: {
    marginTop: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  readyPillSubmitted: {
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  readyDotSubmitted: {
    backgroundColor: colors.success,
  },
  readyText: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  readyTextSubmitted: {
    color: colors.success,
  },
  openText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  cardSelected: {
    gap: spacing[4],
    borderColor: colors.accent,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
  },
  cardMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    marginTop: 2,
  },
  miniGrid: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  examPapersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  examPaperChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[2],
    paddingVertical: 5,
  },
  examPaperChipText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  staffCardActions: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  staffCardActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[2],
  },
  staffCardActionButtonShare: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  staffCardActionButtonDelete: {
    borderColor: `${colors.danger}35`,
    backgroundColor: colors.dangerSurface,
  },
  staffCardActionButtonDisabled: {
    opacity: 0.5,
  },
  staffCardActionText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  paperList: {
    gap: spacing[2],
  },
  paperRow: {
    paddingVertical: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing[2],
  },
  paperRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  paperRowCopy: {
    flex: 1,
  },
  paperRowTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  paperRowMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    marginTop: 2,
  },
  paperStateDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.borderStrong,
  },
  paperStateDotDone: {
    backgroundColor: colors.success,
  },
  paperActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing[4],
  },
  paperActionButton: {
    minWidth: 76,
    minHeight: 44,
    paddingHorizontal: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  paperActionButtonDanger: {
    borderColor: `${colors.danger}35`,
    backgroundColor: colors.dangerSurface,
  },
  paperActionButtonDisabled: {
    opacity: 0.42,
  },
  paperActionText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    lineHeight: 16,
  },
  paperActionTextPrimary: {
    color: colors.accent,
  },
  paperActionTextDanger: {
    color: colors.danger,
  },
  examSkeletonHero: {
    minHeight: 128,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
  },
  examSkeletonTitle: {
    width: '58%',
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
  },
  examSkeletonMeta: {
    width: '82%',
    height: 14,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
  },
  examSkeletonSwitch: {
    height: 44,
    borderBottomWidth: 2,
    borderBottomColor: colors.borderStrong,
    backgroundColor: colors.backgroundMuted,
  },
  examSkeletonSectionTitle: {
    width: '42%',
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
  },
  examSkeletonCard: {
    minHeight: 150,
  },
  learnerEmptyCard: {
    padding: spacing[4],
    gap: spacing[3],
    backgroundColor: colors.backgroundElevated,
  },
  learnerEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  learnerEmptyCopy: {
    gap: spacing[1],
  },
  learnerEmptyTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
    lineHeight: 23,
  },
  learnerEmptyBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  learnerEmptyAction: {
    minHeight: 48,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  learnerEmptyActionText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  paperActionsSheet: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[4],
    gap: spacing[4],
    ...shadows.lg,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: radius.full,
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  sheetHeaderCopy: {
    flex: 1,
    gap: spacing[1],
  },
  sheetKicker: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 20,
    lineHeight: 25,
  },
  sheetClose: {
    width: 44,
    height: 44,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionList: {
    gap: spacing[2],
  },
  sheetAction: {
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  sheetActionDanger: {
    borderColor: `${colors.danger}35`,
    backgroundColor: colors.dangerSurface,
  },
  sheetActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  sheetActionIconDanger: {
    backgroundColor: colors.backgroundElevated,
    borderColor: `${colors.danger}35`,
  },
  sheetActionCopy: {
    flex: 1,
    gap: 2,
  },
  sheetActionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
    lineHeight: 18,
  },
  sheetActionTitleDanger: {
    color: colors.danger,
  },
  sheetActionBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  confirmationOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing[4],
    backgroundColor: 'rgba(2, 6, 23, 0.56)',
  },
  confirmationSheet: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[5],
    gap: spacing[3],
    ...shadows.lg,
  },
  confirmationIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  confirmationIconDanger: {
    backgroundColor: colors.dangerSurface,
    borderColor: `${colors.danger}35`,
  },
  confirmationTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 21,
    lineHeight: 25,
  },
  confirmationBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  confirmationActions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: 2,
  },
  confirmationButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  confirmationButtonText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  confirmationPrimary: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  confirmationPrimaryDanger: {
    borderColor: colors.danger,
    backgroundColor: colors.danger,
  },
  confirmationPrimaryText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: colors.backgroundElevated,
  },
  emptyText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  formCard: {
    gap: spacing[4],
  },
  twoColumn: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  fieldHalf: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  actionButton: {
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
})
