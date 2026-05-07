/**
 * Register Path Selection — choose Individual Learner or School / Institute
 */

import React, { useRef, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Linking,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation'
import { colors } from '../../theme/colors'
import { radius, spacing, shadows } from '../../theme/spacing'
import { fonts } from '../../theme/fonts'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'RegisterPath'>

const SCHOOL_REGISTER_URL = 'https://www.eduraa-ai.com/register/school'

export default function RegisterPathScreen() {
  const navigation = useNavigation<Nav>()
  const insets = useSafeAreaInsets()

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start()
  }, [fadeAnim, slideAnim])

  const handleSchoolRegister = async () => {
    const supported = await Linking.canOpenURL(SCHOOL_REGISTER_URL)
    if (supported) {
      await Linking.openURL(SCHOOL_REGISTER_URL)
    } else {
      Alert.alert('Could not open', 'Please visit eduraa-ai.com/register/school in your browser.')
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <Animated.View
        style={[styles.inner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.ink} />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Ionicons name="sparkles" size={22} color={colors.white} />
          </View>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>How would you like to join Eduraa?</Text>
        </View>

        {/* Options */}
        <View style={styles.options}>

          {/* Individual Learner */}
          <TouchableOpacity
            style={[styles.card, shadows.sm]}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.82}
          >
            <View style={[styles.cardIcon, { backgroundColor: colors.accentLight }]}>
              <Ionicons name="person-outline" size={24} color={colors.accent} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>Individual Learner</Text>
              <Text style={styles.cardSub}>
                Self-study for JEE, NEET, or any competitive exam. Sign up directly in the app.
              </Text>
            </View>
            <View style={styles.cardArrow}>
              <Ionicons name="arrow-forward" size={18} color={colors.accent} />
            </View>
          </TouchableOpacity>

          {/* School / Institute */}
          <TouchableOpacity
            style={[styles.card, shadows.sm]}
            onPress={handleSchoolRegister}
            activeOpacity={0.82}
          >
            <View style={[styles.cardIcon, { backgroundColor: '#F0F9FF' }]}>
              <Ionicons name="school-outline" size={24} color="#0284C7" />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>School / Institute</Text>
              <Text style={styles.cardSub}>
                Enrolled in a school or institute? Register via your school's portal on the web.
              </Text>
              <View style={styles.webBadge}>
                <Ionicons name="globe-outline" size={11} color={colors.muted} />
                <Text style={styles.webBadgeText}>Opens eduraa-ai.com</Text>
              </View>
            </View>
            <View style={styles.cardArrow}>
              <Ionicons name="open-outline" size={16} color={colors.subtle} />
            </View>
          </TouchableOpacity>

        </View>

        {/* Login link */}
        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.7}
        >
          <Text style={styles.loginLinkText}>
            Already have an account?{'  '}
            <Text style={styles.loginLinkAccent}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: spacing[5],
  },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[6],
  },

  header: {
    alignItems: 'center',
    marginBottom: spacing[8],
  },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
    ...shadows.md,
  },
  title: {
    fontSize: 26,
    fontFamily: fonts.displayBold,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
    marginBottom: spacing[2],
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    textAlign: 'center',
  },

  options: {
    gap: spacing[4],
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.ink,
  },
  cardSub: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    lineHeight: 17,
  },
  webBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  webBadgeText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.subtle,
  },
  cardArrow: {
    flexShrink: 0,
  },

  loginLink: {
    alignItems: 'center',
    paddingVertical: spacing[3],
    marginTop: spacing[6],
  },
  loginLinkText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  loginLinkAccent: {
    color: colors.accent,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
})
