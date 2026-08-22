import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as Sharing from 'expo-sharing'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, GradientHeroCard, SelectField, SelectableChip } from '../../components/ui'
import { SCAN_UPLOAD_OPTIONS_QUERY_KEY, scanUploadApi, ScanUploadFile } from '../../api/scanUpload'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import type { Role } from '../../types'
import type { ScanUploadParams } from '../../navigation'
import {
  friendlyUploadError,
  isPaperAvailableForUploadMode,
  matchesStandardDivision,
  resolveScanUploadLink,
  resolveScanUploadStudentId,
  type StaffScanUploadMode,
} from './checkedPaperPipelineModel'

const MAX_SCAN_FILES = 20

function isStudentRole(role?: Role) {
  return role === 'student' || role === 'b2c_student'
}

function isStaffRole(role?: Role) {
  return !isStudentRole(role)
}

function optionLabel(parts: Array<string | number | null | undefined>) {
  return parts.filter((part) => part !== null && part !== undefined && String(part).trim()).join(' / ')
}

function fileTypeFromName(name: string, fallback?: string | null) {
  if (fallback) return fallback
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function fileSizeLabel(size?: number | null) {
  if (!size) return 'Ready'
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
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
  return fallback
}

function routeNames(nav: any): string[] {
  return nav?.getState?.().routeNames ?? []
}

function FileCard({
  file,
  index,
  onPreview,
  onRemove,
}: {
  file: ScanUploadFile
  index: number
  onPreview: () => void
  onRemove: () => void
}) {
  const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')

  return (
    <AnimatedCard style={styles.fileCard}>
      <View style={styles.fileIcon}>
        <Ionicons name={isPdf ? 'document-text' : 'image'} size={19} color={colors.accent} />
      </View>
      <View style={styles.fileCopy}>
        <Text style={styles.fileTitle} numberOfLines={1}>{file.name}</Text>
        <Text style={styles.fileMeta}>Page {index + 1} / {file.type}</Text>
      </View>
      <Pressable
        onPress={onPreview}
        accessibilityLabel={`Preview ${file.name}`}
        style={({ pressed }) => [styles.previewButton, pressed && styles.pressed]}
      >
        <Ionicons name="eye-outline" size={17} color={colors.accent} />
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityLabel={`Remove ${file.name}`}
        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
      >
        <Ionicons name="close" size={17} color={colors.danger} />
      </Pressable>
    </AnimatedCard>
  )
}

export default function ScanUploadScreen() {
  const route = useRoute<RouteProp<{ ScanUpload: ScanUploadParams }, 'ScanUpload'>>()
  const initial = route.params
  const navigation = useNavigation<any>()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const role = user?.role
  const [staffUploadMode, setStaffUploadMode] = useState<StaffScanUploadMode>('ai_generation_system')
  const [selectedPaperId, setSelectedPaperId] = useState(initial?.initialPaperId ?? '')
  const [selectedExamId, setSelectedExamId] = useState(initial?.initialExamId ?? '')
  const [selectedSubjectId, setSelectedSubjectId] = useState(initial?.initialSubjectId ?? '')
  const [selectedStudentId, setSelectedStudentId] = useState(initial?.initialStudentId ?? '')
  const [files, setFiles] = useState<ScanUploadFile[]>([])
  const [previewFile, setPreviewFile] = useState<ScanUploadFile | null>(null)
  const insets = useSafeAreaInsets()

  const optionsQuery = useQuery({
    queryKey: SCAN_UPLOAD_OPTIONS_QUERY_KEY,
    queryFn: scanUploadApi.getOptions,
  })

  const options = optionsQuery.data
  const selectedPaper = options?.papers.find((paper) => paper.id === selectedPaperId)
  const selectedExam = options?.exams.find((exam) => exam.id === selectedExamId)
  const effectiveSubjectId = selectedPaper?.subject_id || selectedSubjectId || selectedExam?.subject_id || null
  const staff = isStaffRole(role)
  // The roster selection is authoritative for staff uploads. Narrow the picker
  // to the standard/division of the selected paper or exam.
  const standardDivisionTarget = selectedPaper
    ? { standard: selectedPaper.standard, division: selectedPaper.division }
    : selectedExam
      ? { standard: selectedExam.standard, division: selectedExam.division }
      : null

  const paperOptions = useMemo(
    () =>
      (options?.papers ?? [])
        .filter((paper) => !staff || isPaperAvailableForUploadMode(paper.source_type, staffUploadMode))
        .map((paper) => ({
          value: paper.id,
          label: optionLabel([paper.title, paper.subject_name, paper.standard, paper.division]),
        })),
    [options?.papers, staff, staffUploadMode],
  )

  const examOptions = useMemo(
    () =>
      (options?.exams ?? []).map((exam) => ({
        value: exam.id,
        label: optionLabel([exam.name, exam.standard, exam.division, exam.category]),
      })),
    [options?.exams],
  )

  const subjectOptions = useMemo(
    () =>
      (options?.subjects ?? []).map((subject) => ({
        value: subject.id,
        label: subject.name,
      })),
    [options?.subjects],
  )

  const studentOptions = useMemo(
    () =>
      (options?.students ?? [])
        .filter((student) => !standardDivisionTarget || matchesStandardDivision(student, standardDivisionTarget))
        .map((student) => ({
          value: student.id,
          label: optionLabel([`${student.first_name} ${student.last_name}`, student.student_id, student.standard, student.division]),
        })),
    [options?.students, standardDivisionTarget],
  )

  // A blocked status can send the teacher back with the original roster and
  // paper context. Resolve the mode from authoritative options instead of
  // asking the teacher to repeat every selection.
  useEffect(() => {
    if (!staff || !options || !initial?.initialPaperId) return
    const initialPaper = options.papers.find((paper) => paper.id === initial.initialPaperId)
    if (initialPaper?.source_type === 'custom_paper') {
      setStaffUploadMode('custom_paper')
      setSelectedPaperId(initialPaper.id)
      if (initialPaper.subject_id) setSelectedSubjectId(initialPaper.subject_id)
    }
  }, [initial?.initialPaperId, options, staff])

  const canSubmit = useMemo(() => {
    if (!files.length) return false
    if (isStudentRole(role)) return Boolean(selectedPaperId && user?.id)
    if (!selectedStudentId) return false
    if (staffUploadMode === 'custom_paper') return Boolean(selectedPaperId && effectiveSubjectId)
    return Boolean(selectedExamId && effectiveSubjectId)
  }, [effectiveSubjectId, files.length, role, selectedExamId, selectedPaperId, selectedStudentId, staffUploadMode, user?.id])

  const uploadLink = resolveScanUploadLink({
    isStaff: staff,
    mode: staffUploadMode,
    selectedPaperId,
    selectedExamId,
  })

  useEffect(() => {
    if (!staff || !options) return

    if (staffUploadMode === 'ai_generation_system') {
      const exam = options.exams.find((item) => item.id === selectedExamId) ?? options.exams[0]
      if (!exam) return
      if (exam.id !== selectedExamId) setSelectedExamId(exam.id)
      if (exam.subject_id && exam.subject_id !== selectedSubjectId) setSelectedSubjectId(exam.subject_id)
      return
    }

    const customPapers = options.papers.filter((paper) => isPaperAvailableForUploadMode(paper.source_type, 'custom_paper'))
    const paper = customPapers.find((item) => item.id === selectedPaperId) ?? customPapers[0]
    if (!paper) return
    if (paper.id !== selectedPaperId) setSelectedPaperId(paper.id)
    if (paper.subject_id && paper.subject_id !== selectedSubjectId) setSelectedSubjectId(paper.subject_id)
  }, [options, selectedExamId, selectedPaperId, selectedSubjectId, staff, staffUploadMode])

  useEffect(() => {
    if (!staff || !selectedStudentId) return
    if (studentOptions.some((option) => option.value === selectedStudentId)) return
    setSelectedStudentId('')
  }, [staff, selectedStudentId, studentOptions])

  const uploadMutation = useMutation({
    mutationFn: () =>
      scanUploadApi.upload({
        paperId: uploadLink.paperId,
        examId: uploadLink.examId,
        subjectId: effectiveSubjectId,
        studentId: resolveScanUploadStudentId({
          isStaff: staff,
          selectedStudentId,
          authenticatedUserId: user?.id,
        }),
        uploadMode: uploadLink.uploadMode,
        files,
      }),
    onSuccess: (checkedPaper) => {
      // Replacement uploads can reuse the same checked-paper id. Seed the
      // authoritative upload response before navigating so an old blocker is
      // never shown while the next pipeline run starts.
      queryClient.setQueryData(['checked-paper', checkedPaper.id], checkedPaper)
      void queryClient.invalidateQueries({ queryKey: ['checked-papers'] })
      Alert.alert('Upload received', 'The scan was saved and grading has started.', [
        {
          text: 'View status',
          onPress: () => {
            if (!staff) {
              const parent = navigation.getParent?.()
              if (routeNames(navigation).includes('Results')) {
                navigation.navigate('Results', { screen: 'ResultDetail', params: { checkedPaperId: checkedPaper.id } })
                return
              }
              if (routeNames(parent).includes('Results')) {
                parent.navigate('Results', { screen: 'ResultDetail', params: { checkedPaperId: checkedPaper.id } })
                return
              }
              navigation.navigate('ResultDetail', { checkedPaperId: checkedPaper.id })
              return
            }

            // Teachers land on status first so any required input is clear.
            const parent = navigation.getParent?.()
            if (routeNames(navigation).includes('CheckedPaperStatus')) {
              navigation.navigate('CheckedPaperStatus', { checkedPaperId: checkedPaper.id })
              return
            }
            // Reached from the bare "StaffScanUpload" tab, which has no
            // nested stack of its own — hop into the StaffHome tab's stack.
            if (routeNames(navigation).includes('StaffHome')) {
              navigation.navigate('StaffHome', { screen: 'CheckedPaperStatus', params: { checkedPaperId: checkedPaper.id } })
              return
            }
            if (routeNames(parent).includes('StaffHome')) {
              parent.navigate('StaffHome', { screen: 'CheckedPaperStatus', params: { checkedPaperId: checkedPaper.id } })
              return
            }
            navigation.navigate('CheckedPaperStatus', { checkedPaperId: checkedPaper.id })
          },
        },
      ])
      setFiles([])
    },
    onError: (error) => {
      Alert.alert('Upload failed', friendlyUploadError(extractDetail(error, ''), 'Unable to upload this scan.'))
    },
  })

  const addFiles = (items: ScanUploadFile[]) => {
    setFiles((current) => [...current, ...items].slice(0, MAX_SCAN_FILES))
  }

  const previewFileItem = async (file: ScanUploadFile) => {
    const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setPreviewFile(file)
      return
    }

    if (Platform.OS === 'web') {
      const blobUrl = file.file ? URL.createObjectURL(file.file) : file.uri
      const opened = window.open(blobUrl, '_blank')
      if (!opened) {
        Alert.alert('Preview blocked', 'Allow pop-ups for this site to preview PDFs, or download the paper instead.')
      }
      return
    }

    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Preview unavailable', 'Opening PDFs is not supported on this device.')
        return
      }
      await Sharing.shareAsync(file.uri, {
        dialogTitle: `Preview ${file.name}`,
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      })
    } catch (error) {
      Alert.alert('Preview failed', extractDetail(error, 'Unable to open this PDF.'))
    }
  }

  const pickDocuments = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      multiple: true,
      copyToCacheDirectory: true,
    })
    if (result.canceled || !result.assets?.length) return
    addFiles(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name || `scan-${Date.now()}.pdf`,
        type: fileTypeFromName(asset.name || '', asset.mimeType),
        file: asset.file,
      })),
    )
  }

  const pickGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_SCAN_FILES,
      quality: 0.85,
    })
    if (result.canceled || !result.assets?.length) return
    addFiles(
      result.assets.map((asset, index) => ({
        uri: asset.uri,
        name: asset.fileName || `answer-scan-${Date.now()}-${index + 1}.jpg`,
        type: fileTypeFromName(asset.fileName || '', asset.mimeType),
        file: asset.file,
      })),
    )
  }

  const capturePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to capture an answer sheet.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    })
    if (result.canceled || !result.assets?.length) return
    const asset = result.assets[0]
    addFiles([
      {
        uri: asset.uri,
        name: asset.fileName || `answer-scan-${Date.now()}.jpg`,
        type: fileTypeFromName(asset.fileName || '', asset.mimeType),
        file: asset.file,
      },
    ])
  }

  if (optionsQuery.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading upload options</Text>
      </AppScreen>
    )
  }

  if (optionsQuery.isError || !options) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState title="Scan upload unavailable" message={extractDetail(optionsQuery.error, 'Unable to load upload options.')} onAction={() => void optionsQuery.refetch()} />
      </AppScreen>
    )
  }

  const validationText = (() => {
    if (!files.length) return 'Add at least one PDF or image.'
    if (isStudentRole(role) && !selectedPaperId) return 'Select a generated paper.'
    if (staff && !selectedStudentId) return 'Select the student.'
    if (staff && staffUploadMode === 'custom_paper' && !selectedPaperId) return 'Select a confirmed custom paper.'
    if (staff && staffUploadMode === 'ai_generation_system' && !selectedExamId) return 'Select an exam.'
    if (staff && !effectiveSubjectId) return 'Select a subject.'
    return 'Ready to upload.'
  })()

  return (
    <AppScreen
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={optionsQuery.isRefetching} onRefresh={optionsQuery.refetch} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <GradientHeroCard
        eyebrow="SCAN UPLOAD"
        title="Upload answer sheets"
        subtitle="Capture or attach scans, match them to the right paper, and send them for AI checking."
      />

      <AnimatedCard style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryValue}>{options.papers.length}</Text>
            <Text style={styles.summaryLabel}>Papers</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryValue}>{options.exams.length}</Text>
            <Text style={styles.summaryLabel}>Exams</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryValue}>{files.length}</Text>
            <Text style={styles.summaryLabel}>Files</Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <SelectableChip label={role?.replace(/_/g, ' ') || 'user'} selected />
          <Text style={styles.validationText}>{validationText}</Text>
        </View>
      </AnimatedCard>

      <AnimatedCard style={styles.formCard}>
        {staff ? (
          <View style={styles.modeField}>
            <Text style={styles.modeLabel}>Checking source</Text>
            <View style={styles.modeRow}>
              <SelectableChip
                label="AI generated exam"
                selected={staffUploadMode === 'ai_generation_system'}
                onPress={() => {
                  setStaffUploadMode('ai_generation_system')
                  setSelectedPaperId('')
                  const exam = options.exams.find((item) => item.id === selectedExamId) ?? options.exams[0]
                  setSelectedExamId(exam?.id || '')
                  setSelectedSubjectId(exam?.subject_id || '')
                }}
              />
              <SelectableChip
                label="Custom paper"
                selected={staffUploadMode === 'custom_paper'}
                onPress={() => {
                  setStaffUploadMode('custom_paper')
                  setSelectedExamId('')
                  setSelectedPaperId('')
                  setSelectedSubjectId('')
                }}
              />
            </View>
            <Text style={styles.modeHint}>
              {staffUploadMode === 'custom_paper'
                ? 'Choose a confirmed custom paper with its answer key.'
                : 'Choose the exam whose answer sheet you are uploading.'}
            </Text>
          </View>
        ) : null}

        {staff ? (
          <View style={styles.studentField}>
            <SelectField
              label="Student"
              value={selectedStudentId}
              placeholder="Select student"
              options={studentOptions}
              onChange={setSelectedStudentId}
            />
            <Text style={styles.studentHint}>
              Select the student before uploading. This roster selection stays attached to the paper.
            </Text>
          </View>
        ) : null}

        {!staff || staffUploadMode === 'custom_paper' ? (
          <SelectField
            label={isStudentRole(role) ? 'Generated paper' : 'Confirmed custom paper'}
            value={selectedPaperId}
            placeholder={paperOptions.length ? 'Select paper' : staff ? 'No confirmed custom papers' : 'No generated papers yet'}
            options={paperOptions}
            onChange={(value) => {
              setSelectedPaperId(value)
              const paper = options.papers.find((item) => item.id === value)
              setSelectedSubjectId(paper?.subject_id || '')
            }}
            disabled={paperOptions.length === 0}
          />
        ) : null}

        {staff && staffUploadMode === 'ai_generation_system' ? (
          <>
            <SelectField
              label="Exam"
              value={selectedExamId}
              placeholder="Select exam"
              options={examOptions}
              onChange={(value) => {
                setSelectedExamId(value)
                const exam = options.exams.find((item) => item.id === value)
                setSelectedSubjectId(exam?.subject_id || selectedSubjectId)
              }}
              disabled={examOptions.length === 0}
            />
            <SelectField
              label="Subject"
              value={effectiveSubjectId || ''}
              placeholder="Select subject"
              options={subjectOptions}
              onChange={setSelectedSubjectId}
              disabled={subjectOptions.length === 0 || Boolean(selectedPaper?.subject_id)}
            />
          </>
        ) : !staff && selectedPaper ? (
          <View style={styles.paperInfo}>
            <Text style={styles.paperInfoTitle}>{selectedPaper.subject_name || 'Subject selected'}</Text>
            <Text style={styles.paperInfoMeta}>{optionLabel([selectedPaper.standard, selectedPaper.division, selectedPaper.source_type]) || 'Generated paper'}</Text>
          </View>
        ) : null}
      </AnimatedCard>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Files</Text>
            <Text style={styles.sectionSubtitle}>Use one PDF or multiple ordered page images.</Text>
          </View>
        </View>

        <View style={styles.pickGrid}>
          <Pressable onPress={capturePhoto} style={({ pressed }) => [styles.pickTile, pressed && styles.pressed]}>
            <Ionicons name="camera" size={22} color={colors.accent} />
            <Text style={styles.pickTitle}>Camera</Text>
            <Text style={styles.pickMeta}>Capture page</Text>
          </Pressable>
          <Pressable onPress={pickGallery} style={({ pressed }) => [styles.pickTile, pressed && styles.pressed]}>
            <Ionicons name="images" size={22} color={colors.accent} />
            <Text style={styles.pickTitle}>Gallery</Text>
            <Text style={styles.pickMeta}>Add images</Text>
          </Pressable>
          <Pressable onPress={pickDocuments} style={({ pressed }) => [styles.pickTile, pressed && styles.pressed]}>
            <Ionicons name="folder-open" size={22} color={colors.accent} />
            <Text style={styles.pickTitle}>Files</Text>
            <Text style={styles.pickMeta}>PDF/images</Text>
          </Pressable>
        </View>

        {files.length === 0 ? (
          <AnimatedCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>No scans selected yet.</Text>
          </AnimatedCard>
        ) : (
          files.map((file, index) => (
            <FileCard
              key={`${file.uri}-${index}`}
              file={{ ...file, type: file.type || fileTypeFromName(file.name) }}
              index={index}
              onPreview={() => previewFileItem({ ...file, type: file.type || fileTypeFromName(file.name) })}
              onRemove={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            />
          ))
        )}
      </View>

      <AnimatedCard style={styles.submitCard}>
        <View style={styles.submitCopy}>
          <Text style={styles.submitTitle}>Send for checking</Text>
          <Text style={styles.submitMeta}>{files.length ? `${files.length} file(s) selected` : 'Attach scans to continue.'}</Text>
        </View>
        <AnimatedButton
          label="Upload scan"
          loading={uploadMutation.isPending}
          disabled={!canSubmit || uploadMutation.isPending}
          onPress={() => uploadMutation.mutate()}
        />
      </AnimatedCard>

      <Modal visible={Boolean(previewFile)} transparent animationType="fade" onRequestClose={() => setPreviewFile(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewFile(null)} accessibilityLabel="Dismiss preview">
          <View style={[styles.previewHeader, { paddingTop: insets.top + spacing[3] }]}>
            <Text style={styles.previewTitle} numberOfLines={1}>{previewFile?.name}</Text>
            <Pressable
              onPress={() => setPreviewFile(null)}
              accessibilityLabel="Close preview"
              style={({ pressed }) => [styles.previewClose, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={20} color={colors.textOnBrand} />
            </Pressable>
          </View>
          {previewFile ? (
            <Image source={{ uri: previewFile.uri }} style={styles.previewImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
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
  summaryRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  summaryMetric: {
    flex: 1,
    minHeight: 78,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    justifyContent: 'space-between',
  },
  summaryValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 23,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  validationText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    textAlign: 'right',
  },
  formCard: {
    gap: spacing[4],
  },
  studentField: {
    gap: spacing[1],
  },
  modeField: {
    gap: spacing[2],
  },
  modeLabel: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  modeHint: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
  },
  studentHint: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
  },
  paperInfo: {
    borderRadius: radius.lg,
    backgroundColor: colors.accentSurface,
    padding: spacing[3],
    gap: spacing[1],
  },
  paperInfoTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  paperInfoMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  section: {
    gap: spacing[3],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  sectionSubtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  pickGrid: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  pickTile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    padding: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    ...shadows.sm,
  },
  pickTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  pickMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    textAlign: 'center',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  fileCopy: {
    flex: 1,
  },
  fileTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  fileMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    marginTop: 2,
  },
  previewButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  removeButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSurface,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  previewTitle: {
    flex: 1,
    color: colors.textOnBrand,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  previewClose: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  previewImage: {
    flex: 1,
  },
  emptyCard: {
    backgroundColor: colors.backgroundElevated,
  },
  emptyText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  submitCard: {
    gap: spacing[4],
  },
  submitCopy: {
    gap: spacing[1],
  },
  submitTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
  },
  submitMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.72,
  },
})
