/**
 * Eduraa Mobile — Student Tab Navigator
 * Used for roles: b2c_student, student
 */

import React from 'react'
import { Platform } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors } from '../theme/colors'
import { stackScreenOptions } from './shared'

// Screens
import StudentExamsNavigator from './StudentExamsNavigator'
import ScanNavigator from './ScanNavigator'
import HomeScreen from '../screens/home/HomeScreen'
import DashboardLabScreen from '../screens/home/DashboardLabScreen'
import PapersScreen from '../screens/papers/PapersScreen'
import GeneratePaperScreen from '../screens/papers/GeneratePaperScreen'
import PaperDetailScreen from '../screens/papers/PaperDetailScreen'
import AttemptPaperScreen from '../screens/papers/AttemptPaperScreen'
import QuizScreen from '../screens/papers/QuizScreen'
import ResultsScreen from '../screens/results/ResultsScreen'
import ResultDetailScreen from '../screens/results/ResultDetailScreen'
import AIStudioScreen from '../screens/studio/AIStudioScreen'
import ProfileScreen from '../screens/profile/ProfileScreen'
import EditProfileScreen from '../screens/profile/EditProfileScreen'
import StudentTeachersScreen from '../screens/teachers/StudentTeachersScreen'

// ─── Param Lists ──────────────────────────────────────────────────────────────

export type StudentPapersStackParamList = {
  PapersList: undefined
  GeneratePaper: undefined
  PaperDetail: { paperId: string; examId?: string }
  AttemptPaper: { paperId: string; examId?: string }
  Quiz: { paperId: string }
}

export type StudentResultsStackParamList = {
  ResultsList: undefined
  ResultDetail: { submissionId?: string; checkedPaperId?: string }
}

export type StudentProfileStackParamList = {
  ProfileMain: undefined
  EditProfile: undefined
  MyTeachers: undefined
}

export type StudentHomeStackParamList = {
  HomeMain: undefined
  DashboardLab: undefined
}

export type StudentTabParamList = {
  Home: undefined
  Exams: undefined
  Papers: undefined
  Scan: undefined
  Results: undefined
  AIStudio: undefined
  Profile: undefined
}

// ─── Stacks ───────────────────────────────────────────────────────────────────

const HomeStack = createNativeStackNavigator<StudentHomeStackParamList>()
const PapersStack = createNativeStackNavigator<StudentPapersStackParamList>()
const ResultsStack = createNativeStackNavigator<StudentResultsStackParamList>()
const ProfileStack = createNativeStackNavigator<StudentProfileStackParamList>()
const Tab = createBottomTabNavigator<StudentTabParamList>()

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="DashboardLab" component={DashboardLabScreen} options={{ title: 'Analytics Dashboard' }} />
    </HomeStack.Navigator>
  )
}

function PapersNavigator() {
  return (
    <PapersStack.Navigator screenOptions={stackScreenOptions}>
      <PapersStack.Screen name="PapersList" component={PapersScreen} options={{ title: 'My Papers' }} />
      <PapersStack.Screen name="GeneratePaper" component={GeneratePaperScreen} options={{ title: 'Generate Paper' }} />
      <PapersStack.Screen name="PaperDetail" component={PaperDetailScreen} options={{ title: 'Paper Details' }} />
      <PapersStack.Screen name="AttemptPaper" component={AttemptPaperScreen} options={{ headerShown: false }} />
      <PapersStack.Screen name="Quiz" component={QuizScreen} options={{ headerShown: false }} />
    </PapersStack.Navigator>
  )
}

function ResultsNavigator() {
  return (
    <ResultsStack.Navigator screenOptions={stackScreenOptions}>
      <ResultsStack.Screen name="ResultsList" component={ResultsScreen} options={{ title: 'Results' }} />
      <ResultsStack.Screen name="ResultDetail" component={ResultDetailScreen} options={{ title: 'Result Detail' }} />
    </ResultsStack.Navigator>
  )
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} options={{ title: 'Profile' }} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <ProfileStack.Screen name="MyTeachers" component={StudentTeachersScreen} options={{ headerShown: false }} />
    </ProfileStack.Navigator>
  )
}

// ─── Tab Icons ────────────────────────────────────────────────────────────────

type TabIconName = keyof typeof Ionicons.glyphMap
const TAB_ICONS: Record<string, [TabIconName, TabIconName]> = {
  Home:     ['home',             'home-outline'],
  Exams:    ['calendar',         'calendar-outline'],
  Papers:   ['document-text',    'document-text-outline'],
  Scan:     ['camera',           'camera-outline'],
  Results:  ['checkmark-circle', 'checkmark-circle-outline'],
  AIStudio: ['sparkles',         'sparkles-outline'],
  Profile:  ['person',           'person-outline'],
}

// ─── StudentTabs ──────────────────────────────────────────────────────────────

export default function StudentTabs() {
  const insets = useSafeAreaInsets()
  const tabBarHeight = 52 + Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0)

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const icons = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline']
        return {
          headerShown: false,
          tabBarActiveTintColor: '#ffffff',
          tabBarInactiveTintColor: colors.sidebarText,
          tabBarStyle: {
            backgroundColor: colors.sidebar,
            borderTopWidth: 0,
            height: tabBarHeight,
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 6),
            paddingTop: 6,
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.2,
                shadowRadius: 12,
              },
              android: { elevation: 12 },
            }),
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: -2,
            fontFamily: 'Manrope_600SemiBold',
          },
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? icons[0] : icons[1]} size={22} color={color} />
          ),
        }
      }}
    >
      <Tab.Screen name="Home" component={HomeNavigator} />
      <Tab.Screen name="Exams" component={StudentExamsNavigator} />
      <Tab.Screen name="Papers" component={PapersNavigator} />
      <Tab.Screen name="Scan" component={ScanNavigator} />
      <Tab.Screen name="Results" component={ResultsNavigator} />
      <Tab.Screen name="AIStudio" component={AIStudioScreen} options={{ title: 'AI Studio' }} />
      <Tab.Screen name="Profile" component={ProfileNavigator} />
    </Tab.Navigator>
  )
}
