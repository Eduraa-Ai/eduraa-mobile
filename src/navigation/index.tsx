import React from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { AnimatedButton, AnimatedCard, AppScreen, AuthLogoMark, BottomTabBar, GradientHeroCard } from '../components/ui'
import { useAuthStore } from '../stores/authStore'
import { colors } from '../theme/colors'
import { fonts } from '../theme/fonts'
import { spacing } from '../theme/spacing'
import type { AccountMinimal, AuthToken } from '../types'
import { resolveMobileLanding } from '../auth/landing'

import LoginScreen from '../screens/auth/LoginScreen'
import RegisterScreen from '../screens/auth/RegisterScreen'
import RegisterIndividualScreen from '../screens/auth/RegisterIndividualScreen'
import RegisterSchoolScreen from '../screens/auth/RegisterSchoolScreen'
import VerifyEmailScreen from '../screens/auth/VerifyEmailScreen'
import RegistrationCompleteScreen from '../screens/auth/RegistrationCompleteScreen'
import HomeScreen from '../screens/home/HomeScreen'
import PapersScreen from '../screens/papers/PapersScreen'
import GeneratePaperScreen from '../screens/papers/GeneratePaperScreen'
import PaperDetailScreen from '../screens/papers/PaperDetailScreen'
import AttemptPaperScreen from '../screens/papers/AttemptPaperScreen'
import QuizScreen from '../screens/papers/QuizScreen'
import ResultsScreen from '../screens/results/ResultsScreen'
import ResultDetailScreen from '../screens/results/ResultDetailScreen'
import QuestionEvidenceScreen from '../screens/results/QuestionEvidenceScreen'
import LearningHomeScreen from '../screens/learning/LearningHomeScreen'
import CompetitiveExamScreen from '../screens/learning/CompetitiveExamScreen'
import CompetitiveSubjectScreen from '../screens/learning/CompetitiveSubjectScreen'
import CompetitiveChapterScreen from '../screens/learning/CompetitiveChapterScreen'
import AgenticLearningScreen from '../screens/learning/AgenticLearningScreen'
import AgenticSubjectScreen from '../screens/learning/AgenticSubjectScreen'
import AgenticTopicScreen from '../screens/learning/AgenticTopicScreen'
import PreviousPapersScreen from '../screens/learning/PreviousPapersScreen'
import LearningResourcesScreen from '../screens/learning/LearningResourcesScreen'
import LearningResourceDetailScreen from '../screens/learning/LearningResourceDetailScreen'
import CheatSheetDetailScreen from '../screens/learning/CheatSheetDetailScreen'
import StudyPackScreen from '../screens/learning/StudyPackScreen'
import WorkspaceScreen from '../screens/workspace/WorkspaceScreen'
import FeatureScreen from '../screens/workspace/FeatureScreen'
import ApprovalsScreen from '../screens/workspace/ApprovalsScreen'
import AttendanceScreen from '../screens/workspace/AttendanceScreen'
import ScanUploadScreen from '../screens/workspace/ScanUploadScreen'
import ExamsScreen from '../screens/workspace/ExamsScreen'
import AIStudioScreen from '../screens/studio/AIStudioScreen'
import ProfileScreen from '../screens/profile/ProfileScreen'

export type AuthStackParamList = {
  Login: undefined
  Register: undefined
  RegisterIndividual: undefined
  RegisterSchool: undefined
  VerifyEmail: { email: string; devOtp?: string; message?: string; deliveryChannel?: string }
  RegistrationComplete: { authToken: AuthToken }
}

export type PapersStackParamList = {
  PapersList: undefined
  GeneratePaper: undefined
  PaperDetail: { paperId: string }
  AttemptPaper: { paperId: string; examId?: string }
  Quiz: { paperId: string }
}

export type ResultsStackParamList = {
  ResultsList: undefined
  ResultDetail: { submissionId?: string; checkedPaperId?: string }
  QuestionEvidence: { checkedPaperId: string; questionId?: string; questionIndex?: number }
}

export type LearningStackParamList = {
  LearningHome: undefined
  CompetitiveExam: undefined
  CompetitiveSubject: { subjectName: string }
  CompetitiveChapter: { subjectName: string; chapterKey: string }
  AgenticLearning: undefined
  AgenticSubject: { subjectId: string }
  AgenticTopic: { topicId: string; topicName?: string; subjectName?: string }
  PreviousPapers: undefined
  LearningResources: undefined
  LearningResourceDetail: { resourceId: string }
  CheatSheetDetail: { cheatSheetId: string }
  StudyPack: { subject?: string; chapter?: string; standard?: '11th' | '12th' }
  Feature: { featureId: string }
  Approvals: undefined
  Attendance: undefined
  ScanUpload: undefined
  Exams: undefined
  AIStudio: undefined
}

export type StaffWorkspaceStackParamList = {
  StaffWorkspace: undefined
  Feature: { featureId: string }
  Approvals: undefined
  Attendance: undefined
  ScanUpload: undefined
  Exams: undefined
  StaffAIStudio: undefined
  StaffGeneratePaper: undefined
  StaffPapers: undefined
  StaffResults: undefined
  ResultDetail: { submissionId?: string; checkedPaperId?: string }
  QuestionEvidence: { checkedPaperId: string; questionId?: string; questionIndex?: number }
}

export type ProfileStackParamList = {
  ProfileMain: undefined
}

export type TabParamList = {
  Home: undefined
  Learning: undefined
  Papers: undefined
  Results: undefined
  Profile: undefined
}

export type StaffTabParamList = {
  StaffHome: undefined
  StaffApprovals: undefined
  StaffAttendance: undefined
  StaffScanUpload: undefined
  StaffExams: undefined
  StaffPapers: undefined
  StaffResults: undefined
  StaffAIStudio: undefined
}

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const PapersStack = createNativeStackNavigator<PapersStackParamList>()
const ResultsStack = createNativeStackNavigator<ResultsStackParamList>()
const LearningStack = createNativeStackNavigator<LearningStackParamList>()
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>()
const StaffWorkspaceStack = createNativeStackNavigator<StaffWorkspaceStackParamList>()
const Tab = createBottomTabNavigator<TabParamList>()
const StaffTab = createBottomTabNavigator<StaffTabParamList>()
const OnboardingStack = createNativeStackNavigator<{ B2COnboarding: undefined }>()

const stackScreenOptions = {
  headerStyle: {
    backgroundColor: colors.backgroundElevated,
  },
  headerTintColor: colors.text,
  headerTitleStyle: {
    fontFamily: fonts.displaySemibold,
    fontSize: 17,
    color: colors.text,
  },
  headerShadowVisible: false,
  contentStyle: {
    backgroundColor: colors.background,
  },
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="RegisterIndividual" component={RegisterIndividualScreen} />
      <AuthStack.Screen name="RegisterSchool" component={RegisterSchoolScreen} />
      <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <AuthStack.Screen name="RegistrationComplete" component={RegistrationCompleteScreen} options={{ gestureEnabled: false }} />
    </AuthStack.Navigator>
  )
}

function PapersNavigator() {
  return (
    <PapersStack.Navigator screenOptions={stackScreenOptions}>
      <PapersStack.Screen name="PapersList" component={PapersScreen} options={{ title: 'Papers' }} />
      <PapersStack.Screen name="GeneratePaper" component={GeneratePaperScreen} options={{ title: 'Generate paper' }} />
      <PapersStack.Screen name="PaperDetail" component={PaperDetailScreen} options={{ title: 'Paper detail' }} />
      <PapersStack.Screen name="AttemptPaper" component={AttemptPaperScreen} options={{ headerShown: false }} />
      <PapersStack.Screen name="Quiz" component={QuizScreen} options={{ headerShown: false }} />
    </PapersStack.Navigator>
  )
}

function ResultsNavigator() {
  return (
    <ResultsStack.Navigator screenOptions={stackScreenOptions}>
      <ResultsStack.Screen name="ResultsList" component={ResultsScreen} options={{ headerShown: false }} />
      <ResultsStack.Screen name="ResultDetail" component={ResultDetailScreen} options={{ headerShown: false }} />
      <ResultsStack.Screen name="QuestionEvidence" component={QuestionEvidenceScreen} options={{ headerShown: false }} />
    </ResultsStack.Navigator>
  )
}

function LearningNavigator({ competitive = false }: { competitive?: boolean }) {
  return (
    <LearningStack.Navigator initialRouteName={competitive ? 'CompetitiveExam' : 'LearningHome'} screenOptions={stackScreenOptions}>
      <LearningStack.Screen name="LearningHome" component={LearningHomeScreen} options={{ title: 'Learning' }} />
      <LearningStack.Screen name="CompetitiveExam" component={CompetitiveExamScreen} options={{ title: 'JEE resources' }} />
      <LearningStack.Screen name="CompetitiveSubject" component={CompetitiveSubjectScreen} options={{ title: 'Competitive subject' }} />
      <LearningStack.Screen name="CompetitiveChapter" component={CompetitiveChapterScreen} options={{ title: 'Chapter workspace' }} />
      <LearningStack.Screen name="AgenticLearning" component={AgenticLearningScreen} options={{ headerShown: false }} />
      <LearningStack.Screen name="AgenticSubject" component={AgenticSubjectScreen} options={{ headerShown: false }} />
      <LearningStack.Screen name="AgenticTopic" component={AgenticTopicScreen} options={{ headerShown: false }} />
      <LearningStack.Screen name="PreviousPapers" component={PreviousPapersScreen} options={{ title: 'Previous papers' }} />
      <LearningStack.Screen name="LearningResources" component={LearningResourcesScreen} options={{ title: 'Learning resources' }} />
      <LearningStack.Screen name="LearningResourceDetail" component={LearningResourceDetailScreen} options={{ title: 'Resource' }} />
      <LearningStack.Screen name="CheatSheetDetail" component={CheatSheetDetailScreen} options={{ title: 'Cheat sheet' }} />
      <LearningStack.Screen name="StudyPack" component={StudyPackScreen} options={{ title: 'Study pack' }} />
      <LearningStack.Screen name="Feature" component={FeatureScreen} options={{ title: 'Feature' }} />
      <LearningStack.Screen name="Approvals" component={ApprovalsScreen} options={{ title: 'Approvals' }} />
      <LearningStack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <LearningStack.Screen name="ScanUpload" component={ScanUploadScreen} options={{ title: 'Scan upload' }} />
      <LearningStack.Screen name="Exams" component={ExamsScreen} options={{ title: 'Exams' }} />
      <LearningStack.Screen name="AIStudio" component={AIStudioScreen} options={{ headerShown: false }} />
    </LearningStack.Navigator>
  )
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ title: 'Profile', headerShown: false }}
      />
    </ProfileStack.Navigator>
  )
}

function StudentTabs({ competitive = false }: { competitive?: boolean }) {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home">
        {() => <HomeScreen competitive={competitive} />}
      </Tab.Screen>
      <Tab.Screen name="Learning" options={{ title: 'Learning' }}>
        {() => <LearningNavigator competitive={competitive} />}
      </Tab.Screen>
      <Tab.Screen name="Papers" component={PapersNavigator} options={{ title: 'Papers' }} />
      <Tab.Screen name="Results" component={ResultsNavigator} options={{ title: 'Results' }} />
      <Tab.Screen name="Profile" component={ProfileNavigator} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}

function StaffWorkspaceNavigator() {
  return (
    <StaffWorkspaceStack.Navigator screenOptions={stackScreenOptions}>
      <StaffWorkspaceStack.Screen name="StaffWorkspace" component={WorkspaceScreen} options={{ title: 'Workspace' }} />
      <StaffWorkspaceStack.Screen name="Feature" component={FeatureScreen} options={{ title: 'Feature' }} />
      <StaffWorkspaceStack.Screen name="Approvals" component={ApprovalsScreen} options={{ title: 'Approvals' }} />
      <StaffWorkspaceStack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <StaffWorkspaceStack.Screen name="ScanUpload" component={ScanUploadScreen} options={{ title: 'Scan upload' }} />
      <StaffWorkspaceStack.Screen name="Exams" component={ExamsScreen} options={{ title: 'Exams' }} />
      <StaffWorkspaceStack.Screen name="StaffAIStudio" component={AIStudioScreen} options={{ headerShown: false }} />
      <StaffWorkspaceStack.Screen name="StaffGeneratePaper" component={GeneratePaperScreen} options={{ title: 'Generate paper' }} />
      <StaffWorkspaceStack.Screen name="StaffPapers" component={PapersScreen} options={{ title: 'Papers' }} />
      <StaffWorkspaceStack.Screen name="StaffResults" component={ResultsScreen} options={{ title: 'Checked papers' }} />
      <StaffWorkspaceStack.Screen name="ResultDetail" component={ResultDetailScreen} options={{ headerShown: false }} />
      <StaffWorkspaceStack.Screen name="QuestionEvidence" component={QuestionEvidenceScreen} options={{ headerShown: false }} />
    </StaffWorkspaceStack.Navigator>
  )
}

function StaffTabs() {
  return (
    <StaffTab.Navigator
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <StaffTab.Screen name="StaffHome" component={StaffWorkspaceNavigator} options={{ title: 'Workspace' }} />
      <StaffTab.Screen name="StaffApprovals" component={ApprovalsScreen} options={{ title: 'Approvals' }} />
      <StaffTab.Screen name="StaffAttendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <StaffTab.Screen name="StaffScanUpload" component={ScanUploadScreen} options={{ title: 'Scan' }} />
      <StaffTab.Screen name="StaffExams" component={ExamsScreen} options={{ title: 'Exams' }} />
      <StaffTab.Screen name="StaffPapers" component={PapersNavigator} options={{ title: 'Papers' }} />
      <StaffTab.Screen name="StaffResults" component={ResultsNavigator} options={{ title: 'Results' }} />
      <StaffTab.Screen name="StaffAIStudio" component={AIStudioScreen} options={{ title: 'AI Studio' }} />
    </StaffTab.Navigator>
  )
}

function B2COnboardingScreen() {
  return <ProfileScreen mode="onboarding" />
}

function OnboardingNavigator() {
  return (
    <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
      <OnboardingStack.Screen name="B2COnboarding" component={B2COnboardingScreen} />
    </OnboardingStack.Navigator>
  )
}

function AuthenticatedNavigator({ user }: { user: AccountMinimal }) {
  const landing = resolveMobileLanding(user)
  if (landing === 'b2c_onboarding') return <OnboardingNavigator />
  if (landing === 'competitive_learner') return <StudentTabs competitive />
  if (landing === 'school_learner') return <StudentTabs />
  if (landing === 'admin_workspace') return <StaffTabs />
  if (landing === 'developer_workspace') return <StaffTabs />
  return <StaffTabs />
}

export default function RootNavigator({ onRetrySession }: { onRetrySession?: () => void }) {
  const { isAuthenticated, isLoading, sessionRestoreError, token, user } = useAuthStore()

  if (isLoading && !(token && !user)) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading Eduraa</Text>
      </View>
    )
  }

  if (token && !user && (sessionRestoreError || isLoading)) {
    return (
      <View style={styles.recoveryRoot}>
        <View style={styles.recoveryContent}>
          <View style={styles.recoveryBrand}>
            <AuthLogoMark size={50} />
            <View>
              <Text style={styles.recoveryBrandName}>EDURAA</Text>
              <Text style={styles.recoveryBrandLine}>INTELLIGENCE FOR SERIOUS LEARNING</Text>
            </View>
          </View>

          <Text style={styles.recoveryEyebrow}>{isLoading ? 'VERIFYING SAVED SESSION' : 'YOUR PLACE IS HELD'}</Text>
          <Text style={styles.recoveryTitle}>{isLoading ? 'Finding your place in Eduraa.' : 'Connection paused. Your progress isn’t.'}</Text>
          <Text style={styles.recoveryCopy}>{isLoading ? 'We’re securely reconnecting this device to your account.' : sessionRestoreError}</Text>

          <View style={styles.recoveryStatus}>
            <View style={styles.recoveryStatusIcon}>
              {isLoading ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="cloud-offline-outline" size={20} color={colors.accent} />}
            </View>
            <View style={styles.recoveryStatusCopy}>
              <Text style={styles.recoveryStatusTitle}>{isLoading ? 'Checking your session' : 'Waiting for Eduraa'}</Text>
              <Text style={styles.recoveryStatusBody}>{isLoading ? 'This usually takes only a moment. Keep Eduraa open while we verify access.' : 'Check your connection, then retry. We won’t send you back to sign in for a temporary outage.'}</Text>
            </View>
          </View>

          <AnimatedButton label={isLoading ? 'Checking connection' : 'Try connection again'} loading={isLoading} onPress={() => onRetrySession?.()} style={styles.recoveryAction} />
          <Text style={styles.recoveryFootnote}>Your saved session stays on this device.</Text>
        </View>
      </View>
    )
  }

  const landingKey = user ? resolveMobileLanding(user) : 'auth'
  return (
    <NavigationContainer key={landingKey}>
      {isAuthenticated && user ? <AuthenticatedNavigator user={user} /> : <AuthNavigator />}
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  recoveryRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[8],
    backgroundColor: colors.canvasWarm,
  },
  recoveryContent: {
    width: '100%',
    maxWidth: 390,
    alignSelf: 'center',
  },
  recoveryBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  recoveryBrandName: {
    color: colors.nav,
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 3,
  },
  recoveryBrandLine: {
    marginTop: 2,
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 7,
    letterSpacing: 0.8,
  },
  recoveryEyebrow: {
    marginTop: spacing[10],
    color: colors.accent,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  recoveryTitle: {
    maxWidth: 360,
    marginTop: spacing[3],
    color: colors.nav,
    fontFamily: fonts.displaySemibold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
  },
  recoveryCopy: {
    maxWidth: 350,
    marginTop: spacing[3],
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 21,
  },
  recoveryStatus: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    marginTop: spacing[7],
    paddingTop: spacing[5],
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
  },
  recoveryStatusIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.accentSurface,
  },
  recoveryStatusCopy: {
    flex: 1,
  },
  recoveryStatusTitle: {
    color: colors.nav,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  recoveryStatusBody: {
    marginTop: spacing[1],
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  recoveryAction: {
    width: '100%',
    marginTop: spacing[7],
  },
  recoveryFootnote: {
    marginTop: spacing[3],
    color: colors.textSoft,
    fontFamily: fonts.medium,
    fontSize: 11,
    textAlign: 'center',
  },
  roleGateContent: {
    justifyContent: 'center',
  },
  roleGateCard: {
    gap: spacing[3],
  },
  rolePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  rolePillText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  roleGateTitle: {
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 22,
    lineHeight: 28,
  },
  roleGateCopy: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
  },
})
