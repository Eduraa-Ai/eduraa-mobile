/**
 * Eduraa Mobile — Root Navigation
 * Role-based: students get StudentTabs, teachers get TeacherTabs.
 */

import React, { useRef, useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, View, Animated, StyleSheet } from 'react-native'

import { useAuthStore } from '../stores/authStore'
import { colors } from '../theme/colors'

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen'
import RegisterPathScreen from '../screens/auth/RegisterPathScreen'
import RegisterScreen from '../screens/auth/RegisterScreen'
import VerifyEmailScreen from '../screens/auth/VerifyEmailScreen'

// Role-based tab navigators
import StudentTabs from './StudentTabs'
import TeacherTabs from './TeacherTabs'

// ─── Auth Stack ───────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login: undefined
  RegisterPath: undefined
  Register: undefined
  VerifyEmail: { email: string; devOtp?: string }
}

const AuthStack = createNativeStackNavigator<AuthStackParamList>()

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="RegisterPath" component={RegisterPathScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
    </AuthStack.Navigator>
  )
}

// ─── Role-based app shell ─────────────────────────────────────────────────────

function AppShell() {
  const { user } = useAuthStore()
  const role = user?.role

  // Teacher roles
  if (
    role === 'teacher' ||
    role === 'principal' ||
    role === 'admin' ||
    role === 'school_super_admin'
  ) {
    return <TeacherTabs />
  }

  // Student / B2C roles (default)
  return <StudentTabs />
}

// ─── Root Navigator ───────────────────────────────────────────────────────────

export default function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!isLoading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start()
    }
  }, [isLoading, fadeAnim])

  if (isLoading) {
    return (
      <View style={loadingStyles.root}>
        <View style={loadingStyles.mark}>
          <Ionicons name="sparkles" size={28} color={colors.white} />
        </View>
        <ActivityIndicator size="small" color={colors.subtle} style={{ marginTop: 32 }} />
      </View>
    )
  }

  return (
    <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
      <NavigationContainer>
        {isAuthenticated ? <AppShell /> : <AuthNavigator />}
      </NavigationContainer>
    </Animated.View>
  )
}

const loadingStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
