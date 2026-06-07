import React, { ReactNode, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, GradientHeroCard, SelectField, SelectableChip, TextInputField } from '../../components/ui'
import { examsApi, ExamPayload } from '../../api/exams'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import type { Exam, PaperListItem, Role, StudentExamRead, StudentExamPaper } from '../../types'

type ExamTab = 'teacher' | 'practice'
type SubjectVisual = {
  icon: keyof typeof Ionicons.glyphMap
  tone: string
}

const papersHeaderImage = require('../../../assets/papers-header-bg.png')

const adminRoles: Role[] = ['admin', 'developer', 'principal', 'school_super_admin', 'branch_admin']
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

function extractDetail(error: unknown, fallback: string) {
  return (error as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.examModeButton, selected && styles.examModeButtonActive, pressed && styles.pressed]}>
      <Ionicons name={icon} size={16} color={selected ? colors.white : colors.textMuted} />
      <Text style={[styles.examModeText, selected && styles.examModeTextActive]}>{label}</Text>
    </Pressable>
  )
}

function ExamWorkspaceHero({
  activeTab,
  isB2C,
  teacherCount,
  practiceCount,
  paperCount,
  completedCount,
  onTeacher,
  onPractice,
}: {
  activeTab: ExamTab
  isB2C: boolean
  teacherCount: number
  practiceCount: number
  paperCount: number
  completedCount: number
  onTeacher: () => void
  onPractice: () => void
}) {
  const totalItems = teacherCount + practiceCount
  const focusLabel = activeTab === 'practice' || isB2C ? 'Practice workspace' : 'Teacher assessment'
  const focusBody = activeTab === 'practice' || isB2C
    ? 'Open generated papers, keep pace, and submit when your review is clean.'
    : 'Start assigned exams with a focused timer, paper selection, and review flow.'

  return (
    <LinearGradient colors={[colors.slate[950], colors.slate[900], '#20130d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.examHero}>
      <View style={styles.examHeroTop}>
        <View style={styles.examHeroIcon}>
          <Ionicons name="school-outline" size={20} color={colors.accent} />
        </View>
        <View style={styles.examHeroCopy}>
          <Text style={styles.examHeroKicker}>Exam workspace</Text>
          <Text style={styles.examHeroTitle}>{focusLabel}</Text>
        </View>
      </View>
      <Text style={styles.examHeroBody}>{focusBody}</Text>

      <View style={styles.examHeroStats}>
        <View style={styles.examHeroStat}>
          <Text style={styles.examHeroValue}>{totalItems}</Text>
          <Text style={styles.examHeroLabel}>Exams</Text>
        </View>
        <View style={styles.examHeroStat}>
          <Text style={styles.examHeroValue}>{paperCount}</Text>
          <Text style={styles.examHeroLabel}>Papers</Text>
        </View>
        <View style={styles.examHeroStat}>
          <Text style={styles.examHeroValue}>{completedCount}</Text>
          <Text style={styles.examHeroLabel}>Done</Text>
        </View>
      </View>

      {!isB2C ? (
        <View style={styles.examModeSwitch}>
          <ExamModeButton label="Teacher" icon="calendar-clear-outline" selected={activeTab === 'teacher'} onPress={onTeacher} />
          <ExamModeButton label="Practice" icon="flash-outline" selected={activeTab === 'practice'} onPress={onPractice} />
        </View>
      ) : null}
    </LinearGradient>
  )
}

function ExamsPhotoHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.photoHeaderWrap, { paddingTop: insets.top }]}>
      <View style={styles.headerImage}>
        <Image source={papersHeaderImage} resizeMode="cover" style={styles.headerPhoto} />
        <LinearGradient
          colors={['rgba(2,6,23,0.90)', 'rgba(15,23,42,0.38)', 'rgba(194,65,12,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.headerWarmVeil} />
        <View style={styles.photoHeaderContent}>
          <View style={styles.photoHeaderCopy}>
            <Text style={styles.photoHeaderTitle}>{title}</Text>
            <Text style={styles.photoHeaderSubtitle}>{subtitle}</Text>
          </View>
          <View style={styles.photoHeaderIcon}>
            <Ionicons name="document-text-outline" size={20} color={colors.white} />
          </View>
        </View>
      </View>
    </View>
  )
}

function openPaperAttempt(navigation: any, paperId: string, examId?: string | null) {
  const parent = navigation.getParent?.()
  const params = { screen: 'AttemptPaper', params: { paperId, examId: examId || undefined } }

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
  navigation.navigate('AttemptPaper', { paperId, examId: examId || undefined })
}

function LearnerExamCard({ exam, onOpenPaper }: { exam: StudentExamRead; onOpenPaper: (paper: StudentExamPaper) => void }) {
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
        {exam.papers.map((paper) => (
          <Pressable key={paper.id} onPress={() => onOpenPaper(paper)} style={({ pressed }) => [styles.paperRow, pressed && styles.pressed]}>
            <View style={styles.paperRowCopy}>
              <Text style={styles.paperRowTitle}>{paper.title}</Text>
              <Text style={styles.paperRowMeta}>{paper.total_marks} marks / {paper.is_submitted_by_me ? 'Submitted' : 'Not submitted'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
          </Pressable>
        ))}
      </View>
    </AnimatedCard>
  )
}

function PracticePaperCard({ paper, onOpen }: { paper: PaperListItem; onOpen: () => void }) {
  const subject = paper.subject_name || 'Practice paper'
  const subjectVisual = resolveSubjectVisual(compact([paper.subject_name, paper.title, paper.category]))

  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.practiceCard, pressed && styles.pressed]}>
      <View style={[styles.practiceAccent, { backgroundColor: subjectVisual.tone }]} />
      <View style={styles.practiceTop}>
        <View style={[styles.practiceIcon, { backgroundColor: `${subjectVisual.tone}14`, borderColor: `${subjectVisual.tone}35` }]}>
          <Ionicons name={subjectVisual.icon} size={18} color={subjectVisual.tone} />
        </View>
        <View style={styles.practiceCopy}>
          <Text style={[styles.practiceSubject, { color: subjectVisual.tone }]}>{subject}</Text>
          <Text style={styles.practiceTitle} numberOfLines={1}>{paper.title}</Text>
          <Text style={styles.practiceMeta}>{compact([`${paper.total_marks} marks`, formatDate(paper.created_at)])}</Text>
        </View>
        <View style={styles.practiceArrow}>
          <Ionicons name="arrow-forward" size={17} color={colors.white} />
        </View>
      </View>
      <View style={styles.practiceFooter}>
        <View style={styles.readyPill}>
          <View style={styles.readyDot} />
          <Text style={styles.readyText}>Ready</Text>
        </View>
        <Text style={styles.openText}>Open paper</Text>
      </View>
    </Pressable>
  )
}

function StudentExamsView({ role }: { role?: Role }) {
  const navigation = useNavigation<any>()
  const [activeTab, setActiveTab] = useState<ExamTab>(role === 'b2c_student' ? 'practice' : 'teacher')
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
  const assignedPaperCount = teacherExams.reduce((sum, exam) => sum + exam.papers.length, 0)
  const completedAssignedCount = teacherExams.reduce((sum, exam) => sum + exam.papers.filter((paper) => paper.is_submitted_by_me).length, 0)
  const isLoading = teacherExamsQuery.isLoading || practiceQuery.isLoading
  const isError = teacherExamsQuery.isError || practiceQuery.isError
  const refreshing = teacherExamsQuery.isRefetching || practiceQuery.isRefetching

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
        <ErrorState title="Exams unavailable" message="Unable to load exams." onAction={() => {
          void teacherExamsQuery.refetch()
          void practiceQuery.refetch()
        }} />
      </AppScreen>
    )
  }

  return (
    <View style={styles.root}>
      <ExamsPhotoHeader
        title={isB2C ? 'Practice papers' : 'Teacher exams'}
        subtitle={isB2C ? 'Practice library' : 'Assigned exams'}
      />
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
        paperCount={assignedPaperCount + practicePapers.length}
        completedCount={completedAssignedCount}
        onTeacher={() => setActiveTab('teacher')}
        onPractice={() => setActiveTab('practice')}
      />

      {activeTab === 'teacher' && !isB2C ? (
        <View style={styles.section}>
          <SectionHeader title="Assigned exams" subtitle="Teacher-created exams matched to your class and subjects." count={teacherExams.length} />
          {teacherExams.length === 0 ? (
            <AnimatedCard style={styles.emptyCard}>
              <Text style={styles.emptyText}>No assigned exams yet.</Text>
            </AnimatedCard>
          ) : (
            teacherExams.map((exam) => (
              <LearnerExamCard key={exam.id} exam={exam} onOpenPaper={(paper) => openPaperAttempt(navigation, paper.id, exam.id)} />
            ))
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <SectionHeader title="Practice papers" subtitle="Recent generated papers ready to attempt." count={practicePapers.length} />
          {practicePapers.length === 0 ? (
            <AnimatedCard style={styles.emptyCard}>
              <Text style={styles.emptyText}>No practice papers yet. Generate a paper first.</Text>
            </AnimatedCard>
          ) : (
            practicePapers.map((paper) => (
              <PracticePaperCard key={paper.id} paper={paper} onOpen={() => openPaperAttempt(navigation, paper.id)} />
            ))
          )}
        </View>
      )}
      </AppScreen>
    </View>
  )
}

interface ExamFormState {
  name: string
  subjectId: string
  standard: string
  division: string
  semester: string
  category: string
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
  category: '',
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
    category: exam.category || '',
    examDate: exam.exam_date || '',
    durationMinutes: exam.duration_minutes ? String(exam.duration_minutes) : '',
    autoGradeEnabled: exam.auto_grade_enabled,
    resultsPublished: exam.results_published,
    teacherId: exam.teacher_id,
    paperIds: exam.paper_ids ?? [],
  }
}

function StaffExamCard({ exam, selected, onPress }: { exam: Exam; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.examCardPress, pressed && styles.pressed]}>
      <AnimatedCard style={selected ? styles.cardSelected : styles.card}>
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
      </AnimatedCard>
    </Pressable>
  )
}

function StaffExamsView({ role }: { role?: Role }) {
  const queryClient = useQueryClient()
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [form, setForm] = useState<ExamFormState>(emptyForm)

  const examsQuery = useQuery({ queryKey: ['exams', 'staff'], queryFn: examsApi.listStaffExams })
  const subjectsQuery = useQuery({ queryKey: ['exams', 'subjects'], queryFn: examsApi.listSubjects })
  const papersQuery = useQuery({ queryKey: ['exams', 'papers'], queryFn: examsApi.listPublishedPapers })
  const optionsQuery = useQuery({ queryKey: ['exams', 'paper-options'], queryFn: examsApi.getPaperOptions, enabled: role === 'teacher' })
  const teachersQuery = useQuery({ queryKey: ['exams', 'teachers'], queryFn: examsApi.listTeachers, enabled: isAdminLike(role) })

  const subjects = subjectsQuery.data ?? []
  const papers = papersQuery.data ?? []
  const exams = examsQuery.data ?? []
  const teachers = teachersQuery.data ?? []
  const standardOptions = useMemo(() => {
    const fromPapers = papers.map((paper) => paper.standard).filter(Boolean) as string[]
    return Array.from(new Set([...(optionsQuery.data?.standards ?? []), ...fromPapers]))
  }, [optionsQuery.data?.standards, papers])
  const divisionOptions = useMemo(() => {
    const fromPapers = papers.map((paper) => paper.division).filter(Boolean) as string[]
    return Array.from(new Set([...(optionsQuery.data?.divisions ?? []), ...fromPapers]))
  }, [optionsQuery.data?.divisions, papers])

  const subjectSelectOptions = subjects.map((subject) => ({ value: subject.id, label: subject.name }))
  const teacherSelectOptions = teachers
    .filter((teacher) => teacher.is_active && teacher.is_approved)
    .map((teacher) => ({ value: teacher.id, label: compact([`${teacher.first_name} ${teacher.last_name}`, teacher.teacher_id, teacher.email]) }))
  const standardSelectOptions = standardOptions.map((value) => ({ value, label: value }))
  const divisionSelectOptions = divisionOptions.map((value) => ({ value, label: value }))

  const filteredPapers = useMemo(() => {
    return papers.filter((paper) => {
      if (form.subjectId && paper.subject_id && paper.subject_id !== form.subjectId) return false
      if (form.standard && paper.standard && paper.standard !== form.standard) return false
      if (form.division && paper.division && paper.division !== form.division) return false
      return true
    })
  }, [form.division, form.standard, form.subjectId, papers])

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
        category: form.category.trim() || null,
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
      await queryClient.invalidateQueries({ queryKey: ['exams', 'staff'] })
      Alert.alert(selectedExam ? 'Exam updated' : 'Exam created', 'The exam list has been refreshed.')
      resetForm()
    },
    onError: (error) => {
      Alert.alert('Save failed', error instanceof Error ? error.message : extractDetail(error, 'Unable to save exam.'))
    },
  })

  const isLoading = examsQuery.isLoading || subjectsQuery.isLoading || papersQuery.isLoading || teachersQuery.isLoading
  const isError = examsQuery.isError || subjectsQuery.isError || papersQuery.isError
  const refreshing = examsQuery.isRefetching || subjectsQuery.isRefetching || papersQuery.isRefetching || teachersQuery.isRefetching

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

  const togglePaper = (paperId: string) => {
    setForm((current) => ({
      ...current,
      paperIds: current.paperIds.includes(paperId)
        ? current.paperIds.filter((id) => id !== paperId)
        : [...current.paperIds, paperId],
    }))
  }

  return (
    <AppScreen
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
        void examsQuery.refetch()
        void subjectsQuery.refetch()
        void papersQuery.refetch()
        void teachersQuery.refetch()
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
              <TextInputField
                label="Exam date"
                value={form.examDate}
                onChangeText={(examDate) => setForm((current) => ({ ...current, examDate }))}
                placeholder="YYYY-MM-DD"
                left={<Ionicons name="calendar" size={17} color={colors.textMuted} />}
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
          <View style={styles.twoColumn}>
            <View style={styles.fieldHalf}>
              <TextInputField
                label="Semester"
                value={form.semester}
                onChangeText={(semester) => setForm((current) => ({ ...current, semester }))}
                placeholder="Optional"
              />
            </View>
            <View style={styles.fieldHalf}>
              <TextInputField
                label="Category"
                value={form.category}
                onChangeText={(category) => setForm((current) => ({ ...current, category }))}
                placeholder="Unit test"
              />
            </View>
          </View>
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
        <SectionHeader title="Attach papers" subtitle="Published papers matching the selected filters." count={filteredPapers.length} />
        {filteredPapers.length === 0 ? (
          <AnimatedCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>No matching published papers.</Text>
          </AnimatedCard>
        ) : (
          filteredPapers.map((paper) => {
            const selected = form.paperIds.includes(paper.id)
            return (
              <Pressable key={paper.id} onPress={() => togglePaper(paper.id)} style={({ pressed }) => [styles.paperSelectCard, selected && styles.paperSelectCardActive, pressed && styles.pressed]}>
                <View style={styles.paperRowCopy}>
                  <Text style={styles.paperRowTitle}>{paper.title}</Text>
                  <Text style={styles.paperRowMeta}>{compact([paper.subject_name, paper.standard, paper.division, `${paper.total_marks} marks`])}</Text>
                </View>
                <Ionicons name={selected ? 'checkmark-circle' : 'add-circle-outline'} size={22} color={selected ? colors.accent : colors.textSoft} />
              </Pressable>
            )
          })
        )}
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
              selected={selectedExam?.id === exam.id}
              onPress={() => {
                setSelectedExam(exam)
                setForm(formFromExam(exam))
              }}
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
    gap: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[20],
  },
  photoHeaderWrap: {
    height: 118,
    overflow: 'hidden',
    backgroundColor: colors.slate[950],
  },
  headerImage: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  headerPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.98,
  },
  headerWarmVeil: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(249,115,22,0.72)',
  },
  photoHeaderContent: {
    minHeight: 76,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  photoHeaderCopy: {
    gap: 1,
  },
  photoHeaderTitle: {
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
  },
  photoHeaderSubtitle: {
    color: 'rgba(255,255,255,0.76)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
    lineHeight: 12,
    textTransform: 'uppercase',
  },
  photoHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
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
    minWidth: 38,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  countText: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  examHero: {
    borderRadius: radius['2xl'],
    padding: spacing[4],
    gap: spacing[4],
    overflow: 'hidden',
    ...shadows.lg,
  },
  examHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  examHeroIcon: {
    width: 44,
    height: 44,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  examHeroCopy: {
    flex: 1,
  },
  examHeroKicker: {
    color: 'rgba(255,255,255,0.50)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  examHeroTitle: {
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 22,
    lineHeight: 27,
    marginTop: 2,
  },
  examHeroBody: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  examHeroStats: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  examHeroStat: {
    flex: 1,
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  examHeroValue: {
    color: colors.white,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 21,
    lineHeight: 24,
  },
  examHeroLabel: {
    color: 'rgba(255,255,255,0.52)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginTop: spacing[1],
  },
  examModeSwitch: {
    minHeight: 52,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: spacing[1],
    flexDirection: 'row',
    gap: spacing[1],
  },
  examModeButton: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  examModeButtonActive: {
    backgroundColor: colors.accent,
  },
  examModeText: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  examModeTextActive: {
    color: colors.white,
  },
  card: {
    gap: spacing[4],
  },
  examCard: {
    gap: spacing[4],
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
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
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  examStatusPillDone: {
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
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
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readyPill: {
    minHeight: 28,
    borderRadius: radius.full,
    backgroundColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  readyText: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
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
  examCardPress: {
    borderRadius: radius.card,
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
  paperList: {
    gap: spacing[2],
  },
  paperRow: {
    minHeight: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[3],
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
  paperSelectCard: {
    minHeight: 70,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    ...shadows.sm,
  },
  paperSelectCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  pressed: {
    opacity: 0.72,
  },
})
