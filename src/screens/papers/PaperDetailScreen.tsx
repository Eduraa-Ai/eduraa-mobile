import React, { useRef, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRoute, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import type { PapersStackParamList } from '../../navigation'
import { papersApi } from '../../api/papers'
import { colors } from '../../theme/colors'
import { spacing, radius, shadows } from '../../theme/spacing'

type Nav = NativeStackNavigationProp<PapersStackParamList, 'PaperDetail'>
type Route = RouteProp<PapersStackParamList, 'PaperDetail'>

const Q_TYPE_LABELS: Record<string, string> = {
  mcq: 'MCQ',
  short_answer: 'Short Ans',
  long_answer: 'Long Ans',
  fill_blank: 'Fill Blank',
  match_columns: 'Match Col',
  true_false: 'True/False',
}

export default function PaperDetailScreen() {
  const navigation = useNavigation<Nav>()
  const { params } = useRoute<Route>()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()

  const { data: paper, isLoading } = useQuery({
    queryKey: ['paper', params.paperId],
    queryFn: () => papersApi.getById(params.paperId),
  })

  const { data: existingSubmission } = useQuery({
    queryKey: ['paper-submission', params.paperId],
    queryFn: () => papersApi.getSubmission(params.paperId),
    enabled: !!paper,
    retry: false,
    throwOnError: false,
  })

  const fadeAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start()
  }, [fadeAnim])

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  if (!paper) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.subtle} />
        <Text style={styles.errorText}>Paper not found</Text>
      </View>
    )
  }

  const alreadySubmitted = !!existingSubmission
  const hPad = width < 380 ? spacing[4] : spacing[5]

  return (
    <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingHorizontal: hPad, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Paper info card */}
        <View style={[styles.infoCard, shadows.sm]}>
          <Text style={styles.paperTitle}>{paper.title}</Text>
          {paper.subtitle ? <Text style={styles.paperSub}>{paper.subtitle}</Text> : null}

          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Ionicons name="star-outline" size={12} color={colors.accent} />
              <Text style={[styles.chipText, { color: colors.accent }]}>{paper.total_marks} marks</Text>
            </View>
            {paper.duration_minutes ? (
              <View style={styles.chip}>
                <Ionicons name="time-outline" size={12} color={colors.info} />
                <Text style={[styles.chipText, { color: colors.info }]}>{paper.duration_minutes} min</Text>
              </View>
            ) : null}
            <View style={styles.chip}>
              <Ionicons name="help-circle-outline" size={12} color={colors.success} />
              <Text style={[styles.chipText, { color: colors.success }]}>{paper.questions.length} questions</Text>
            </View>
          </View>

          {paper.instructions ? (
            <View style={styles.instructions}>
              <Text style={styles.instructionsLabel}>Instructions</Text>
              <Text style={styles.instructionsText}>{paper.instructions}</Text>
            </View>
          ) : null}
        </View>

        {/* Already submitted */}
        {alreadySubmitted && existingSubmission && (
          <View style={styles.submittedBanner}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.submittedText}>You've attempted this paper</Text>
              {existingSubmission.total_score != null && existingSubmission.max_score != null ? (
                <Text style={styles.submittedScore}>
                  Score: {existingSubmission.total_score} / {existingSubmission.max_score}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          {alreadySubmitted && existingSubmission ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() =>
                navigation.getParent()?.navigate('Results', {
                  screen: 'ResultDetail',
                  params: { checkedPaperId: existingSubmission.id },
                })
              }
              activeOpacity={0.82}
            >
              <Ionicons name="stats-chart" size={16} color={colors.white} />
              <Text style={styles.primaryBtnText}>View My Results</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('AttemptPaper', { paperId: paper.id })}
              activeOpacity={0.82}
            >
              <Ionicons name="pencil" size={16} color={colors.white} />
              <Text style={styles.primaryBtnText}>Attempt Paper</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('Quiz', { paperId: paper.id })}
            activeOpacity={0.82}
          >
            <Ionicons name="flash-outline" size={16} color={colors.accent} />
            <Text style={styles.secondaryBtnText}>Interactive Quiz</Text>
          </TouchableOpacity>
        </View>

        {/* Questions */}
        <Text style={styles.sectionLabel}>Questions  ·  {paper.questions.length}</Text>
        {paper.questions.map((q, index) => (
          <View key={q.id} style={[styles.questionCard, shadows.xs]}>
            <View style={styles.questionHeader}>
              <View style={styles.questionNum}>
                <Text style={styles.questionNumText}>Q{q.question_number || index + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.questionMeta}>
                  <View style={styles.qtypeBadge}>
                    <Text style={styles.qtypeText}>{Q_TYPE_LABELS[q.question_type] ?? q.question_type}</Text>
                  </View>
                  <View style={styles.marksBadge}>
                    <Text style={styles.marksText}>{q.marks} {q.marks === 1 ? 'mark' : 'marks'}</Text>
                  </View>
                  {q.difficulty ? (
                    <View style={[
                      styles.diffBadge,
                      q.difficulty === 'hard' && { backgroundColor: colors.dangerBg },
                      q.difficulty === 'medium' && { backgroundColor: colors.warningBg },
                      q.difficulty === 'easy' && { backgroundColor: colors.successBg },
                    ]}>
                      <Text style={[
                        styles.diffText,
                        q.difficulty === 'hard' && { color: colors.danger },
                        q.difficulty === 'medium' && { color: colors.warning },
                        q.difficulty === 'easy' && { color: colors.success },
                      ]}>{q.difficulty}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
            <Text style={styles.questionText}>{q.question_text}</Text>
            {q.options && Array.isArray(q.options) && (
              <View style={styles.optionsList}>
                {(q.options as Array<{ id: string; text: string }>).map((opt, i) => (
                  <View key={opt.id} style={styles.optionRow}>
                    <View style={styles.optionLetter}>
                      <Text style={styles.optionLetterText}>{String.fromCharCode(65 + i)}</Text>
                    </View>
                    <Text style={styles.optionText}>{opt.text}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface1 },
  content: { paddingTop: spacing[4], gap: spacing[3] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3] },
  errorText: { fontSize: 14, color: colors.muted },

  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing[5],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing[3],
  },
  paperTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  paperSub: { fontSize: 13, color: colors.muted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  instructions: {
    backgroundColor: colors.infoBg,
    borderRadius: radius.lg,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.infoBorder,
    gap: 4,
  },
  instructionsLabel: { fontSize: 11, fontWeight: '700', color: colors.info, textTransform: 'uppercase', letterSpacing: 0.5 },
  instructionsText: { fontSize: 13, color: colors.infoText, lineHeight: 19 },

  submittedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    backgroundColor: colors.successBg,
    borderRadius: radius.lg,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.successBorder,
  },
  submittedText: { fontSize: 13, fontWeight: '700', color: colors.successText },
  submittedScore: { fontSize: 12, color: colors.success, marginTop: 2 },

  actions: { flexDirection: 'row', gap: spacing[3] },
  primaryBtn: {
    flex: 1,
    height: 50,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  secondaryBtn: {
    flex: 1,
    height: 50,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  secondaryBtnText: { color: colors.accent, fontWeight: '700', fontSize: 14 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.subtle,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing[2],
  },
  questionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing[4],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing[3],
  },
  questionHeader: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  questionNum: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  questionNumText: { fontSize: 12, fontWeight: '800', color: colors.accentStrong },
  questionMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  qtypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  qtypeText: { fontSize: 10, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  marksBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
  },
  marksText: { fontSize: 10, fontWeight: '700', color: colors.accentStrong },
  diffBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  diffText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  questionText: { fontSize: 14, color: colors.ink, lineHeight: 22 },
  optionsList: { gap: spacing[2] },
  optionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  optionLetter: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionLetterText: { fontSize: 11, fontWeight: '700', color: colors.muted },
  optionText: { fontSize: 13, color: colors.muted, flex: 1, lineHeight: 20, paddingTop: 3 },
})
