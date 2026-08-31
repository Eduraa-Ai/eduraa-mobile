import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as Sharing from 'expo-sharing'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { File as ExpoFile } from 'expo-file-system'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AppScreen, ErrorState, GradientHeroCard, SectionHeading, SelectField } from '../../components/ui'
import { checkedPapersApi } from '../../api/checkedPapers'
import {
  isAcceptedScanUploadError,
  SCAN_UPLOAD_OPTIONS_QUERY_KEY,
  scanUploadApi,
  type ScanUploadFile,
  type ScanUploadPhase,
  type ScanUploadReceipt,
} from '../../api/scanUpload'
import { useAuthStore } from '../../stores/authStore'
import { colors, layout, radius, shadows, spacing, typography } from '../../theme'
import type { CheckedPaper, Role } from '../../types'
import type { ScanUploadParams } from '../../navigation'
import {
  friendlyUploadError,
  isPaperAvailableForUploadMode,
  matchesStandardDivision,
  resolveScanUploadLink,
  resolveScanUploadStudentId,
  type StaffScanUploadMode,
} from './checkedPaperPipelineModel'
import {
  DEFAULT_SCAN_UPLOAD_LIMITS,
  formatBytes,
  moveScanFile,
  replaceScanFile,
  scanUploadReadiness,
  uploadIssueMessage,
  validateAndMergeScanFiles,
} from './scanUploadModel'
import {
  clearScanUploadDraft,
  deletePersistedScanUploadFile,
  loadScanUploadDraft,
  persistScanUploadFile,
  saveScanUploadDraft,
} from './scanUploadDraft'

function isStudentRole(role?: Role) {
  return role === 'student' || role === 'b2c_student'
}

function optionLabel(parts: Array<string | number | null | undefined>) {
  return parts.filter((part) => part !== null && part !== undefined && String(part).trim()).join(' · ')
}

function fileTypeFromName(name: string, fallback?: string | null) {
  if (fallback) return fallback
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function extractDetail(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const code = (detail as { code?: unknown }).code
    const message = (detail as { message?: unknown }).message
    if (typeof code === 'string') return code
    if (typeof message === 'string') return message
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function routeNames(nav: any): string[] {
  return nav?.getState?.().routeNames ?? []
}

function StepHeader({ number, title, complete }: { number: number; title: string; complete?: boolean }) {
  return (
    <View style={styles.stepHeader}>
      <View style={[styles.stepNumber, complete && styles.stepNumberComplete]}>
        {complete ? <Ionicons name="checkmark" size={15} color={colors.textOnBrand} /> : <Text style={styles.stepNumberText}>{number}</Text>}
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  )
}

function IconAction({ icon, label, text, danger, disabled, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  text: string
  danger?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconAction, danger && styles.iconActionDanger, disabled && styles.iconActionDisabled, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={16} color={disabled ? colors.textSubtle : danger ? colors.danger : colors.accentStrong} />
      <Text style={[styles.iconActionText, danger && styles.iconActionTextDanger]}>{text}</Text>
    </Pressable>
  )
}

function FileCard({ file, index, count, busy, onPreview, onMove, onReplace, onRotate, onRemove }: {
  file: ScanUploadFile
  index: number
  count: number
  busy: boolean
  onPreview: () => void
  onMove: (offset: -1 | 1) => void
  onReplace: () => void
  onRotate: () => void
  onRemove: () => void
}) {
  const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
  return (
    <View style={styles.fileCard}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${file.name}`} disabled={busy} onPress={onPreview} style={({ pressed }) => [styles.thumbnailButton, pressed && styles.pressed]}>
        {isPdf ? <Ionicons name="document-text-outline" size={30} color={colors.accentStrong} /> : <Image source={{ uri: file.uri }} style={styles.fileThumbnail} resizeMode="cover" />}
        <View style={styles.pageBadge}><Text style={styles.pageBadgeText}>{index + 1}</Text></View>
      </Pressable>
      <View style={styles.fileBody}>
        <View style={styles.pageHeadingRow}>
          <View style={styles.pageHeadingCopy}>
            <Text style={styles.fileTitle}>Page {index + 1}</Text>
            <Text style={styles.pagePosition}>{index + 1} of {count} in reading order</Text>
          </View>
          <View style={styles.orderControls}>
            <IconAction icon="arrow-up" text="Earlier" label={`Move page ${index + 1} earlier`} disabled={busy || index === 0} onPress={() => onMove(-1)} />
            <IconAction icon="arrow-down" text="Later" label={`Move page ${index + 1} later`} disabled={busy || index === count - 1} onPress={() => onMove(1)} />
          </View>
        </View>
        <Text style={styles.fileMeta} numberOfLines={1}>{file.name} · {isPdf ? 'PDF' : 'Image'} · {formatBytes(file.size)}</Text>
        <View style={styles.fileActions}>
          <IconAction icon="eye-outline" text="Preview" label={`Preview ${file.name}`} disabled={busy} onPress={onPreview} />
          {!isPdf ? <IconAction icon="refresh-outline" text="Rotate" label={`Rotate ${file.name}`} disabled={busy} onPress={onRotate} /> : null}
          <IconAction icon="swap-horizontal-outline" text="Replace" label={`Replace ${file.name}`} disabled={busy} onPress={onReplace} />
          <IconAction icon="trash-outline" text="Remove" label={`Remove ${file.name}`} danger disabled={busy} onPress={onRemove} />
        </View>
      </View>
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
    </View>
  )
}

export default function ScanUploadScreen() {
  const route = useRoute<RouteProp<{ ScanUpload: ScanUploadParams }, 'ScanUpload'>>()
  const initial = route.params
  const navigation = useNavigation<any>()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const role = user?.role
  const userId = user?.id ?? ''
  const staff = !isStudentRole(role)
  const insets = useSafeAreaInsets()
  const uploadControllerRef = useRef<AbortController | null>(null)
  const uploadMutationGuardRef = useRef(false)
  const uploadStartedAtRef = useRef<number | null>(null)
  const uploadSucceededRef = useRef(false)
  const pendingUploadRef = useRef<ScanUploadReceipt | null>(null)
  const didResumePendingUploadRef = useRef(false)
  const [staffUploadMode, setStaffUploadMode] = useState<StaffScanUploadMode>('ai_generation_system')
  const [selectedPaperId, setSelectedPaperId] = useState(initial?.initialPaperId ?? '')
  const [selectedExamId, setSelectedExamId] = useState(initial?.initialExamId ?? '')
  const [selectedSubjectId, setSelectedSubjectId] = useState(initial?.initialSubjectId ?? '')
  const [selectedStudentId, setSelectedStudentId] = useState(initial?.initialStudentId ?? '')
  const [files, setFiles] = useState<ScanUploadFile[]>([])
  const [previewFile, setPreviewFile] = useState<ScanUploadFile | null>(null)
  const [fileIssue, setFileIssue] = useState<string | null>(null)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const [busyFileIndex, setBusyFileIndex] = useState<number | null>(null)
  const [pendingRemovalIndex, setPendingRemovalIndex] = useState<number | null>(null)
  const [uploadPhase, setUploadPhase] = useState<ScanUploadPhase | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [recoveredPaper, setRecoveredPaper] = useState<CheckedPaper | null>(null)
  const [pendingUpload, setPendingUpload] = useState<ScanUploadReceipt | null>(null)

  const optionsQuery = useQuery({ queryKey: SCAN_UPLOAD_OPTIONS_QUERY_KEY, queryFn: scanUploadApi.getOptions })
  const options = optionsQuery.data
  const selectedPaper = options?.papers.find((paper) => paper.id === selectedPaperId)
  const selectedExam = options?.exams.find((exam) => exam.id === selectedExamId)
  const effectiveSubjectId = selectedPaper?.subject_id || selectedExam?.subject_id || selectedSubjectId || null
  const assessmentSelected = Boolean(selectedPaperId || selectedExamId)
  const selectedAssessmentKey = selectedPaperId ? `paper:${selectedPaperId}` : selectedExamId ? `exam:${selectedExamId}` : ''
  const assessmentSubjectName = selectedPaper?.subject_name || options?.subjects.find((subject) => subject.id === effectiveSubjectId)?.name || null
  const needsSubjectChoice = Boolean(staff && selectedExam && !selectedExam.subject_id)

  const assessmentOptions = useMemo(() => {
    if (!options) return []
    const paperEntries = options.papers
      .filter((paper) => !staff || isPaperAvailableForUploadMode(paper.source_type, 'custom_paper'))
      .map((paper) => ({ value: `paper:${paper.id}`, label: `Paper · ${optionLabel([paper.title, paper.subject_name, paper.standard, paper.division])}` }))
    if (!staff) return paperEntries
    return [
      ...options.exams.map((exam) => ({ value: `exam:${exam.id}`, label: `Exam · ${optionLabel([exam.name, exam.standard, exam.division])}` })),
      ...paperEntries,
    ]
  }, [options, staff])

  const standardDivisionTarget = selectedPaper
    ? { standard: selectedPaper.standard, division: selectedPaper.division }
    : selectedExam ? { standard: selectedExam.standard, division: selectedExam.division } : null
  const studentOptions = useMemo(
    () => !assessmentSelected ? [] : (options?.students ?? [])
      .filter((student) => !standardDivisionTarget || matchesStandardDivision(student, standardDivisionTarget))
      .map((student) => ({ value: student.id, label: optionLabel([`${student.first_name} ${student.last_name}`, student.student_id, student.standard, student.division]) })),
    [assessmentSelected, options?.students, standardDivisionTarget],
  )
  const subjectOptions = useMemo(() => (options?.subjects ?? []).map((subject) => ({ value: subject.id, label: subject.name })), [options?.subjects])

  useEffect(() => {
    if (!staff || !options || !initial?.initialPaperId) return
    if (options.papers.find((paper) => paper.id === initial.initialPaperId)?.source_type === 'custom_paper') setStaffUploadMode('custom_paper')
  }, [initial?.initialPaperId, options, staff])

  useEffect(() => {
    if (!userId || !options || draftHydrated) return
    const hasInitialContext = Boolean(
      initial?.initialPaperId || initial?.initialExamId || initial?.initialStudentId,
    )
    void loadScanUploadDraft(userId).then((draft) => {
      if (draft) {
        if (!hasInitialContext || draft.pendingUpload) {
          const paperExists = options.papers.some((paper) => paper.id === draft.selectedPaperId)
          const examExists = options.exams.some((exam) => exam.id === draft.selectedExamId)
          setStaffUploadMode(draft.staffUploadMode)
          setSelectedPaperId(paperExists ? draft.selectedPaperId : '')
          setSelectedExamId(examExists ? draft.selectedExamId : '')
          setSelectedSubjectId(draft.selectedSubjectId)
          setSelectedStudentId(draft.selectedStudentId)
          setFiles(draft.files)
          setDraftRestored(Boolean(paperExists || examExists || draft.files.length || draft.pendingUpload))
        }
        pendingUploadRef.current = draft.pendingUpload
        setPendingUpload(draft.pendingUpload)
      }
      setDraftHydrated(true)
    })
  }, [draftHydrated, initial?.initialExamId, initial?.initialPaperId, initial?.initialStudentId, options, userId])

  useEffect(() => {
    if (!draftHydrated || !userId || uploadSucceededRef.current) return undefined
    const timer = setTimeout(() => {
      void saveScanUploadDraft(userId, {
        staffUploadMode,
        selectedPaperId,
        selectedExamId,
        selectedSubjectId,
        selectedStudentId,
        files,
        pendingUpload,
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [draftHydrated, files, pendingUpload, selectedExamId, selectedPaperId, selectedStudentId, selectedSubjectId, staffUploadMode, userId])

  useEffect(() => () => uploadControllerRef.current?.abort(), [])

  useEffect(() => {
    if (staff && selectedStudentId && !studentOptions.some((option) => option.value === selectedStudentId)) setSelectedStudentId('')
  }, [staff, selectedStudentId, studentOptions])

  const readiness = scanUploadReadiness({
    isStudent: isStudentRole(role), assessmentSelected, studentSelected: Boolean(selectedStudentId),
    subjectResolved: Boolean(effectiveSubjectId), fileCount: files.length,
  })
  const uploadLink = resolveScanUploadLink({ isStaff: staff, mode: staffUploadMode, selectedPaperId, selectedExamId })

  const openPaperStatus = (paper: CheckedPaper) => {
    queryClient.setQueryData(['checked-paper', paper.id], paper)
    openPaperStatusById(paper.id)
  }

  const openPaperStatusById = (checkedPaperId: string) => {
    void queryClient.invalidateQueries({ queryKey: ['checked-papers'] })
    if (!staff) {
      const parent = navigation.getParent?.()
      if (routeNames(navigation).includes('Results')) return navigation.navigate('Results', { screen: 'ResultDetail', params: { checkedPaperId } })
      if (routeNames(parent).includes('Results')) return parent.navigate('Results', { screen: 'ResultDetail', params: { checkedPaperId } })
      return navigation.navigate('ResultDetail', { checkedPaperId })
    }
    const parent = navigation.getParent?.()
    if (routeNames(navigation).includes('CheckedPaperStatus')) return navigation.navigate('CheckedPaperStatus', { checkedPaperId })
    if (routeNames(navigation).includes('StaffHome')) return navigation.navigate('StaffHome', { screen: 'CheckedPaperStatus', params: { checkedPaperId } })
    if (routeNames(parent).includes('StaffHome')) return parent.navigate('StaffHome', { screen: 'CheckedPaperStatus', params: { checkedPaperId } })
    return navigation.navigate('CheckedPaperStatus', { checkedPaperId })
  }

  const reconcileAmbiguousUpload = async () => {
    const startedAt = uploadStartedAtRef.current
    if (!startedAt) return null
    try {
      const papers = await checkedPapersApi.list()
      const expectedStudent = resolveScanUploadStudentId({ isStaff: staff, selectedStudentId, authenticatedUserId: userId })
      const matching = papers.find((paper) => {
        const sameAssessment = uploadLink.paperId ? paper.paper_id === uploadLink.paperId : paper.exam_id === uploadLink.examId
        const changedAt = new Date(paper.updated_at || paper.created_at).getTime()
        return paper.student_id === expectedStudent && sameAssessment && Number.isFinite(changedAt) && changedAt >= startedAt - 5000
      }) ?? null
      setRecoveredPaper(matching)
      return matching
    } catch {
      return null
    }
  }

  const uploadMutation = useMutation({
    mutationFn: async (resumeReceipt?: ScanUploadReceipt) => {
      uploadControllerRef.current = new AbortController()
      if (!resumeReceipt) uploadStartedAtRef.current = Date.now()
      setUploadError(null)
      setRecoveredPaper(null)
      const receipt = resumeReceipt ?? await scanUploadApi.upload({
        paperId: uploadLink.paperId, examId: uploadLink.examId, subjectId: effectiveSubjectId,
        studentId: resolveScanUploadStudentId({ isStaff: staff, selectedStudentId, authenticatedUserId: userId }),
        uploadMode: uploadLink.uploadMode, files, signal: uploadControllerRef.current.signal, onPhase: setUploadPhase,
      })
      didResumePendingUploadRef.current = true
      pendingUploadRef.current = receipt
      setPendingUpload(receipt)
      if (!resumeReceipt) {
        await saveScanUploadDraft(userId, {
          staffUploadMode,
          selectedPaperId,
          selectedExamId,
          selectedSubjectId,
          selectedStudentId,
          files,
          pendingUpload: receipt,
        }).catch(() => undefined)
      }
      return scanUploadApi.awaitCheckedPaper(receipt, {
        signal: uploadControllerRef.current.signal,
        onPhase: setUploadPhase,
      })
    },
    onSuccess: async (checkedPaperId) => {
      uploadSucceededRef.current = true
      pendingUploadRef.current = null
      setPendingUpload(null)
      setUploadPhase(null)
      setFiles([])
      await clearScanUploadDraft(userId).catch(() => undefined)
      openPaperStatusById(checkedPaperId)
    },
    onError: async (error) => {
      setUploadPhase(null)
      const message = friendlyUploadError(extractDetail(error, ''), 'Unable to upload this scan.')
      const acceptedError = isAcceptedScanUploadError(error) ? error : null
      const acceptedReceipt = pendingUploadRef.current
      if (acceptedError?.terminal) {
        pendingUploadRef.current = null
        setPendingUpload(null)
        await saveScanUploadDraft(userId, {
          staffUploadMode,
          selectedPaperId,
          selectedExamId,
          selectedSubjectId,
          selectedStudentId,
          files,
          pendingUpload: null,
        }).catch(() => undefined)
      }
      const recovered = !acceptedReceipt && /too long|connection|receive|abort/i.test(message)
        ? await reconcileAmbiguousUpload()
        : null
      setUploadError(recovered
        ? 'The connection ended before confirmation, but your upload was found safely. Open its status instead of uploading again.'
        : message)
    },
    onSettled: () => {
      uploadControllerRef.current = null
      uploadMutationGuardRef.current = false
    },
  })

  const startUpload = (receipt?: ScanUploadReceipt) => {
    if (uploadMutationGuardRef.current) return
    uploadMutationGuardRef.current = true
    uploadMutation.mutate(receipt)
  }

  useEffect(() => {
    if (!draftHydrated || !pendingUpload || didResumePendingUploadRef.current || uploadMutation.isPending) return
    didResumePendingUploadRef.current = true
    startUpload(pendingUpload)
  }, [draftHydrated, pendingUpload?.id])

  const addFiles = async (items: ScanUploadFile[]) => {
    setFileIssue(null)
    const validation = validateAndMergeScanFiles(files, items, DEFAULT_SCAN_UPLOAD_LIMITS)
    const persisted: ScanUploadFile[] = []
    for (const item of validation.files.slice(files.length)) {
      try {
        persisted.push(await persistScanUploadFile(item, userId || 'anonymous'))
      } catch (error) {
        validation.rejected.push({ file: item, reason: extractDetail(error, 'This file could not be saved for upload.') })
      }
    }
    setFiles((current) => [...current, ...persisted])
    setFileIssue(uploadIssueMessage(validation.rejected))
  }

  const fromDocumentAsset = (asset: DocumentPicker.DocumentPickerAsset): ScanUploadFile => ({
    uri: asset.uri, name: asset.name || `scan-${Date.now()}.pdf`, type: fileTypeFromName(asset.name || '', asset.mimeType),
    size: asset.size, file: asset.file,
  })

  const pickDocuments = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], multiple: true, copyToCacheDirectory: true })
    if (!result.canceled && result.assets?.length) await addFiles(result.assets.map(fromDocumentAsset))
  }

  const pickGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: DEFAULT_SCAN_UPLOAD_LIMITS.maxFiles, quality: 0.85 })
    if (result.canceled || !result.assets?.length) return
    await addFiles(result.assets.map((asset, index) => ({
      uri: asset.uri, name: asset.fileName || `answer-scan-${Date.now()}-${index + 1}.jpg`,
      type: fileTypeFromName(asset.fileName || '', asset.mimeType), size: asset.fileSize, file: asset.file,
    })))
  }

  // Camera behavior intentionally remains the existing single-photo capture.
  const capturePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) return Alert.alert('Camera permission needed', 'Allow camera access to capture an answer sheet.')
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
    if (result.canceled || !result.assets?.length) return
    const asset = result.assets[0]
    await addFiles([{ uri: asset.uri, name: asset.fileName || `answer-scan-${Date.now()}.jpg`, type: fileTypeFromName(asset.fileName || '', asset.mimeType), size: asset.fileSize, file: asset.file }])
  }

  const previewFileItem = async (file: ScanUploadFile) => {
    const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) return setPreviewFile(file)
    if (Platform.OS === 'web') {
      const blobUrl = file.file ? URL.createObjectURL(file.file) : file.uri
      if (!window.open(blobUrl, '_blank')) setFileIssue('Allow pop-ups to preview this PDF, or open it from your device files.')
      return
    }
    try {
      if (!(await Sharing.isAvailableAsync())) return setFileIssue('PDF preview is not available on this device.')
      await Sharing.shareAsync(file.uri, { dialogTitle: `Preview ${file.name}`, mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })
    } catch (error) { setFileIssue(extractDetail(error, 'Unable to open this PDF.')) }
  }

  const replaceFileAt = async (index: number) => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], multiple: false, copyToCacheDirectory: true })
    if (result.canceled || !result.assets?.length) return
    setBusyFileIndex(index)
    try {
      const replacement = await persistScanUploadFile(fromDocumentAsset(result.assets[0]), userId || 'anonymous')
      const outcome = replaceScanFile(files, index, replacement)
      if (outcome.rejected.length) {
        deletePersistedScanUploadFile(replacement, userId || 'anonymous')
        setFileIssue(uploadIssueMessage(outcome.rejected))
        return
      }
      deletePersistedScanUploadFile(files[index], userId || 'anonymous')
      setFiles(outcome.files)
      setFileIssue(null)
    } catch (error) { setFileIssue(extractDetail(error, 'This page could not be replaced.')) }
    finally { setBusyFileIndex(null) }
  }

  const rotateFileAt = async (index: number) => {
    const file = files[index]
    if (!file || file.type.includes('pdf')) return
    setBusyFileIndex(index)
    setFileIssue(null)
    try {
      const format = file.type.includes('png') ? SaveFormat.PNG : SaveFormat.JPEG
      const rotated = await manipulateAsync(file.uri, [{ rotate: 90 }], { compress: 0.9, format })
      const deviceFile = new ExpoFile(rotated.uri)
      let browserFile: globalThis.File | undefined
      let rotatedSize = deviceFile.size
      if (Platform.OS === 'web') {
        const blob = await fetch(rotated.uri).then((response) => response.blob())
        browserFile = new globalThis.File([blob], file.name, { type: file.type })
        rotatedSize = blob.size
      }
      const persisted = await persistScanUploadFile({ ...file, uri: rotated.uri, size: rotatedSize, file: browserFile }, userId || 'anonymous')
      deletePersistedScanUploadFile(file, userId || 'anonymous')
      setFiles((current) => current.map((item, itemIndex) => itemIndex === index ? persisted : item))
    } catch (error) { setFileIssue(extractDetail(error, 'This page could not be rotated.')) }
    finally { setBusyFileIndex(null) }
  }

  const removeFileAt = (index: number) => {
    if (files[index]) deletePersistedScanUploadFile(files[index], userId || 'anonymous')
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setFileIssue(null)
    setPendingRemovalIndex(null)
  }

  if (optionsQuery.isLoading || !draftHydrated) {
    return <AppScreen scroll={false} protectedChrome contentStyle={styles.center}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>Preparing scan upload</Text></AppScreen>
  }
  if (optionsQuery.isError || !options) {
    return <AppScreen scroll={false} protectedChrome contentStyle={styles.center}><ErrorState title="Scan upload unavailable" message={extractDetail(optionsQuery.error, 'Unable to load upload options.')} onAction={() => void optionsQuery.refetch()} /></AppScreen>
  }

  const assessmentComplete = assessmentSelected && Boolean(effectiveSubjectId)
  const identityComplete = isStudentRole(role) ? assessmentComplete : assessmentComplete && Boolean(selectedStudentId)
  const phaseCopy: Record<ScanUploadPhase, string> = {
    preparing: 'Preparing your pages…', uploading: 'Uploading pages securely…', confirming: 'Upload sent. Waiting for confirmation…', checking: 'Pages received. Checking continues in the background…',
  }
  const uploadLocked = uploadMutation.isPending || Boolean(pendingUpload)

  return (
    <View style={styles.root}>
    <AppScreen protectedChrome contentStyle={styles.screen} refreshControl={<RefreshControl refreshing={optionsQuery.isRefetching} onRefresh={optionsQuery.refetch} tintColor={colors.accent} colors={[colors.accent]} />}>
      <GradientHeroCard
        eyebrow="SCAN UPLOAD"
        title="Upload an answer sheet"
        subtitle="Link the right assessment, confirm the student, then arrange the pages exactly as they should be read."
        style={styles.hero}
      />

      <SectionHeading title="Upload flow" subtitle="Complete each step before sending the pages for checking." />

      {draftRestored ? (
        <View style={styles.restoredBanner}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.success} />
          <View style={styles.bannerCopy}><Text style={styles.bannerTitle}>Your unfinished upload was restored</Text><Text style={styles.bannerText}>Selections and saved pages stayed on this device.</Text></View>
          <Pressable accessibilityLabel="Dismiss restored upload message" onPress={() => setDraftRestored(false)} style={styles.bannerClose}><Ionicons name="close" size={18} color={colors.textMuted} /></Pressable>
        </View>
      ) : null}

      <View style={styles.workflowSurface}>
      <View style={styles.stepCard}>
        <StepHeader number={1} title="Choose paper or exam" complete={assessmentComplete} />
        <SelectField label="Assessment" value={selectedAssessmentKey} placeholder={assessmentOptions.length ? 'Choose paper or exam' : 'No eligible assessments'} options={assessmentOptions} disabled={!assessmentOptions.length || uploadLocked} onChange={(value) => {
          setUploadError(null); setRecoveredPaper(null); setSelectedStudentId('')
          if (value.startsWith('paper:')) {
            const paperId = value.slice('paper:'.length); const paper = options.papers.find((item) => item.id === paperId)
            setStaffUploadMode('custom_paper'); setSelectedPaperId(paperId); setSelectedExamId(''); setSelectedSubjectId(paper?.subject_id || '')
          } else {
            const examId = value.slice('exam:'.length); const exam = options.exams.find((item) => item.id === examId)
            setStaffUploadMode('ai_generation_system'); setSelectedExamId(examId); setSelectedPaperId(''); setSelectedSubjectId(exam?.subject_id || '')
          }
        }} />
        {assessmentSelected ? <View style={styles.inferredRow}><Ionicons name={effectiveSubjectId ? 'checkmark-circle' : 'alert-circle'} size={18} color={effectiveSubjectId ? colors.success : colors.warning} /><Text style={styles.inferredText}>{assessmentSubjectName ? `${assessmentSubjectName} inferred from the assessment` : 'This assessment needs a subject before upload'}</Text></View> : null}
        {needsSubjectChoice ? <SelectField label="Subject" value={selectedSubjectId} placeholder="Choose subject" options={subjectOptions} onChange={setSelectedSubjectId} /> : null}
      </View>

      <View style={[styles.stepCard, styles.stepDivider, !assessmentComplete && styles.stepCardLocked]}>
        <StepHeader number={2} title="Confirm student" complete={identityComplete} />
        {!assessmentComplete ? <Text style={styles.lockedCopy}>Choose the assessment first so Eduraa can show the correct roster.</Text> : isStudentRole(role) ? (
          <View style={styles.identityRow}><Ionicons name="person-circle-outline" size={24} color={colors.accent} /><Text style={styles.identityText}>{user?.display_name || user?.identifier || 'Your account'}</Text></View>
        ) : <SelectField label="Student" value={selectedStudentId} placeholder={studentOptions.length ? 'Choose student' : 'No eligible students for this assessment'} options={studentOptions} disabled={!studentOptions.length || uploadLocked} onChange={setSelectedStudentId} />}
      </View>

      <View style={[styles.stepCard, styles.stepDivider, !identityComplete && styles.stepCardLocked]}>
        <StepHeader number={3} title="Add and arrange pages" complete={identityComplete && files.length > 0 && !fileIssue} />
        {!identityComplete ? <Text style={styles.lockedCopy}>Confirm the assessment and student before adding pages.</Text> : <>
          <Text style={styles.pageHelp}>The order below becomes page order. Use arrows to fix it before uploading.</Text>
          <View style={styles.pickGrid}>
            <Pressable accessibilityRole="button" accessibilityLabel="Capture page with camera" disabled={uploadLocked} onPress={capturePhoto} style={({ pressed }) => [styles.pickTile, pressed && styles.pressed]}><Ionicons name="camera" size={22} color={colors.accent} /><Text style={styles.pickTitle}>Camera</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Add images from gallery" disabled={uploadLocked} onPress={pickGallery} style={({ pressed }) => [styles.pickTile, pressed && styles.pressed]}><Ionicons name="images" size={22} color={colors.accent} /><Text style={styles.pickTitle}>Gallery</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Add PDF or images from files" disabled={uploadLocked} onPress={pickDocuments} style={({ pressed }) => [styles.pickTile, pressed && styles.pressed]}><Ionicons name="folder-open" size={22} color={colors.accent} /><Text style={styles.pickTitle}>Files</Text></Pressable>
          </View>
          <Text style={styles.limitCopy}>Up to 20 files · 50 MB each · 100 MB combined. PDF page count is verified securely after upload.</Text>
          {fileIssue ? <View accessibilityRole="alert" style={styles.issueBanner}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><Text style={styles.issueText}>{fileIssue}</Text></View> : null}
          {!files.length ? <View style={styles.emptyPages}><Ionicons name="documents-outline" size={26} color={colors.textSubtle} /><Text style={styles.emptyTitle}>No pages added yet</Text><Text style={styles.emptyText}>Add one PDF or ordered page images.</Text></View> : (
            <View style={styles.fileList}>{files.map((file, index) => <FileCard key={`${file.uri}-${index}`} file={file} index={index} count={files.length} busy={busyFileIndex === index} onPreview={() => void previewFileItem(file)} onMove={(offset) => setFiles((current) => moveScanFile(current, index, index + offset))} onReplace={() => void replaceFileAt(index)} onRotate={() => void rotateFileAt(index)} onRemove={() => setPendingRemovalIndex(index)} />)}</View>
          )}
        </>}
      </View>
      </View>

    </AppScreen>

      <View style={[styles.submitDock, { bottom: layout.bottomTabHeight + insets.bottom }]}>
        <View style={[styles.submitSurface, uploadMutation.isPending && styles.submitSurfaceActive, uploadError && !pendingUpload && styles.submitSurfaceError]}>
          {uploadError ? <>
            <View style={styles.submitStatusRow}><View style={[styles.submitStatusIcon, (pendingUpload || recoveredPaper) ? styles.submitStatusIconReady : styles.submitStatusIconError]}><Ionicons name={pendingUpload ? 'time-outline' : recoveredPaper ? 'shield-checkmark' : 'cloud-offline-outline'} size={18} color={(pendingUpload || recoveredPaper) ? colors.success : colors.danger} /></View><View style={styles.submitCopy}><Text style={styles.submitTitle}>{pendingUpload ? 'Upload received safely' : recoveredPaper ? 'Upload found safely' : 'Upload needs attention'}</Text><Text style={styles.submitErrorText} numberOfLines={2}>{uploadError}</Text></View></View>
            {pendingUpload ? <AnimatedButton label="Resume checking" onPress={() => startUpload(pendingUpload)} /> : recoveredPaper ? <AnimatedButton label="Open upload status" onPress={() => openPaperStatus(recoveredPaper)} /> : <AnimatedButton label="Try upload again" variant="secondary" disabled={!readiness.ready} onPress={() => startUpload()} />}
          </> : <>
            <View style={styles.submitStatusRow}>
              <View style={[styles.submitStatusIcon, readiness.ready && styles.submitStatusIconReady]}><Ionicons name={readiness.ready ? 'shield-checkmark' : 'lock-closed-outline'} size={18} color={readiness.ready ? colors.success : colors.textMuted} /></View>
              <View style={styles.submitCopy}><Text style={styles.submitTitle}>{uploadPhase ? phaseCopy[uploadPhase] : readiness.message}</Text><Text style={styles.submitMeta}>{files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'} · ${formatBytes(files.reduce((sum, file) => sum + (file.size ?? 0), 0))}` : 'Your draft is saved on this device.'}</Text></View>
            </View>
            {uploadMutation.isPending ? uploadPhase === 'confirming' ? <AnimatedButton label="Confirming receipt…" variant="ghost" disabled onPress={() => undefined} /> : uploadPhase === 'checking' ? null : <AnimatedButton label="Cancel upload" variant="ghost" onPress={() => uploadControllerRef.current?.abort()} /> : <AnimatedButton label="Upload answer sheet" disabled={!readiness.ready} onPress={() => startUpload()} />}
          </>}
        </View>
      </View>

      <Modal visible={pendingRemovalIndex !== null} transparent animationType="slide" onRequestClose={() => setPendingRemovalIndex(null)}>
        <Pressable style={styles.removalBackdrop} onPress={() => setPendingRemovalIndex(null)} accessibilityLabel="Dismiss remove page confirmation">
          <Pressable style={[styles.removalSheet, { paddingBottom: insets.bottom + spacing[5] }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.removalHandle} />
            <View style={styles.removalIcon}><Ionicons name="trash-outline" size={22} color={colors.danger} /></View>
            <Text style={styles.removalTitle}>Remove page {pendingRemovalIndex === null ? '' : pendingRemovalIndex + 1}?</Text>
            <Text style={styles.removalText} numberOfLines={2}>{pendingRemovalIndex === null ? '' : files[pendingRemovalIndex]?.name} will leave this upload draft. You can add it again later.</Text>
            <View style={styles.removalActions}>
              <AnimatedButton label="Keep page" variant="ghost" onPress={() => setPendingRemovalIndex(null)} style={styles.removalAction} />
              <Pressable accessibilityRole="button" accessibilityLabel="Confirm remove page" onPress={() => pendingRemovalIndex !== null && removeFileAt(pendingRemovalIndex)} style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}><Text style={styles.removeButtonText}>Remove page</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(previewFile)} transparent animationType="fade" onRequestClose={() => setPreviewFile(null)}><Pressable style={styles.previewBackdrop} onPress={() => setPreviewFile(null)} accessibilityLabel="Dismiss preview"><View style={[styles.previewHeader, { paddingTop: insets.top + spacing[3] }]}><Text style={styles.previewTitle} numberOfLines={1}>{previewFile?.name}</Text><View style={styles.previewClose}><Ionicons name="close" size={20} color={colors.textOnBrand} /></View></View>{previewFile ? <Image source={{ uri: previewFile.uri }} style={styles.previewImage} resizeMode="contain" /> : null}</Pressable></Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { gap: spacing[5], paddingBottom: spacing[20] + spacing[16] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3] },
  loadingText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 14 },
  hero: { marginTop: spacing[1] },
  restoredBanner: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderWidth: 1, borderColor: colors.successBorder, borderRadius: radius.lg, backgroundColor: colors.successSurface, padding: spacing[3] },
  bannerCopy: { flex: 1, gap: 2 }, bannerTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 13 }, bannerText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 }, bannerClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  workflowSurface: { gap: spacing[3] },
  stepCard: { gap: spacing[4], padding: spacing[4], borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, ...shadows.sm }, stepDivider: { borderTopWidth: 1, borderTopColor: colors.border }, stepCardLocked: { opacity: 0.72 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] }, stepNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurfaceStrong }, stepNumberComplete: { backgroundColor: colors.success }, stepNumberText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 13 }, stepTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 18 },
  lockedCopy: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  inferredRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing[2], borderRadius: radius.md, backgroundColor: colors.backgroundMuted, paddingHorizontal: spacing[3] }, inferredText: { flex: 1, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  identityRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderRadius: radius.lg, backgroundColor: colors.backgroundMuted, paddingHorizontal: spacing[4] }, identityText: { color: colors.text, fontFamily: typography.fonts.bodySemibold, fontSize: 15 },
  pageHelp: { color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 19 }, pickGrid: { flexDirection: 'row', gap: spacing[1], borderRadius: radius.md, backgroundColor: colors.backgroundMuted, padding: spacing[1] }, pickTile: { flex: 1, minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderRadius: radius.sm, backgroundColor: 'transparent' }, pickTitle: { color: colors.text, fontFamily: typography.fonts.bodySemibold, fontSize: 12 }, limitCopy: { color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 17 },
  issueBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: radius.md, backgroundColor: colors.dangerSurface, padding: spacing[3] }, issueText: { flex: 1, color: colors.danger, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  emptyPages: { alignItems: 'center', gap: spacing[1], paddingVertical: spacing[6] }, emptyTitle: { color: colors.text, fontFamily: typography.fonts.bodySemibold, fontSize: 14 }, emptyText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  fileList: { gap: spacing[5], borderLeftWidth: 3, borderLeftColor: colors.accent, marginLeft: 48, paddingLeft: spacing[4] }, fileCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], paddingTop: spacing[2], marginLeft: -67 }, thumbnailButton: { width: 104, height: 134, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.backgroundElevated, borderRadius: radius.md, backgroundColor: colors.backgroundMuted, shadowColor: colors.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 9, elevation: 3 }, fileThumbnail: { width: '100%', height: '100%' }, pageBadge: { position: 'absolute', top: spacing[2], left: spacing[2], minWidth: 28, height: 28, paddingHorizontal: spacing[1], borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentStrong }, pageBadgeText: { color: colors.textOnBrand, fontFamily: typography.fonts.bodyBold, fontSize: 12 }, fileBody: { flex: 1, gap: spacing[1], paddingTop: spacing[1] }, pageHeadingRow: { gap: spacing[2] }, pageHeadingCopy: { gap: 1 }, pagePosition: { color: colors.accentStrong, fontFamily: typography.fonts.bodySemibold, fontSize: 10 }, fileTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 18 }, fileMeta: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10 }, orderControls: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 1 }, fileActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginTop: spacing[1] }, iconAction: { minWidth: 72, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: spacing[1], paddingHorizontal: spacing[1], backgroundColor: 'transparent' }, iconActionDanger: { backgroundColor: 'transparent' }, iconActionText: { color: colors.accentStrong, fontFamily: typography.fonts.bodySemibold, fontSize: 11 }, iconActionTextDanger: { color: colors.danger }, iconActionDisabled: { opacity: 0.5 },
  submitDock: { position: 'absolute', left: spacing[4], right: spacing[4] }, submitSurface: { gap: spacing[3], borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.backgroundElevated, padding: spacing[3] }, submitSurfaceActive: { borderColor: colors.borderBrand, backgroundColor: colors.accentSurface }, submitSurfaceError: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerSurface }, submitStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] }, submitStatusIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundMuted }, submitStatusIconReady: { backgroundColor: colors.successSurface }, submitStatusIconError: { backgroundColor: colors.palette.rose[100] }, submitCopy: { flex: 1, gap: spacing[1] }, submitTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 15, lineHeight: 20 }, submitMeta: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 }, submitErrorText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 17 },
  removalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(7,21,45,0.58)' }, removalSheet: { gap: spacing[3], borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.backgroundElevated, paddingHorizontal: spacing[5], paddingTop: spacing[3] }, removalHandle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: colors.borderStrong }, removalIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSurface }, removalTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 20 }, removalText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 19 }, removalActions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] }, removalAction: { flex: 1 }, removeButton: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.danger }, removeButtonText: { color: colors.textOnBrand, fontFamily: typography.fonts.bodyBold, fontSize: 14 },
  previewBackdrop: { flex: 1, backgroundColor: '#07152DEE' }, previewHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingBottom: spacing[3] }, previewTitle: { flex: 1, color: colors.textOnBrand, fontFamily: typography.fonts.bodySemibold, fontSize: 14 }, previewClose: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }, previewImage: { flex: 1, width: '100%' as const }, pressed: { opacity: 0.72 },
})
