import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import { TextInputField } from '../../components/ui/TextInputField'
import type { PapersStackParamList } from '../../navigation'
import { colors } from '../../theme/colors'
import { fonts } from '../../theme/fonts'
import { layout, radius, spacing } from '../../theme/spacing'
import {
  createIdempotencyKey,
  describeManifest,
} from './customPaperModel'
import { resolvePaperScope } from './generatePaperSettingsModel'

type Nav = NativeStackNavigationProp<PapersStackParamList, 'CustomPaper'>

const POLL_INTERVAL_MS = 2500

function extractDetail(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response
    ?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item: any) => item?.msg ?? String(item)).join('\n')
  }
  return (error as { message?: string })?.message || fallback
}

function FilePicker({
  label,
  hint,
  file,
  onPick,
}: {
  label: string
  hint: string
  file: CustomPaperFile | null
  onPick: () => void
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Choose ${label}`}
      activeOpacity={0.88}
      onPress={onPick}
      style={[styles.fileRow, file && styles.fileRowFilled]}
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
          {file ? file.name : hint}
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
  const [manifest, setManifest] = useState<PaperManifestVersion | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reused across retries so a repeated upload never creates a second draft.
  const uploadKeyRef = useRef(createIdempotencyKey())
  const paperIdRef = useRef<string | null>(null)

  const { data: options } = useQuery({
    queryKey: ['paper-options'],
    queryFn: papersApi.getOptions,
  })

  const scope = resolvePaperScope(options ?? {}, {
    standard,
    division,
    subjectId,
  })

  useEffect(() => {
    if (!options) return
    if (scope.selection.standard !== standard) setStandard(scope.selection.standard)
    if (scope.selection.division !== division) setDivision(scope.selection.division)
    if (scope.selection.subjectId !== subjectId) setSubjectId(scope.selection.subjectId)
  }, [division, options, scope, standard, subjectId])

  const review = describeManifest(manifest)

  const pickPdf = useCallback(
    async (onPicked: (file: CustomPaperFile) => void) => {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      })
      if (result.canceled || !result.assets?.length) return
      const asset = result.assets[0]
      onPicked({
        uri: asset.uri,
        name: asset.name || `paper-${Date.now()}.pdf`,
        type: asset.mimeType || 'application/pdf',
        file: asset.file,
      })
    },
    [],
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
        if (!cancelled) setManifest(latest)
      } catch {
        // A dropped poll is recoverable; the next tick retries.
      }
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [review.isPolling])

  const detailsDone = Boolean(titleLine1.trim() && subjectId)
  const filesDone = Boolean(questionPaper && answerKey)

  const handleUpload = async () => {
    if (!detailsDone || !filesDone || !questionPaper || !answerKey) return
    setBusy(true)
    setError(null)
    try {
      const created = await paperManifestsApi.createDraft({
        subjectId,
        titleLine1: titleLine1.trim(),
        idempotencyKey: uploadKeyRef.current,
        standard: standard || undefined,
        division: division || undefined,
        questionPaper,
        answerKey,
      })
      paperIdRef.current = created.paper_id
      setManifest(created)
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
      await queryClient.invalidateQueries({ queryKey: SCAN_UPLOAD_OPTIONS_QUERY_KEY })
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
                label="Title"
                value={titleLine1}
                onChangeText={setTitleLine1}
                placeholder="Class Test (Std 10 A)"
              />
              <Text style={styles.cardHint}>
                {scope.selection.standard || 'Standard'} ·{' '}
                {scope.selection.division || 'Division'} ·{' '}
                {scope.subjects.find((item) => item.id === subjectId)?.name ??
                  'Select a subject'}
              </Text>
              <View style={styles.subjectRow}>
                {scope.subjects.map((subject) => {
                  const active = subject.id === subjectId
                  return (
                    <TouchableOpacity
                      key={subject.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      activeOpacity={0.88}
                      onPress={() => setSubjectId(subject.id)}
                      style={[styles.subjectChip, active && styles.subjectChipOn]}
                    >
                      <Text
                        style={[
                          styles.subjectChipText,
                          active && styles.subjectChipTextOn,
                        ]}
                      >
                        {subject.name}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Add your two PDFs</Text>
              <FilePicker
                label="Question paper PDF"
                hint="The paper students will answer"
                file={questionPaper}
                onPick={() => void pickPdf(setQuestionPaper)}
              />
              <FilePicker
                label="Answer key PDF"
                hint="Official answers and marking key"
                file={answerKey}
                onPick={() => void pickPdf(setAnswerKey)}
              />
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

        {review.phase === 'confirmed' ? null : manifest ? (
          <PrimaryButton
            label={
              review.phase === 'failed'
                ? 'Retry extraction'
                : review.isPolling
                  ? 'Reading PDFs…'
                  : 'Confirm question map'
            }
            loading={busy || review.isPolling}
            disabled={busy || review.isPolling}
            onPress={review.phase === 'failed' ? handleRetry : handleConfirm}
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
  subjectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  subjectChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subjectChipOn: {
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentSoft,
  },
  subjectChipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  subjectChipTextOn: { color: colors.accentStrong },
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
})
