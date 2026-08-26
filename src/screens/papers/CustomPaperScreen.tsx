import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { papersApi } from '../../api/papers'
import { SCAN_UPLOAD_OPTIONS_QUERY_KEY } from '../../api/scanUpload'
import {
  paperManifestsApi,
  type CustomPaperFile,
  type PaperManifestVersion,
} from '../../api/paperManifests'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { Screen } from '../../components/ui/Screen'
import { SelectField } from '../../components/ui/SelectField'
import { TextInputField } from '../../components/ui/TextInputField'
import type { PapersStackParamList } from '../../navigation'
import { colors } from '../../theme/colors'
import { fonts } from '../../theme/fonts'
import { layout, radius, spacing } from '../../theme/spacing'
import {
  customPaperDraftFingerprint,
  customPaperFilesMatch,
  createIdempotencyKey,
  describeManifest,
  formatCustomPaperFileSize,
  validateCustomPaperFile,
} from './customPaperModel'
import { resolvePaperScope } from './generatePaperSettingsModel'

type Nav = NativeStackNavigationProp<PapersStackParamList, 'CustomPaper'>

const POLL_INTERVAL_MS = 2500

type FileRole = 'questionPaper' | 'answerKey'

function formatStandardLabel(value: string) {
  const normalized = value.replace(/^std\.?\s*/i, '').trim()
  return /^\d+$/.test(normalized) ? `Std ${normalized}` : value
}

function extractDetail(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response
    ?.data?.detail
  if (typeof detail === 'string') return detail
  if (
    detail &&
    typeof detail === 'object' &&
    'message' in detail &&
    typeof detail.message === 'string'
  ) {
    return detail.message
  }
  if (Array.isArray(detail)) {
    return detail.map((item: any) => item?.msg ?? String(item)).join('\n')
  }
  return (error as { message?: string })?.message || fallback
}

function FilePicker({
  label,
  hint,
  file,
  error,
  onPick,
}: {
  label: string
  hint: string
  file: CustomPaperFile | null
  error?: string
  onPick: () => void
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Choose ${label}`}
      accessibilityHint={file ? 'Replaces the currently selected PDF' : hint}
      accessibilityState={{ selected: Boolean(file) }}
      activeOpacity={0.88}
      onPress={onPick}
      style={[styles.fileRow, file && styles.fileRowFilled, error && styles.fileRowError]}
    >
      <View style={[styles.fileIcon, file && styles.fileIconFilled]}>
        <Ionicons
          name={file ? 'checkmark-circle' : 'document-attach-outline'}
          size={20}
          color={file ? colors.success : colors.accentStrong}
        />
      </View>
      <View style={styles.fileCopy}>
        <Text style={styles.fileLabel}>{label}</Text>
        <Text style={styles.fileHint} numberOfLines={1}>
          {file ? `${file.name} · ${formatCustomPaperFileSize(file.size)}` : hint}
        </Text>
      </View>
      <Text style={styles.fileAction}>{file ? 'Change' : 'Choose'}</Text>
    </TouchableOpacity>
  )
}

export default function CustomPaperScreen() {
  const navigation = useNavigation<Nav>()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()

  const [titleLine1, setTitleLine1] = useState('')
  const [standard, setStandard] = useState('')
  const [division, setDivision] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [questionPaper, setQuestionPaper] = useState<CustomPaperFile | null>(null)
  const [answerKey, setAnswerKey] = useState<CustomPaperFile | null>(null)
  const [fileErrors, setFileErrors] = useState<Partial<Record<FileRole, string>>>({})
  const [manifest, setManifest] = useState<PaperManifestVersion | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pollingError, setPollingError] = useState<string | null>(null)

  // Reuse the key for a retry of the same draft, but rotate it whenever the
  // teacher changes the class, subject, title, or either source file.
  const uploadRequestRef = useRef<{ fingerprint: string; key: string } | null>(null)
  const paperIdRef = useRef<string | null>(null)

  const optionsQuery = useQuery({
    queryKey: ['paper-options'],
    queryFn: papersApi.getOptions,
  })
  const options = optionsQuery.data

  const scope = useMemo(
    () => resolvePaperScope(options ?? {}, { standard, division, subjectId }),
    [division, options, standard, subjectId],
  )

  useEffect(() => {
    if (!options) return
    if (scope.selection.standard !== standard) setStandard(scope.selection.standard)
    if (scope.selection.division !== division) setDivision(scope.selection.division)
    if (scope.selection.subjectId !== subjectId) setSubjectId(scope.selection.subjectId)
  }, [
    division,
    options,
    scope.selection.division,
    scope.selection.standard,
    scope.selection.subjectId,
    standard,
    subjectId,
  ])

  const review = describeManifest(manifest)

  const pickPdf = useCallback(
    async (role: FileRole) => {
      const label = role === 'questionPaper' ? 'Question paper' : 'Answer key'
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/pdf',
          copyToCacheDirectory: true,
        })
        if (result.canceled || !result.assets?.length) return
        const asset = result.assets[0]
        const picked: CustomPaperFile = {
          uri: asset.uri,
          name: asset.name || `paper-${Date.now()}.pdf`,
          type: asset.mimeType || 'application/pdf',
          size: asset.size,
          lastModified: asset.lastModified,
          file: asset.file,
        }
        const otherFile = role === 'questionPaper' ? answerKey : questionPaper
        const existingFile = role === 'questionPaper' ? questionPaper : answerKey
        const fileError =
          validateCustomPaperFile(picked, label) ??
          (otherFile && customPaperFilesMatch(picked, otherFile)
            ? 'Question paper and answer key must be different PDF files.'
            : null)
        if (fileError) {
          if (existingFile) {
            setFileErrors((current) => ({ ...current, [role]: undefined }))
            setError(`${fileError} Your previous ${label.toLowerCase()} is still selected.`)
          } else {
            setFileErrors((current) => ({ ...current, [role]: fileError }))
          }
          return
        }
        setFileErrors((current) => ({ ...current, [role]: undefined }))
        if (role === 'questionPaper') setQuestionPaper(picked)
        else setAnswerKey(picked)
        setError(null)
      } catch {
        const existingFile = role === 'questionPaper' ? questionPaper : answerKey
        if (existingFile) {
          setError(`The file picker could not open. Your previous ${label.toLowerCase()} is still selected.`)
        } else {
          setFileErrors((current) => ({
            ...current,
            [role]: 'The file picker could not open. Please try again.',
          }))
        }
      }
    },
    [answerKey, questionPaper],
  )

  // The worker keeps extracting after the request returns, so the draft is
  // polled until it is reviewable, failed, or already confirmed.
  useEffect(() => {
    if (!review.isPolling || !paperIdRef.current) return
    let cancelled = false
    const timer = setInterval(async () => {
      const paperId = paperIdRef.current
      if (!paperId) return
      try {
        const latest = await paperManifestsApi.get(paperId)
        if (!cancelled) {
          setPollingError(null)
          setManifest((current) =>
            !current || latest.revision >= current.revision ? latest : current,
          )
        }
      } catch {
        if (!cancelled) {
          setPollingError('Progress could not refresh yet. Eduraa will keep trying.')
        }
      }
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [review.isPolling])

  const detailsDone = Boolean(
    titleLine1.trim() && standard.trim() && division.trim() && subjectId.trim(),
  )
  const filesDone = Boolean(
    questionPaper && answerKey && !fileErrors.questionPaper && !fileErrors.answerKey,
  )

  const handleUpload = async () => {
    if (!detailsDone || !filesDone || !questionPaper || !answerKey) return
    setBusy(true)
    setError(null)
    try {
      const fingerprint = customPaperDraftFingerprint({
        titleLine1,
        standard,
        division,
        subjectId,
        questionPaper,
        answerKey,
      })
      if (
        !uploadRequestRef.current ||
        uploadRequestRef.current.fingerprint !== fingerprint
      ) {
        uploadRequestRef.current = { fingerprint, key: createIdempotencyKey() }
      }
      const created = await paperManifestsApi.createDraft({
        subjectId,
        titleLine1: titleLine1.trim(),
        idempotencyKey: uploadRequestRef.current.key,
        standard: standard.trim(),
        division: division.trim(),
        questionPaper,
        answerKey,
      })
      paperIdRef.current = created.paper_id
      setManifest(created)
      void queryClient.invalidateQueries({ queryKey: ['papers'] })
    } catch (uploadError) {
      setError(
        extractDetail(
          uploadError,
          'Both PDFs are still selected. The upload could not be started.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleRetry = async () => {
    if (!paperIdRef.current) return
    setBusy(true)
    setError(null)
    try {
      setManifest(await paperManifestsApi.retryExtraction(paperIdRef.current))
    } catch (retryError) {
      setError(extractDetail(retryError, 'Extraction could not be restarted.'))
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = async () => {
    if (!manifest) return
    setBusy(true)
    setError(null)
    try {
      const confirmed = await paperManifestsApi.confirm(
        manifest,
        createIdempotencyKey(),
      )
      setManifest(confirmed)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SCAN_UPLOAD_OPTIONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['papers'] }),
        queryClient.invalidateQueries({ queryKey: ['exams', 'papers'] }),
      ])
      Alert.alert(
        'Paper ready',
        'The question map is confirmed. You can now publish it or attach student work.',
        [
          {
            text: 'Open paper',
            onPress: () =>
              navigation.replace('PaperDetail', { paperId: confirmed.paper_id }),
          },
        ],
      )
    } catch (confirmError) {
      setError(
        extractDetail(
          confirmError,
          'This question map changed since you reviewed it. Reload and confirm again.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.root}>
      <Screen
        keyboardShouldPersistTaps="handled"
        contentStyle={{
          ...styles.content,
          paddingBottom: layout.bottomTabHeight + insets.bottom + spacing[10],
        }}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>CUSTOM PAPER</Text>
          <Text style={styles.title}>Upload a school paper for grading</Text>
          <Text style={styles.body}>
            Add the class and subject, then upload the school question paper and
            answer key as separate PDFs.
          </Text>
        </View>

        {manifest ? (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              {review.isPolling ? (
                <ActivityIndicator size="small" color={colors.accentStrong} />
              ) : (
                <Ionicons
                  name={
                    review.phase === 'failed'
                      ? 'alert-circle'
                      : review.phase === 'confirmed'
                        ? 'checkmark-circle'
                        : 'sparkles'
                  }
                  size={18}
                  color={
                    review.phase === 'failed' ? colors.danger : colors.accentStrong
                  }
                />
              )}
              <Text style={styles.statusTitle}>
                {review.phase === 'extracting'
                  ? 'Reading your PDFs'
                  : review.phase === 'failed'
                    ? 'Extraction failed'
                    : review.phase === 'confirmed'
                      ? 'Question map confirmed'
                      : 'Review the question map'}
              </Text>
            </View>
            <Text style={styles.statusBody}>
              {review.phase === 'extracting'
                ? 'Both originals are stored safely. This keeps running if you leave the screen.'
                : review.phase === 'failed'
                  ? 'Your uploads are intact. Retry extraction without re-picking the files.'
                  : `${review.questionCount} questions${
                      review.totalMarks !== null
                        ? ` · ${review.totalMarks} marks`
                        : ''
                    }`}
            </Text>

            {review.phase === 'needs_confirmation' ? (
              <View style={styles.metaRow}>
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>
                    {review.errorCount} errors
                  </Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>
                    {review.warningCount} warnings
                  </Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>
                    {review.unresolvedCount} unresolved
                  </Text>
                </View>
              </View>
            ) : null}

            {review.issues.length ? (
              <View style={styles.issues}>
                {review.issues.slice(0, 6).map((issue, index) => (
                  <View key={`${issue.code}-${index}`} style={styles.issueRow}>
                    <Ionicons
                      name={
                        issue.severity === 'warning'
                          ? 'warning-outline'
                          : 'close-circle-outline'
                      }
                      size={15}
                      color={
                        issue.severity === 'warning' ? colors.warning : colors.danger
                      }
                    />
                    <Text style={styles.issueText}>{issue.message}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <ScrollView style={styles.preview} nestedScrollEnabled>
              {(manifest.occurrences ?? []).slice(0, 40).map((item) => (
                <View key={item.id} style={styles.question}>
                  <View style={styles.questionTop}>
                    <Text style={styles.questionLabel}>{item.display_label}</Text>
                    {item.max_marks ? (
                      <Text style={styles.questionMarks}>
                        {String(item.max_marks)} marks
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.questionText} numberOfLines={3}>
                    {item.question_content?.question_text ?? 'No question text found.'}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Paper details</Text>
              <TextInputField
                label="Title *"
                value={titleLine1}
                onChangeText={(value) => {
                  setTitleLine1(value)
                  setError(null)
                }}
                placeholder="Class Test (Std 10 A)"
                maxLength={200}
                returnKeyType="done"
              />
              <View style={styles.classFields}>
                <SelectField
                  label="Standard *"
                  value={standard}
                  placeholder={optionsQuery.isLoading ? 'Loading standards' : 'Choose standard'}
                  loading={optionsQuery.isLoading}
                  disabled={optionsQuery.isError || scope.standards.length === 0}
                  searchable={scope.standards.length > 8}
                  options={scope.standards.map((item) => ({
                    value: item,
                    label: formatStandardLabel(item),
                  }))}
                  onChange={(value) => {
                    setStandard(value)
                    setDivision('')
                    setSubjectId('')
                    setError(null)
                  }}
                />
                <SelectField
                  label="Division *"
                  value={division}
                  placeholder={standard ? 'Choose division' : 'Choose standard first'}
                  loading={optionsQuery.isLoading}
                  disabled={
                    optionsQuery.isError || !standard || scope.divisions.length === 0
                  }
                  searchable={scope.divisions.length > 8}
                  options={scope.divisions.map((item) => ({
                    value: item,
                    label: `Division ${item}`,
                  }))}
                  onChange={(value) => {
                    setDivision(value)
                    setSubjectId('')
                    setError(null)
                  }}
                />
              </View>
              <SelectField
                label="Subject *"
                value={subjectId}
                placeholder={division ? 'Choose subject' : 'Choose class first'}
                loading={optionsQuery.isLoading}
                disabled={
                  optionsQuery.isError ||
                  !standard ||
                  !division ||
                  scope.subjects.length === 0
                }
                searchable={scope.subjects.length > 8}
                options={scope.subjects.map((subject) => ({
                  value: subject.id,
                  label: subject.name,
                }))}
                onChange={(value) => {
                  setSubjectId(value)
                  setError(null)
                }}
              />
              <Text style={styles.cardHint}>
                Only classes and subjects assigned to you are shown. The paper will be saved to this class.
              </Text>
              {optionsQuery.isError ? (
                <View accessibilityLiveRegion="polite" style={styles.scopeState}>
                  <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
                  <View style={styles.scopeStateCopy}>
                    <Text style={styles.scopeStateTitle}>Class options could not load</Text>
                    <Text style={styles.scopeStateBody}>Your title is still here. Check the connection and retry.</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      activeOpacity={0.84}
                      disabled={optionsQuery.isFetching}
                      onPress={() => void optionsQuery.refetch()}
                      style={styles.retryButton}
                    >
                      {optionsQuery.isFetching ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Ionicons name="refresh" size={14} color={colors.white} />
                      )}
                      <Text style={styles.retryButtonText}>Try again</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : !optionsQuery.isLoading &&
                (!scope.standards.length ||
                  !scope.divisions.length ||
                  !scope.subjects.length) ? (
                <View accessibilityLiveRegion="polite" style={styles.scopeState}>
                  <Ionicons name="school-outline" size={18} color={colors.warning} />
                  <View style={styles.scopeStateCopy}>
                    <Text style={styles.scopeStateTitle}>Teaching scope needs attention</Text>
                    <Text style={styles.scopeStateBody}>
                      Ask your school administrator to assign a standard, division, and subject before creating this paper.
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Add your two PDFs</Text>
              <FilePicker
                label="Question paper PDF"
                hint="The paper students will answer"
                file={questionPaper}
                error={fileErrors.questionPaper}
                onPick={() => void pickPdf('questionPaper')}
              />
              {fileErrors.questionPaper ? (
                <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
                  {fileErrors.questionPaper}
                </Text>
              ) : null}
              <FilePicker
                label="Answer key PDF"
                hint="Official answers and marking key"
                file={answerKey}
                error={fileErrors.answerKey}
                onPick={() => void pickPdf('answerKey')}
              />
              {fileErrors.answerKey ? (
                <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
                  {fileErrors.answerKey}
                </Text>
              ) : null}
              <Text style={styles.note}>
                A simple school answer key is enough. Eduraa understands sections,
                sub-parts, internal choices, and descriptive answers.
              </Text>
            </View>
          </>
        )}

        {error ? (
          <View accessibilityLiveRegion="polite" style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {pollingError ? (
          <View accessibilityLiveRegion="polite" style={styles.pollingNotice}>
            <Ionicons name="cloud-offline-outline" size={17} color={colors.warning} />
            <Text style={styles.pollingNoticeText}>{pollingError}</Text>
          </View>
        ) : null}

        {!manifest && !detailsDone && !optionsQuery.isLoading && !optionsQuery.isError ? (
          <Text style={styles.readinessHint}>
            Choose the paper title, standard, division, and subject to continue.
          </Text>
        ) : null}

        {review.phase === 'confirmed' ? null : manifest ? (
          <PrimaryButton
            label={
              review.phase === 'failed'
                ? 'Retry extraction'
                : review.isPolling
                  ? 'Reading PDFs…'
                  : review.canRetry
                    ? 'Retry from saved PDFs'
                    : 'Confirm question map'
            }
            loading={busy || review.isPolling}
            disabled={
              busy || review.isPolling || (!review.canConfirm && !review.canRetry)
            }
            onPress={review.canRetry ? handleRetry : handleConfirm}
          />
        ) : (
          <PrimaryButton
            label={busy ? 'Uploading…' : 'Upload and continue'}
            loading={busy}
            disabled={!detailsDone || !filesDone || busy}
            onPress={handleUpload}
          />
        )}
      </Screen>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing[4], gap: spacing[4] },
  header: { gap: spacing[2] },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.accentStrong,
  },
  title: { fontFamily: fonts.displaySemibold, fontSize: 22, color: colors.text },
  body: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  card: {
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  cardTitle: {
    fontFamily: fonts.displaySemibold,
    fontSize: 15,
    color: colors.text,
  },
  cardHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  classFields: { gap: spacing[3] },
  scopeState: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundTint,
  },
  scopeStateCopy: { flex: 1, gap: spacing[1], alignItems: 'flex-start' },
  scopeStateTitle: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.text,
  },
  scopeStateBody: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  retryButton: {
    minHeight: 44,
    marginTop: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.full,
    backgroundColor: colors.accentStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  retryButtonText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  fileRowFilled: { borderColor: colors.success },
  fileRowError: { borderColor: colors.danger, backgroundColor: colors.dangerSurface },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  fileIconFilled: { backgroundColor: colors.backgroundElevated },
  fileCopy: { flex: 1, gap: 2 },
  fileLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  fileHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  fileAction: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.accentStrong,
  },
  fieldError: {
    marginTop: -spacing[2],
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.danger,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  statusTitle: {
    flex: 1,
    fontFamily: fonts.displaySemibold,
    fontSize: 15,
    color: colors.text,
  },
  statusBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  metaRow: { flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' },
  metaChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.full,
    backgroundColor: colors.card,
  },
  metaChipText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  issues: { gap: spacing[2] },
  issueRow: { flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' },
  issueText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  preview: { maxHeight: 320 },
  question: {
    gap: spacing[1],
    paddingVertical: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  questionTop: { flexDirection: 'row', justifyContent: 'space-between' },
  questionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.accentStrong,
  },
  questionMarks: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  questionText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
  error: {
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.card,
  },
  errorText: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger },
  pollingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.warningSurface,
  },
  pollingNoticeText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.warning,
  },
  readinessHint: {
    marginTop: -spacing[1],
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
})
