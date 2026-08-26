import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { NavigationContainer, type LinkingOptions, type NavigatorScreenParams } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { AnimatedButton, AnimatedCard, AppScreen, AuthLogoMark, BottomTabBar, GradientHeroCard } from '../components/ui'
import { useAuthStore } from '../stores/authStore'
import { colors } from '../theme/colors'
import { fonts } from '../theme/fonts'
import { spacing } from '../theme/spacing'
import type { AccountMinimal, AuthToken } from '../types'
import {
  isCheatSheetsEligible,
  isPreviousPapersEligible,
  resolveMobileLanding,
} from '../auth/landing'

import LoginScreen from '../screens/auth/LoginScreen'
import RegisterScreen from '../screens/auth/RegisterScreen'
import RegisterIndividualScreen from '../screens/auth/RegisterIndividualScreen'
import RegisterSchoolScreen from '../screens/auth/RegisterSchoolScreen'
import VerifyEmailScreen from '../screens/auth/VerifyEmailScreen'
import RegistrationCompleteScreen from '../screens/auth/RegistrationCompleteScreen'
import SchoolApprovalStatusScreen from '../screens/auth/SchoolApprovalStatusScreen'
import HomeScreen from '../screens/home/HomeScreen'
import PapersScreen from '../screens/papers/PapersScreen'
import GeneratePaperScreen from '../screens/papers/GeneratePaperScreen'
import CustomPaperScreen from '../screens/papers/CustomPaperScreen'
import PaperDetailScreen from '../screens/papers/PaperDetailScreen'
import AttemptPaperScreen from '../screens/papers/AttemptPaperScreen'
import QuizScreen from '../screens/papers/QuizScreen'
import ResultsScreen from '../screens/results/ResultsScreen'
import ResultDetailScreen from '../screens/results/ResultDetailScreen'
import QuestionEvidenceScreen from '../screens/results/QuestionEvidenceScreen'
import CheckedPaperWorkspaceScreen from '../screens/results/CheckedPaperWorkspaceScreen'
import CompetitiveExamScreen from '../screens/learning/CompetitiveExamScreen'
import CompetitiveSubjectScreen from '../screens/learning/CompetitiveSubjectScreen'
import CompetitiveChapterScreen from '../screens/learning/CompetitiveChapterScreen'
import AgenticLearningScreen from '../screens/learning/AgenticLearningScreen'
import AgenticSubjectScreen from '../screens/learning/AgenticSubjectScreen'
import AgenticTopicScreen from '../screens/learning/AgenticTopicScreen'
import PreviousPapersScreen from '../screens/learning/PreviousPapersScreen'
import CheatSheetsScreen from '../screens/learning/CheatSheetsScreen'
import WorkspaceScreen from '../screens/workspace/WorkspaceScreen'
import FeatureScreen from '../screens/workspace/FeatureScreen'
import ApprovalsScreen from '../screens/workspace/ApprovalsScreen'
import AttendanceScreen from '../screens/workspace/AttendanceScreen'
import ScanUploadScreen from '../screens/workspace/ScanUploadScreen'
import CheckedPaperStatusScreen from '../screens/workspace/CheckedPaperStatusScreen'
import ExamsScreen from '../screens/workspace/ExamsScreen'
import AnnouncementsScreen from '../screens/workspace/AnnouncementsScreen'
import DoubtsScreen from '../screens/workspace/DoubtsScreen'
import ClassTeacherOverviewScreen from '../screens/classTeacher/ClassTeacherOverviewScreen';
import ClassRosterScreen from '../screens/classTeacher/ClassRosterScreen';
import ClassSubjectsScreen from '../screens/classTeacher/ClassSubjectsScreen';
import SubjectEnrollmentScreen from '../screens/classTeacher/SubjectEnrollmentScreen';
import ClassValidationScreen from '../screens/classTeacher/ClassValidationScreen';
import AIStudioScreen from '../screens/studio/AIStudioScreen'
import ProfileScreen from '../screens/profile/ProfileScreen'
import { canAccessApprovalActions } from '../screens/workspace/approvalsModel'

export type AuthStackParamList = {
  Login: undefined
  Register: undefined
  RegisterIndividual: undefined
  RegisterSchool: undefined
  VerifyEmail: { email: string; devOtp?: string; message?: string; deliveryChannel?: string }
  RegistrationComplete: { authToken: AuthToken }
  SchoolApprovalStatus: { identifier?: string; role?: 'student' | 'teacher' | 'principal'; displayName?: string } | undefined
}

export type PapersStackParamList = {
  PapersList: undefined
  GeneratePaper: undefined
  CustomPaper: undefined
  PaperDetail: {
    paperId: string
    generationNotice?: string
    presentation?: 'teacher_reference'
  }
  AttemptPaper: {
    paperId: string
    examId?: string
    launchKey?: string
    returnTo?: 'PreviousPapers'
  }
  Quiz: { paperId: string; examId?: string }
}

export type ResultsStackParamList = {
  ResultsList: undefined;
  ResultDetail: { submissionId?: string; checkedPaperId?: string };
  CheckedPaperStatus: { checkedPaperId: string };
  CheckedPaperWorkspace: { checkedPaperId: string; questionId?: string; questionIndex?: number };
  QuestionEvidence: {
    checkedPaperId: string;
    questionId?: string;
    questionIndex?: number;
  };
};

export type ScanUploadParams = {
  initialPaperId?: string
  initialExamId?: string
  initialStudentId?: string
  initialSubjectId?: string
} | undefined

export type HomeStackParamList = {
  HomeMain: undefined
  CompetitiveExam: undefined
  CompetitiveSubject: { subjectName: string }
  CompetitiveChapter: { subjectName: string; chapterKey: string }
  AgenticLearning: { origin?: 'checked-paper'; checkedPaperId?: string } | undefined
  AgenticSubject: { subjectId: string }
  AgenticTopic: { topicId: string; topicName?: string; subjectName?: string; origin?: 'checked-paper'; checkedPaperId?: string }
  Feature: { featureId: string }
  Approvals: undefined
  Attendance: undefined
  ScanUpload: ScanUploadParams
  Exams: undefined
  Announcements: { announcementId?: string } | undefined
  Doubts: { doubtId?: string } | undefined
  AIStudio: undefined
}

export type StaffWorkspaceStackParamList = {
  StaffWorkspace: undefined;
  ClassTeacherOverview: undefined;
  ClassRoster: undefined;
  ClassSubjects: undefined;
  SubjectEnrollment: { subjectId: string; subjectName: string };
  ClassValidation: undefined;
  Feature: { featureId: string };
  Approvals: undefined;
  Attendance: undefined;
  ScanUpload: ScanUploadParams;
  CheckedPaperStatus: { checkedPaperId: string };
  CheckedPaperWorkspace: { checkedPaperId: string; questionId?: string; questionIndex?: number };
  Exams: undefined;
  Announcements: { announcementId?: string } | undefined;
  Doubts: { doubtId?: string } | undefined;
  StaffAIStudio: undefined;
  StaffGeneratePaper: undefined;
  StaffCustomPaper: undefined;
  StaffPapers: undefined;
  StaffResults: undefined;
  ResultDetail: { submissionId?: string; checkedPaperId?: string };
  QuestionEvidence: {
    checkedPaperId: string;
    questionId?: string;
    questionIndex?: number;
  };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
};

export type TabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList> | undefined
  Papers: undefined
  Results: NavigatorScreenParams<ResultsStackParamList> | undefined
  Profile: undefined
  PreviousPapers: undefined
  CheatSheets: undefined
  Attendance: undefined
}

export type StaffTabParamList = {
  StaffHome: undefined;
  StaffApprovals: undefined;
  StaffAttendance: undefined;
  StaffScanUpload: undefined;
  StaffExams: undefined;
  StaffPapers: NavigatorScreenParams<PapersStackParamList> | undefined;
  StaffPreviousPapers: undefined;
  StaffResults: undefined;
  StaffAIStudio: undefined;
  StaffProfile: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const PapersStack = createNativeStackNavigator<PapersStackParamList>();
const ResultsStack = createNativeStackNavigator<ResultsStackParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const StaffWorkspaceStack =
  createNativeStackNavigator<StaffWorkspaceStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const StaffTab = createBottomTabNavigator<StaffTabParamList>();
const OnboardingStack = createNativeStackNavigator<{
  B2COnboarding: undefined;
}>();

const linking: LinkingOptions<any> = {
  prefixes: ['eduraa://'],
  config: {
    screens: {
      Home: {
        screens: {
          // Without an explicit path the router falls back to the route name and
          // parks the shell on "/HomeMain" after sign-in.
          HomeMain: '',
          AgenticLearning: 'learning/agentic',
          AgenticSubject: 'learning/agentic/subjects/:subjectId',
          AgenticTopic: 'learning/agentic/topics/:topicId',
          Announcements: 'announcements/:announcementId?',
          Doubts: 'student/doubts/:doubtId?',
        },
      },
      StaffHome: {
        screens: {
          Doubts: 'teacher/doubts/:doubtId?',
          CheckedPaperWorkspace: 'teacher/results/checked/:checkedPaperId/review',
        },
      },
      Results: {
        screens: {
          ResultDetail: 'results/checked/:checkedPaperId',
          CheckedPaperWorkspace: 'results/checked/:checkedPaperId/review',
        },
      },
    },
  },
}

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
};

function CustomPaperHeaderBackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to generate paper"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.customPaperBack,
        pressed && styles.customPaperBackPressed,
      ]}
    >
      <Ionicons name="chevron-back" size={20} color={colors.text} />
      <Text style={styles.customPaperBackText}>Back</Text>
    </Pressable>
  )
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen
        name="RegisterIndividual"
        component={RegisterIndividualScreen}
      />
      <AuthStack.Screen
        name="RegisterSchool"
        component={RegisterSchoolScreen}
      />
      <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <AuthStack.Screen name="RegistrationComplete" component={RegistrationCompleteScreen} options={{ gestureEnabled: false }} />
      <AuthStack.Screen name="SchoolApprovalStatus" component={SchoolApprovalStatusScreen} />
    </AuthStack.Navigator>
  );
}

function PapersNavigator() {
  return (
    <PapersStack.Navigator screenOptions={stackScreenOptions}>
      <PapersStack.Screen
        name="PapersList"
        component={PapersScreen}
        options={{ title: "Papers" }}
      />
      <PapersStack.Screen
        name="GeneratePaper"
        component={GeneratePaperScreen}
        options={{ title: "Generate paper" }}
      />
      <PapersStack.Screen
        name="CustomPaper"
        component={CustomPaperScreen}
        options={({ navigation }) => ({
          title: "Custom paper",
          headerBackVisible: false,
          headerLeft: () => (
            <CustomPaperHeaderBackButton
              onPress={() => {
                if (navigation.canGoBack()) navigation.goBack()
                else navigation.navigate('GeneratePaper')
              }}
            />
          ),
        })}
      />
      <PapersStack.Screen
        name="PaperDetail"
        component={PaperDetailScreen}
        options={{ title: "Paper detail" }}
      />
      <PapersStack.Screen
        name="AttemptPaper"
        component={AttemptPaperScreen}
        options={{ headerShown: false }}
      />
      <PapersStack.Screen
        name="Quiz"
        component={QuizScreen}
        options={{ headerShown: false }}
      />
    </PapersStack.Navigator>
  );
}

function ResultsNavigator() {
  return (
    <ResultsStack.Navigator screenOptions={stackScreenOptions}>
      <ResultsStack.Screen
        name="ResultsList"
        component={ResultsScreen}
        options={{ headerShown: false }}
      />
      <ResultsStack.Screen
        name="ResultDetail"
        component={ResultDetailScreen}
        options={{ headerShown: false }}
      />
      <ResultsStack.Screen
        name="CheckedPaperStatus"
        component={CheckedPaperStatusScreen}
        options={{ title: 'Paper status' }}
      />
      <ResultsStack.Screen
        name="QuestionEvidence"
        component={QuestionEvidenceScreen}
        options={{ headerShown: false }}
      />
      <ResultsStack.Screen
        name="CheckedPaperWorkspace"
        component={CheckedPaperWorkspaceScreen}
        options={{ headerShown: false }}
      />
    </ResultsStack.Navigator>
  );
}

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="CompetitiveExam" component={CompetitiveExamScreen} options={{ title: 'JEE resources' }} />
      <HomeStack.Screen name="CompetitiveSubject" component={CompetitiveSubjectScreen} options={{ title: 'Competitive subject' }} />
      <HomeStack.Screen name="CompetitiveChapter" component={CompetitiveChapterScreen} options={{ title: 'Chapter workspace' }} />
      <HomeStack.Screen name="AgenticLearning" component={AgenticLearningScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="AgenticSubject" component={AgenticSubjectScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="AgenticTopic" component={AgenticTopicScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Feature" component={FeatureScreen} options={{ title: 'Feature' }} />
      <HomeStack.Screen name="Approvals" component={ApprovalsScreen} options={{ title: 'Approvals' }} />
      <HomeStack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <HomeStack.Screen name="ScanUpload" component={ScanUploadScreen} options={{ title: 'Scan upload' }} />
      <HomeStack.Screen name="Exams" component={ExamsScreen} options={{ title: 'Exams' }} />
      <HomeStack.Screen name="Announcements" component={AnnouncementsScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Doubts" component={DoubtsScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="AIStudio" component={AIStudioScreen} options={{ headerShown: false }} />
    </HomeStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ title: "Profile", headerShown: false }}
      />
    </ProfileStack.Navigator>
  );
}

function StudentTabs({
  previousPapersEligible = false,
  previousPapersAccessibilityLabel = 'Previous-year JEE papers',
  cheatSheetsEligible = false,
  attendanceEligible = false,
}: {
  previousPapersEligible?: boolean
  previousPapersAccessibilityLabel?: string
  cheatSheetsEligible?: boolean
  attendanceEligible?: boolean
}) {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeNavigator} options={{ title: 'Home' }} />
      <Tab.Screen name="Papers" component={PapersNavigator} options={{ title: 'Papers' }} />
      <Tab.Screen name="Results" component={ResultsNavigator} options={{ title: 'Results' }} />
      <Tab.Screen name="Profile" component={ProfileNavigator} options={{ title: 'Profile' }} />
      {attendanceEligible ? (
        <Tab.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      ) : null}
      {previousPapersEligible ? (
        <Tab.Screen
          name="PreviousPapers"
          component={PreviousPapersScreen}
          options={{ title: 'Previous', tabBarAccessibilityLabel: previousPapersAccessibilityLabel }}
        />
      ) : null}
      {cheatSheetsEligible ? (
        <Tab.Screen
          name="CheatSheets"
          component={CheatSheetsScreen}
          options={{ title: 'Cheat sheets', tabBarAccessibilityLabel: 'Cheat sheets' }}
        />
      ) : null}
    </Tab.Navigator>
  );
}

function StaffWorkspaceNavigator() {
  return (
    <StaffWorkspaceStack.Navigator screenOptions={stackScreenOptions}>
      <StaffWorkspaceStack.Screen
        name="StaffWorkspace"
        component={WorkspaceScreen}
        options={{ title: "Workspace" }}
      />
      <StaffWorkspaceStack.Screen
        name="ClassTeacherOverview"
        component={ClassTeacherOverviewScreen}
        options={{ title: "My class" }}
      />
      <StaffWorkspaceStack.Screen
        name="ClassRoster"
        component={ClassRosterScreen}
        options={{ title: "Roster and divisions" }}
      />
      <StaffWorkspaceStack.Screen
        name="ClassSubjects"
        component={ClassSubjectsScreen}
        options={{ title: "Subjects and enrollment" }}
      />
      <StaffWorkspaceStack.Screen
        name="SubjectEnrollment"
        component={SubjectEnrollmentScreen}
        options={{ title: "Subject enrollment" }}
      />
      <StaffWorkspaceStack.Screen
        name="ClassValidation"
        component={ClassValidationScreen}
        options={{ title: "Validation report" }}
      />
      <StaffWorkspaceStack.Screen
        name="Feature"
        component={FeatureScreen}
        options={{ title: "Feature" }}
      />
      <StaffWorkspaceStack.Screen
        name="Approvals"
        component={ApprovalsScreen}
        options={{ title: "Approvals" }}
      />
      <StaffWorkspaceStack.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{ title: "Attendance" }}
      />
      <StaffWorkspaceStack.Screen
        name="ScanUpload"
        component={ScanUploadScreen}
        options={{ title: "Scan upload" }}
      />
      <StaffWorkspaceStack.Screen
        name="CheckedPaperStatus"
        component={CheckedPaperStatusScreen}
        options={{ title: "Scan status" }}
      />
      <StaffWorkspaceStack.Screen
        name="Exams"
        component={ExamsScreen}
        options={{ title: "Exams" }}
      />
      <StaffWorkspaceStack.Screen
        name="Doubts"
        component={DoubtsScreen}
        options={{ headerShown: false }}
      />
      <StaffWorkspaceStack.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={{ headerShown: false }}
      />
      <StaffWorkspaceStack.Screen
        name="StaffAIStudio"
        component={AIStudioScreen}
        options={{ headerShown: false }}
      />
      <StaffWorkspaceStack.Screen
        name="StaffGeneratePaper"
        component={GeneratePaperScreen}
        options={{ title: "Generate paper" }}
      />
      <StaffWorkspaceStack.Screen
        name="StaffCustomPaper"
        component={CustomPaperScreen}
        options={({ navigation }) => ({
          title: "Custom paper",
          headerBackVisible: false,
          headerLeft: () => (
            <CustomPaperHeaderBackButton
              onPress={() => {
                if (navigation.canGoBack()) navigation.goBack()
                else navigation.navigate('StaffGeneratePaper')
              }}
            />
          ),
        })}
      />
      <StaffWorkspaceStack.Screen
        name="StaffPapers"
        component={PapersScreen}
        options={{ title: "Papers" }}
      />
      <StaffWorkspaceStack.Screen
        name="StaffResults"
        component={ResultsScreen}
        options={{ title: "Checked papers" }}
      />
      <StaffWorkspaceStack.Screen
        name="ResultDetail"
        component={ResultDetailScreen}
        options={{ headerShown: false }}
      />
      <StaffWorkspaceStack.Screen
        name="QuestionEvidence"
        component={QuestionEvidenceScreen}
        options={{ headerShown: false }}
      />
      <StaffWorkspaceStack.Screen
        name="CheckedPaperWorkspace"
        component={CheckedPaperWorkspaceScreen}
        options={{ headerShown: false }}
      />
    </StaffWorkspaceStack.Navigator>
  );
}

function StaffTabs({ user }: { user: AccountMinimal }) {
  return (
    <StaffTab.Navigator
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <StaffTab.Screen
        name="StaffHome"
        component={StaffWorkspaceNavigator}
        options={{ title: "Workspace" }}
      />
      {canAccessApprovalActions(user.role) ? (
        <StaffTab.Screen
          name="StaffApprovals"
          component={ApprovalsScreen}
          options={{ title: "Approvals", tabBarStyle: { display: 'none' } }}
        />
      ) : null}
      <StaffTab.Screen
        name="StaffAttendance"
        component={AttendanceScreen}
        options={{ title: "Attendance" }}
      />
      <StaffTab.Screen
        name="StaffScanUpload"
        component={ScanUploadScreen}
        options={{ title: "Scan" }}
      />
      <StaffTab.Screen
        name="StaffExams"
        component={ExamsScreen}
        options={{ title: "Exams" }}
      />
      <StaffTab.Screen
        name="StaffPapers"
        component={PapersNavigator}
        options={{ title: "Papers" }}
      />
      {user.role === 'teacher' ? (
        <StaffTab.Screen
          name="StaffPreviousPapers"
          component={PreviousPapersScreen}
          options={{ title: "Previous", tabBarAccessibilityLabel: "School previous question papers" }}
        />
      ) : null}
      <StaffTab.Screen
        name="StaffResults"
        component={ResultsNavigator}
        options={{ title: "Results" }}
      />
      <StaffTab.Screen
        name="StaffAIStudio"
        component={AIStudioScreen}
        options={{ title: "AI Studio" }}
      />
      {user.role === 'teacher' || user.role === 'principal' ? (
        <StaffTab.Screen
          name="StaffProfile"
          component={ProfileNavigator}
          options={{ title: "Profile" }}
        />
      ) : null}
    </StaffTab.Navigator>
  );
}

function B2COnboardingScreen() {
  return <ProfileScreen mode="onboarding" />;
}

function OnboardingNavigator() {
  return (
    <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
      <OnboardingStack.Screen
        name="B2COnboarding"
        component={B2COnboardingScreen}
      />
    </OnboardingStack.Navigator>
  );
}

function AuthenticatedNavigator({ user }: { user: AccountMinimal }) {
  const landing = resolveMobileLanding(user)
  if (landing === 'b2c_onboarding') return <OnboardingNavigator />
  if (landing === 'competitive_learner') {
    return (
      <StudentTabs
        previousPapersEligible={isPreviousPapersEligible(user)}
        cheatSheetsEligible={isCheatSheetsEligible(user)}
      />
    )
  }
  if (landing === 'school_learner') {
    return (
      <StudentTabs
        previousPapersEligible={isPreviousPapersEligible(user)}
        previousPapersAccessibilityLabel="School previous question papers"
        attendanceEligible={user?.role === 'student'}
      />
    )
  }
  if (landing === 'admin_workspace') return <StaffTabs user={user} />
  if (landing === 'developer_workspace') return <StaffTabs user={user} />
  return <StaffTabs user={user} />
}

export default function RootNavigator({
  onRetrySession,
}: {
  onRetrySession?: () => void;
}) {
  const { isAuthenticated, isLoading, sessionRestoreError, token, user } =
    useAuthStore();

  if (isLoading && !(token && !user)) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading Eduraa</Text>
      </View>
    );
  }

  if (token && !user && (sessionRestoreError || isLoading)) {
    return (
      <View style={styles.recoveryRoot}>
        <View style={styles.recoveryContent}>
          <View style={styles.recoveryBrand}>
            <AuthLogoMark size={50} />
            <View>
              <Text style={styles.recoveryBrandName}>EDURAA</Text>
              <Text style={styles.recoveryBrandLine}>
                INTELLIGENCE FOR SERIOUS LEARNING
              </Text>
            </View>
          </View>

          <Text style={styles.recoveryEyebrow}>
            {isLoading ? "VERIFYING SAVED SESSION" : "YOUR PLACE IS HELD"}
          </Text>
          <Text style={styles.recoveryTitle}>
            {isLoading
              ? "Finding your place in Eduraa."
              : "Connection paused. Your progress isn’t."}
          </Text>
          <Text style={styles.recoveryCopy}>
            {isLoading
              ? "We’re securely reconnecting this device to your account."
              : sessionRestoreError}
          </Text>

          <View style={styles.recoveryStatus}>
            <View style={styles.recoveryStatusIcon}>
              {isLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Ionicons
                  name="cloud-offline-outline"
                  size={20}
                  color={colors.accent}
                />
              )}
            </View>
            <View style={styles.recoveryStatusCopy}>
              <Text style={styles.recoveryStatusTitle}>
                {isLoading ? "Checking your session" : "Waiting for Eduraa"}
              </Text>
              <Text style={styles.recoveryStatusBody}>
                {isLoading
                  ? "This usually takes only a moment. Keep Eduraa open while we verify access."
                  : "Check your connection, then retry. We won’t send you back to sign in for a temporary outage."}
              </Text>
            </View>
          </View>

          <AnimatedButton
            label={isLoading ? "Checking connection" : "Try connection again"}
            loading={isLoading}
            onPress={() => onRetrySession?.()}
            style={styles.recoveryAction}
          />
          <Text style={styles.recoveryFootnote}>
            Your saved session stays on this device.
          </Text>
        </View>
      </View>
    );
  }

  const landingKey = user ? resolveMobileLanding(user) : "auth";
  return (
    <NavigationContainer key={landingKey} linking={linking}>
      {isAuthenticated && user ? <AuthenticatedNavigator user={user} /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  customPaperBack: {
    minWidth: 64,
    minHeight: 44,
    marginLeft: -spacing[2],
    paddingHorizontal: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 14,
  },
  customPaperBackPressed: {
    backgroundColor: colors.backgroundTint,
  },
  customPaperBackText: {
    color: colors.text,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
    justifyContent: "center",
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[8],
    backgroundColor: colors.canvasWarm,
  },
  recoveryContent: {
    width: "100%",
    maxWidth: 390,
    alignSelf: "center",
  },
  recoveryBrand: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    marginTop: spacing[7],
    paddingTop: spacing[5],
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
  },
  recoveryStatusIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
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
    width: "100%",
    marginTop: spacing[7],
  },
  recoveryFootnote: {
    marginTop: spacing[3],
    color: colors.textSoft,
    fontFamily: fonts.medium,
    fontSize: 11,
    textAlign: "center",
  },
  roleGateContent: {
    justifyContent: "center",
  },
  roleGateCard: {
    gap: spacing[3],
  },
  rolePill: {
    alignSelf: "flex-start",
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
    textTransform: "uppercase",
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
});
