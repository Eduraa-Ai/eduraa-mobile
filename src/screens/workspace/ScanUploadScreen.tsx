import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, GradientHeroCard, SelectField, SelectableChip } from '../../components/ui'
import { scanUploadApi, ScanUploadFile } from '../../api/scanUpload'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import type { Role } from '../../types'

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
  return (error as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback
}

function routeNames(nav: any): string[] {
  return nav?.getState?.().routeNames ?? []
}

function FileCard({ file, index, onRemove }: { file: ScanUploadFile; index: number; onRemove: () => void }) {
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
      <Pressable onPress={onRemove} style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
        <Ionicons name="close" size={17} color={colors.danger} />
      </Pressable>
    </AnimatedCard>
  )
}

export default function ScanUploadScreen() {
  const navigation = useNavigation<any>()
  const role = useAuthStore((state) => state.user?.role)
  const [selectedPaperId, setSelectedPaperId] = useState('')
  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [files, setFiles] = useState<ScanUploadFile[]>([])

  const optionsQuery = useQuery({
    queryKey: ['scan-upload', 'options'],
    queryFn: scanUploadApi.getOptions,
  })

  const options = optionsQuery.data
  const selectedPaper = options?.papers.find((paper) => paper.id === selectedPaperId)
  const selectedExam = options?.exams.find((exam) => exam.id === selectedExamId)
  const effectiveSubjectId = selectedPaper?.subject_id || selectedSubjectId || selectedExam?.subject_id || null
  const paperMode = selectedPaper?.source_type || null
  const staff = isStaffRole(role)

  const paperOptions = useMemo(
    () =>
      (options?.papers ?? []).map((paper) => ({
        value: paper.id,
        label: optionLabel([paper.title, paper.subject_name, paper.standard, paper.division, paper.source_type]),
      })),
    [options?.papers],
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
      (options?.students ?? []).map((student) => ({
        value: student.id,
        label: optionLabel([`${student.first_name} ${student.last_name}`, student.student_id, student.standard, student.division]),
      })),
    [options?.students],
  )

  const canSubmit = useMemo(() => {
    if (!files.length) return false
    if (isStudentRole(role)) return Boolean(selectedPaperId)
    if (!selectedStudentId) return false
    if (selectedPaperId) return true
    return Boolean(selectedExamId && effectiveSubjectId)
  }, [effectiveSubjectId, files.length, role, selectedExamId, selectedPaperId, selectedStudentId])

  const uploadMutation = useMutation({
    mutationFn: () =>
      scanUploadApi.upload({
        paperId: selectedPaperId || null,
        examId: selectedPaperId ? null : selectedExamId || null,
        subjectId: effectiveSubjectId,
        studentId: staff ? selectedStudentId || null : null,
        uploadMode: paperMode,
        files,
      }),
    onSuccess: (checkedPaper) => {
      Alert.alert('Upload received', 'The scan was saved and grading has started.', [
        {
          text: 'View result',
          onPress: () => {
            const parent = navigation.getParent?.()
            if (routeNames(navigation).includes('Results')) {
              navigation.navigate('Results', { screen: 'ResultDetail', params: { checkedPaperId: checkedPaper.id } })
              return
            }
            if (routeNames(parent).includes('Results')) {
              parent.navigate('Results', { screen: 'ResultDetail', params: { checkedPaperId: checkedPaper.id } })
              return
            }
            if (routeNames(navigation).includes('StaffResults')) {
              navigation.navigate('StaffResults', { screen: 'ResultDetail', params: { checkedPaperId: checkedPaper.id } })
              return
            }
            if (routeNames(parent).includes('StaffResults')) {
              parent.navigate('StaffResults', { screen: 'ResultDetail', params: { checkedPaperId: checkedPaper.id } })
              return
            }
            navigation.navigate('ResultDetail', { checkedPaperId: checkedPaper.id })
          },
        },
      ])
      setFiles([])
    },
    onError: (error) => {
      Alert.alert('Upload failed', extractDetail(error, 'Unable to upload this scan.'))
    },
  })

  const addFiles = (items: ScanUploadFile[]) => {
    setFiles((current) => [...current, ...items].slice(0, 12))
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
      selectionLimit: 12,
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
    if (staff && !selectedPaperId && !(selectedExamId && effectiveSubjectId)) return 'Select a paper or exam and subject.'
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
          <SelectField
            label="Student"
            value={selectedStudentId}
            placeholder="Select student"
            options={studentOptions}
            onChange={setSelectedStudentId}
          />
        ) : null}

        <SelectField
          label={isStudentRole(role) ? 'Generated paper' : 'Paper'}
          value={selectedPaperId}
          placeholder={paperOptions.length ? 'Select paper' : 'No generated papers yet'}
          options={paperOptions}
          onChange={(value) => {
            setSelectedPaperId(value)
            const paper = options.papers.find((item) => item.id === value)
            setSelectedSubjectId(paper?.subject_id || '')
            if (paper) setSelectedExamId('')
          }}
          disabled={paperOptions.length === 0}
        />

        {staff ? (
          <>
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or use exam mode</Text>
              <View style={styles.orLine} />
            </View>
            <SelectField
              label="Exam"
              value={selectedExamId}
              placeholder="Select exam"
              options={examOptions}
              onChange={(value) => {
                setSelectedExamId(value)
                setSelectedPaperId('')
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
        ) : selectedPaper ? (
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
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  orText: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
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
  removeButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSurface,
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
