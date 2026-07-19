import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { checkedPapersApi } from '../../api/checkedPapers'
import { AuthLogoMark } from '../../components/ui'
import type { ResultsStackParamList } from '../../navigation'
import { colors, layout, radius, spacing, typography } from '../../theme'
import {
  findEvidenceQuestion,
  questionStatus,
  questionTypeLabel,
  readableMathText,
  type QuestionEvidenceTab,
} from './checkedPaperDetailModel'

type Route = RouteProp<ResultsStackParamList, 'QuestionEvidence'>
type Nav = NativeStackNavigationProp<ResultsStackParamList, 'QuestionEvidence'>

const TAB_CONFIG: Array<{ key: QuestionEvidenceTab; label: string }> = [
  { key: 'feedback', label: 'Feedback' },
  { key: 'scan', label: 'Original scan' },
  { key: 'review', label: 'Review' },
]

const STATUS_META = {
  correct: { label: 'Strong', tone: colors.success },
  partial: { label: 'Repair', tone: colors.warning },
  missed: { label: 'Repair', tone: colors.accent },
  pending: { label: 'Pending', tone: colors.textMuted },
} as const

export default function QuestionEvidenceScreen() {
  const { params } = useRoute<Route>()
  const navigation = useNavigation<Nav>()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const compact = width < 380
  const [activeTab, setActiveTab] = useState<QuestionEvidenceTab>('feedback')
  const [reviewNote, setReviewNote] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['checked-paper', params.checkedPaperId],
    queryFn: () => checkedPapersApi.getById(params.checkedPaperId),
    enabled: Boolean(params.checkedPaperId),
  })
  const evidence = useMemo(() => data ? findEvidenceQuestion(data, params.questionId, params.questionIndex) : null, [data, params.questionId, params.questionIndex])

  const reviewMutation = useMutation({
    mutationFn: () => checkedPapersApi.requestManualReview(params.checkedPaperId, {
      note: reviewNote.trim() || null,
      question_id: evidence?.item.question_id || params.questionId || null,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['checked-paper', params.checkedPaperId] }),
        queryClient.invalidateQueries({ queryKey: ['checked-papers'] }),
      ])
    },
  })

  const intro = (
    <View style={styles.pageIntro}>
      <Text style={styles.pageOverline}>CHECKED PAPERS · ASSESSMENT INTELLIGENCE</Text>
      <Text style={styles.pageTitle}>Question evidence</Text>
      <Text style={styles.pageSubtitle}>Feedback, the original scan, and review stay in one focused sheet.</Text>
    </View>
  )

  if (isLoading || isError || !data || !evidence) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing[2] }]}>
        {intro}
        <View style={styles.stateSurface}>
          {isLoading ? <><ActivityIndicator color={colors.accent} size="large" /><Text style={styles.stateMessage}>Loading question evidence…</Text></> : (
            <><Ionicons name="alert-circle-outline" size={30} color={colors.danger} /><Text style={styles.stateTitle}>{isError ? 'Question evidence unavailable' : 'Question not found'}</Text><Text style={styles.stateMessage}>Return to the report or retry without changing the checked paper.</Text><View style={styles.stateActions}><Pressable onPress={() => navigation.goBack()} style={styles.stateSecondary}><Text style={styles.stateSecondaryText}>Back</Text></Pressable>{isError ? <Pressable onPress={() => void refetch()} style={styles.statePrimary}><Text style={styles.statePrimaryText}>Retry</Text></Pressable> : null}</View></>
          )}
        </View>
      </View>
    )
  }

  const item = evidence.item
  const questionNumber = item.question_number ?? evidence.index + 1
  const totalQuestions = data.grading_results?.length ?? 0
  const status = questionStatus(item)
  const statusMeta = STATUS_META[status]
  const isStrong = status === 'correct'
  const questionText = readableMathText(item.question_text) || 'Question text is unavailable for this checked paper.'
  const response = readableMathText(item.response) || 'No response was captured.'
  const expected = readableMathText(String(item.expected_answer ?? '')) || 'The expected answer was not included in this result.'
  const feedback = readableMathText(item.feedback) || 'Detailed evaluator feedback is not available for this question.'
  const recommendation = readableMathText(item.recommendation) || feedback
  const reviewSent = data.manual_review_requested || reviewMutation.isSuccess
  const canSubmitReview = reviewNote.trim().length > 0 && !reviewMutation.isPending

  const openScan = async () => {
    setScanError(null)
    try {
      const supported = await Linking.canOpenURL(data.scanned_pdf_url)
      if (!supported) throw new Error('Unsupported scan link')
      await Linking.openURL(data.scanned_pdf_url)
    } catch {
      setScanError('The original file could not be opened on this device. The captured evidence remains visible below.')
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing[2] }]}>
      {intro}
      <View style={styles.detailSurface}>
        <LinearGradient colors={['#07152d', '#0b1932']} style={styles.navyHeader}>
          <View style={styles.identityRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to performance report" onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={18} color={colors.white} />
            </Pressable>
            <AuthLogoMark size={38} />
            <View style={styles.identityCopy}>
              <Text style={styles.identityTitle}>Question {String(questionNumber).padStart(2, '0')} of {String(totalQuestions).padStart(2, '0')}</Text>
              <Text style={styles.identityMeta}>{questionTypeLabel(item)} · {item.score ?? '-'}/{item.max_score ?? '-'}</Text>
            </View>
            <View style={styles.statusPill}><View style={[styles.statusDot, { backgroundColor: statusMeta.tone }]} /><Text style={[styles.statusPillText, { color: statusMeta.tone }]}>{statusMeta.label}</Text></View>
          </View>
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>{isStrong ? 'Evidence-led reinforcement' : 'Evidence-led feedback'}</Text>
            <Text style={styles.heroTitle}>{isStrong ? <>See exactly what{`\n`}you did well.</> : <>See exactly where{`\n`}the marks slipped.</>}</Text>
            <Text style={styles.heroSubtitle}>{isStrong ? 'Your response and evaluator evidence show what is worth repeating.' : 'Your response, evaluator evidence, and review request remain connected.'}</Text>
          </View>
        </LinearGradient>

        <View style={styles.detailSheet}>
          <View style={styles.grabber} />
          <View accessibilityRole="tablist" style={styles.tabs}>
            {TAB_CONFIG.map((tab) => {
              const selected = activeTab === tab.key
              return <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setActiveTab(tab.key)} style={styles.tab}><Text style={[styles.tabText, selected && styles.tabTextActive]}>{tab.label}</Text>{selected ? <View style={styles.tabIndicator} /> : null}</Pressable>
            })}
          </View>

          <ScrollView style={styles.sheetScroll} contentContainerStyle={[styles.sheetContent, { paddingBottom: layout.bottomTabHeight + insets.bottom + spacing[10] }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {activeTab === 'feedback' ? (
              <View style={[styles.panel, compact && styles.panelCompact]}>
                <View style={styles.questionBlock}>
                  <Text style={styles.tinyLabel}>{questionTypeLabel(item)} · {item.max_score ?? '-'} marks</Text>
                  <Text style={[styles.questionText, compact && styles.questionTextCompact]}>{questionText}</Text>
                  <Text style={styles.chapterText}>{data.subject_name || 'Checked paper'}</Text>
                </View>
                <View style={[styles.answerCompare, styles.responseBlock]}><Text style={styles.compareTitle}>Your approach</Text><Text style={styles.compareText} numberOfLines={3}>{response}</Text></View>
                <View style={[styles.answerCompare, styles.expectedBlock]}><Text style={styles.compareTitle}>What earns full marks</Text><Text style={styles.compareText} numberOfLines={3}>{expected}</Text></View>
                <View style={styles.coachNote}>
                  <View style={styles.coachMark}><Text style={styles.coachMarkText}>AI</Text></View>
                  <View style={styles.coachCopy}><Text style={styles.coachTitle}>{recommendation}</Text><Text style={styles.coachText}>{feedback}</Text></View>
                </View>
                <Pressable accessibilityRole="button" onPress={() => navigation.getParent()?.navigate('Papers', { screen: 'GeneratePaper' })} style={styles.primaryAction}><Ionicons name="play-outline" size={16} color={colors.white} /><Text style={styles.primaryActionText}>Practice this concept</Text></Pressable>
              </View>
            ) : null}

            {activeTab === 'scan' ? (
              <View style={styles.panel}>
                <View style={styles.scanUnavailable}>
                  <View style={styles.scanUnavailableIcon}><Ionicons name="document-outline" size={25} color={colors.accentStrong} /></View>
                  <Text style={styles.scanUnavailableTitle}>Original scan preview unavailable</Text>
                  <Text style={styles.scanUnavailableText}>Open the original checked-paper file to inspect the source page.</Text>
                </View>
                <View style={styles.responseEvidence}><Text style={styles.scanLabel}>Captured response text</Text><Text style={styles.scanResponse}>{response}</Text></View>
                <Text style={styles.scanMeta}>The original checked-paper file remains the source of truth. Captured response text comes from the grading API.</Text>
                {scanError ? <Text style={styles.errorText}>{scanError}</Text> : null}
                <Pressable accessibilityRole="button" onPress={() => void openScan()} style={styles.secondaryAction}><Ionicons name="expand-outline" size={16} color={colors.nav} /><Text style={styles.secondaryActionText}>Open original file</Text></Pressable>
                <View style={styles.coachNote}><View style={styles.coachMark}><Text style={styles.coachMarkText}>AI</Text></View><View style={styles.coachCopy}><Text style={styles.coachTitle}>Evidence stays connected.</Text><Text style={styles.coachText}>{feedback}</Text></View></View>
              </View>
            ) : null}

            {activeTab === 'review' ? (
              <View style={styles.panel}>
                <View style={styles.reviewState}><Ionicons name={reviewSent ? 'checkmark-circle' : 'shield-checkmark-outline'} size={25} color={reviewSent ? colors.success : colors.accentStrong} /><View style={styles.reviewCopy}><Text style={styles.reviewTitle}>{reviewSent ? 'Teacher review requested' : 'Eligible for teacher review'}</Text><Text style={styles.reviewText}>{reviewSent ? 'This checked paper is now in the review queue.' : 'Your scan and AI feedback will be attached automatically.'}</Text></View></View>
                {!reviewSent ? <><Text style={styles.reviewLabel}>Why should this answer be reconsidered?</Text><TextInput accessibilityLabel="Teacher review note" value={reviewNote} onChangeText={setReviewNote} placeholder="Explain what should be reviewed" placeholderTextColor={colors.textSoft} multiline style={styles.reviewInput} /><Text style={styles.helperText}>Add a reason before sending. The original score remains visible until review is complete.</Text>{reviewMutation.isError ? <Text style={styles.errorText}>The request could not be sent. Check the connection and try again.</Text> : null}<Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSubmitReview }} disabled={!canSubmitReview} onPress={() => reviewMutation.mutate()} style={[styles.primaryAction, !canSubmitReview && styles.disabled]}>{reviewMutation.isPending ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="send-outline" size={16} color={colors.white} /><Text style={styles.primaryActionText}>Send for teacher review</Text></>}</Pressable></> : null}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing[2], backgroundColor: '#dce3ea' },
  pageIntro: { paddingHorizontal: spacing[4], gap: 1, zIndex: 2, backgroundColor: '#dce3ea' },
  pageOverline: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 8, lineHeight: 11, letterSpacing: 0.7 },
  pageTitle: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 19, lineHeight: 23 },
  pageSubtitle: { color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 13 },
  detailSurface: { flex: 1, minHeight: 0, marginHorizontal: spacing[3], borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', backgroundColor: '#07152d', borderWidth: 1, borderColor: 'rgba(7,21,45,0.16)' },
  navyHeader: { backgroundColor: '#07152d' },
  identityRow: { minHeight: 58, paddingHorizontal: spacing[3], flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  backButton: { width: 44, height: 44, borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1, minWidth: 0 },
  identityTitle: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 13 },
  identityMeta: { color: 'rgba(255,255,255,0.62)', fontFamily: typography.fonts.bodyMedium, fontSize: 9, marginTop: 2 },
  statusPill: { minHeight: 28, borderRadius: radius.full, paddingHorizontal: spacing[2], flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(241,100,35,0.12)' },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontFamily: typography.fonts.bodyBold, fontSize: 8, textTransform: 'uppercase' },
  hero: { paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[3] },
  heroKicker: { color: '#ff8543', fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 1.25, textTransform: 'uppercase' },
  heroTitle: { color: colors.white, fontFamily: typography.fonts.heading, fontSize: 22, lineHeight: 22, marginTop: spacing[1] },
  heroSubtitle: { maxWidth: 320, color: 'rgba(255,255,255,0.66)', fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 13, marginTop: spacing[1] },
  detailSheet: { flex: 1, minHeight: 0, marginTop: -8, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#fffaf2', overflow: 'hidden' },
  grabber: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: spacing[2], backgroundColor: '#cdbda9' },
  tabs: { minHeight: 50, paddingHorizontal: spacing[3], flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: '#eadfd1' },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tabText: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 9 },
  tabTextActive: { color: colors.text },
  tabIndicator: { position: 'absolute', bottom: -1, left: spacing[2], right: spacing[2], height: 3, borderRadius: 2, backgroundColor: colors.accent },
  sheetScroll: { flex: 1 },
  sheetContent: { paddingHorizontal: spacing[4], paddingTop: spacing[2] },
  panel: { gap: spacing[3] },
  panelCompact: { gap: spacing[2] },
  questionBlock: { paddingBottom: spacing[2], borderBottomWidth: 1, borderBottomColor: '#eadfd1' },
  tinyLabel: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
  questionText: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 17, lineHeight: 21, marginTop: spacing[2] },
  questionTextCompact: { fontSize: 15, lineHeight: 18, marginTop: spacing[1] },
  chapterText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, marginTop: spacing[2] },
  answerCompare: { borderLeftWidth: 3, paddingLeft: spacing[3], paddingVertical: spacing[1], borderBottomWidth: 1, borderBottomColor: '#eadfd1' },
  responseBlock: { borderLeftColor: colors.accent },
  expectedBlock: { borderLeftColor: colors.success },
  compareTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 12 },
  compareText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 15, marginTop: spacing[1] },
  coachNote: { borderRadius: 16, padding: spacing[2], flexDirection: 'row', gap: spacing[2], backgroundColor: '#07152d' },
  coachMark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  coachMarkText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 9 },
  coachCopy: { flex: 1, minWidth: 0 },
  coachTitle: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 12, lineHeight: 16 },
  coachText: { color: 'rgba(255,255,255,0.66)', fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 14, marginTop: 2 },
  primaryAction: { minHeight: 44, borderRadius: 14, backgroundColor: '#07152d', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingHorizontal: spacing[3] },
  primaryActionText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  scanPreview: { minHeight: 230, borderRadius: 22, padding: spacing[4], backgroundColor: '#e8edf2' },
  scanUnavailable: { minHeight: 160, borderRadius: 22, padding: spacing[4], alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf1f5', borderWidth: 1, borderColor: colors.border },
  scanUnavailableIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface },
  scanUnavailableTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 15, marginTop: spacing[2], textAlign: 'center' },
  scanUnavailableText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 15, marginTop: spacing[1], textAlign: 'center' },
  responseEvidence: { borderRadius: 16, padding: spacing[3], backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
  scanPaper: { flex: 1, borderRadius: 8, padding: spacing[4], backgroundColor: '#fffef9', position: 'relative' },
  scanLabel: { color: colors.textSoft, fontFamily: typography.fonts.bodyBold, fontSize: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  scanResponse: { color: colors.text, fontFamily: typography.fonts.heading, fontSize: 15, lineHeight: 21, marginVertical: spacing[3] },
  scanLine: { width: '92%', height: 2, borderRadius: 1, backgroundColor: '#d4d7dd', marginTop: spacing[3] },
  teacherRing: { position: 'absolute', right: spacing[4], bottom: spacing[4], width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  teacherRingText: { color: colors.danger, fontFamily: typography.fonts.heading, fontSize: 22 },
  scanMeta: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 15 },
  secondaryAction: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], backgroundColor: colors.backgroundElevated },
  secondaryActionText: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  reviewState: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, padding: spacing[4], flexDirection: 'row', gap: spacing[3] },
  reviewCopy: { flex: 1, minWidth: 0 },
  reviewTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 15 },
  reviewText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 15, marginTop: 3 },
  reviewLabel: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  reviewInput: { minHeight: 120, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18, padding: spacing[3], textAlignVertical: 'top' },
  helperText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 14 },
  errorText: { color: colors.danger, fontFamily: typography.fonts.bodyBold, fontSize: 10, lineHeight: 15 },
  disabled: { opacity: 0.58 },
  stateSurface: { flex: 1, marginHorizontal: spacing[3], borderTopLeftRadius: 28, borderTopRightRadius: 28, alignItems: 'center', justifyContent: 'center', gap: spacing[3], backgroundColor: '#fffaf2', padding: spacing[5] },
  stateTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 20, textAlign: 'center' },
  stateMessage: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  stateActions: { flexDirection: 'row', gap: spacing[2] },
  stateSecondary: { minHeight: 44, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[4], alignItems: 'center', justifyContent: 'center' },
  stateSecondaryText: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  statePrimary: { minHeight: 44, borderRadius: radius.full, backgroundColor: '#07152d', paddingHorizontal: spacing[4], alignItems: 'center', justifyContent: 'center' },
  statePrimaryText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
})
