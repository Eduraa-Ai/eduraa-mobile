import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import type { PaperQuestionVisualFile } from '../../api/papers'
import type { QuestionInPaper } from '../../types'
import { colors } from '../../theme/colors'
import { radius, spacing } from '../../theme/spacing'
import { typography } from '../../theme/typography'
import {
  buildPaperQuestionUpdate,
  createPaperQuestionDraft,
  validatePaperQuestionDraft,
  validateQuestionVisualFile,
  type PaperQuestionDraft,
  type PaperQuestionUpdatePayload,
} from './paperDetailModel'

type Props = {
  question: QuestionInPaper
  busy: boolean
  visualBusy: boolean
  onCancel: () => void
  onSave: (payload: PaperQuestionUpdatePayload) => void
  onUploadVisual: (file: PaperQuestionVisualFile) => void
  onRemoveVisual: () => void
}

function imageAssetFile(asset: ImagePicker.ImagePickerAsset): PaperQuestionVisualFile {
  return {
    uri: asset.uri,
    name: asset.fileName || `question-visual-${Date.now()}.jpg`,
    type: asset.mimeType || 'image/jpeg',
    size: asset.fileSize,
    file: asset.file,
  }
}

export default function PaperQuestionEditor({
  question,
  busy,
  visualBusy,
  onCancel,
  onSave,
  onUploadVisual,
  onRemoveVisual,
}: Props) {
  const [draft, setDraft] = useState<PaperQuestionDraft>(() => createPaperQuestionDraft(question))
  const [error, setError] = useState<string | null>(null)
  const locked = busy || visualBusy
  const hasChoiceOptions = draft.options.length > 0
  const validation = useMemo(
    () => validatePaperQuestionDraft(question.question_type, draft),
    [draft, question.question_type],
  )

  const update = <K extends keyof PaperQuestionDraft>(key: K, value: PaperQuestionDraft[K]) => {
    setError(null)
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const submitFile = (file: PaperQuestionVisualFile) => {
    const issue = validateQuestionVisualFile(file)
    if (issue) {
      setError(issue)
      return
    }
    setError(null)
    onUploadVisual(file)
  }

  const pickGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setError('Allow photo access to attach an image, or choose Files instead.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.9,
    })
    if (!result.canceled && result.assets[0]) submitFile(imageAssetFile(result.assets[0]))
  }

  const capturePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      setError('Camera access is needed to photograph a diagram. You can use Gallery or Files instead.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
    if (!result.canceled && result.assets[0]) submitFile(imageAssetFile(result.assets[0]))
  }

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/png', 'image/jpeg', 'image/webp'],
      multiple: false,
      copyToCacheDirectory: true,
    })
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      submitFile({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || 'application/octet-stream',
        size: asset.size,
        file: asset.file,
      })
    }
  }

  return (
    <View style={styles.editor} accessibilityLabel={`Editing question ${question.question_number}`}>
      <View style={styles.editorHeading}>
        <View style={styles.liveDot} />
        <View style={styles.editorHeadingCopy}>
          <Text style={styles.editorTitle}>Editing directly</Text>
          <Text style={styles.editorSubtitle}>Write naturally—your work stays here if saving fails.</Text>
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>QUESTION</Text>
        <TextInput
          value={draft.questionText}
          onChangeText={(value) => update('questionText', value)}
          editable={!locked}
          multiline
          textAlignVertical="top"
          placeholder="Write the question"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, styles.questionInput]}
        />
      </View>

      {hasChoiceOptions ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>OPTIONS · TAP THE CORRECT ANSWER</Text>
          <View style={styles.optionList}>
            {draft.options.map((option, index) => (
              <View key={`${option.id}-${index}`} style={styles.optionEditorRow}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: option.is_correct === true, disabled: locked }}
                  disabled={locked}
                  onPress={() => {
                    setError(null)
                    setDraft((current) => ({
                      ...current,
                      answerText: option.id,
                      options: current.options.map((item, itemIndex) => ({
                        ...item,
                        is_correct: itemIndex === index,
                      })),
                    }))
                  }}
                  style={[styles.radio, option.is_correct && styles.radioSelected]}
                >
                  {option.is_correct ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
                </Pressable>
                <Text style={styles.optionId}>{option.id || String.fromCharCode(65 + index)}</Text>
                <TextInput
                  value={option.text}
                  onChangeText={(value) => update('options', draft.options.map((item, itemIndex) => (
                    itemIndex === index ? { ...item, text: value } : item
                  )))}
                  editable={!locked}
                  placeholder={`Option ${index + 1}`}
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, styles.optionInput]}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {question.question_type === 'match_columns' ? (
        <View style={styles.columnGrid}>
          <View style={[styles.fieldGroup, styles.columnField]}>
            <Text style={styles.label}>Column A · one per line</Text>
            <TextInput
              value={draft.matchLeftText}
              onChangeText={(value) => update('matchLeftText', value)}
              editable={!locked}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.columnInput]}
            />
          </View>
          <View style={[styles.fieldGroup, styles.columnField]}>
            <Text style={styles.label}>Column B · one per line</Text>
            <TextInput
              value={draft.matchRightText}
              onChangeText={(value) => update('matchRightText', value)}
              editable={!locked}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.columnInput]}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.compactFields}>
        <View style={[styles.fieldGroup, styles.answerField]}>
          <Text style={styles.label}>Answer key</Text>
          <TextInput
            value={draft.answerText}
            onChangeText={(value) => update('answerText', value)}
            editable={!locked && !hasChoiceOptions}
            multiline
            textAlignVertical="top"
            placeholder="Add the expected answer"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, styles.answerInput, hasChoiceOptions && styles.inputReadOnly]}
          />
        </View>
        <View style={[styles.fieldGroup, styles.marksField]}>
          <Text style={styles.label}>Marks</Text>
          <TextInput
            value={draft.marksText}
            onChangeText={(value) => update('marksText', value)}
            editable={!locked}
            keyboardType="decimal-pad"
            style={[styles.input, styles.marksInput]}
          />
        </View>
      </View>

      <View style={styles.visualSection}>
        <View style={styles.visualCopy}>
          <Text style={styles.visualTitle}>{question.visual_payload ? 'Change the image' : 'Add something visual'}</Text>
          <Text style={styles.visualMeta}>Photo, diagram, map, graph or illustration · up to 10 MB</Text>
        </View>
        <View style={styles.visualActions}>
          {([
            ['camera-outline', 'Camera', capturePhoto],
            ['images-outline', 'Gallery', pickGallery],
            ['folder-open-outline', 'Files', pickFile],
          ] as const).map(([icon, label, handler]) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={`${label} question image`}
              disabled={locked}
              onPress={() => void handler()}
              style={({ pressed }) => [styles.visualAction, pressed && styles.pressed, locked && styles.disabled]}
            >
              {visualBusy ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name={icon} size={20} color={colors.accent} />}
              <Text style={styles.visualActionText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {question.visual_payload ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove question image"
            disabled={locked}
            onPress={onRemoveVisual}
            style={({ pressed }) => [styles.removeVisual, pressed && styles.pressed, locked && styles.disabled]}
          >
            <Ionicons name="trash-outline" size={17} color={colors.danger} />
            <Text style={styles.removeVisualText}>Remove current image</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel question edits"
          disabled={locked}
          onPress={onCancel}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed, locked && styles.disabled]}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save question changes"
          accessibilityState={{ busy, disabled: locked }}
          disabled={locked}
          onPress={() => {
            if (validation) {
              setError(validation)
              return
            }
            setError(null)
            onSave(buildPaperQuestionUpdate(question, draft))
          }}
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, locked && styles.disabled]}
        >
          {busy ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="checkmark" size={18} color={colors.white} />}
          <Text style={styles.saveText}>{busy ? 'Saving…' : 'Save changes'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  editor: { gap: spacing[4], marginTop: spacing[2], paddingTop: spacing[3] },
  editorHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  editorHeadingCopy: { flex: 1, gap: 1 },
  editorTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 17 },
  editorSubtitle: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11 },
  fieldGroup: { gap: spacing[2] },
  label: { color: colors.textSoft, fontFamily: typography.fonts.bodySemibold, fontSize: 10, letterSpacing: 0.8 },
  input: { minHeight: 48, borderWidth: 0, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, borderRadius: 0, backgroundColor: 'transparent', color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 14, paddingHorizontal: 0, paddingVertical: spacing[3] },
  questionInput: { minHeight: 108, lineHeight: 22, fontSize: 16 },
  answerInput: { minHeight: 76, lineHeight: 20 },
  inputReadOnly: { backgroundColor: colors.backgroundMuted, color: colors.textMuted },
  compactFields: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  answerField: { flex: 1 },
  marksField: { width: 82 },
  marksInput: { minHeight: 76, textAlign: 'center' },
  optionList: { gap: spacing[2] },
  optionEditorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  radio: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  optionId: { width: 18, color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 12, textAlign: 'center' },
  optionInput: { flex: 1 },
  columnGrid: { flexDirection: 'row', gap: spacing[3] },
  columnField: { flex: 1 },
  columnInput: { minHeight: 112, lineHeight: 20 },
  visualSection: { gap: spacing[3], borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing[4] },
  visualCopy: { gap: 2 },
  visualTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  visualMeta: { color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 11 },
  visualActions: { flexDirection: 'row', gap: spacing[2] },
  visualAction: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  visualActionText: { color: colors.text, fontFamily: typography.fonts.bodySemibold, fontSize: 11 },
  removeVisual: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  removeVisualText: { color: colors.danger, fontFamily: typography.fonts.bodySemibold, fontSize: 12 },
  error: { color: colors.danger, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: spacing[2] },
  cancelButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.backgroundElevated },
  cancelText: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  saveButton: { flex: 1.5, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderRadius: radius.full, backgroundColor: colors.nav },
  saveText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
})
