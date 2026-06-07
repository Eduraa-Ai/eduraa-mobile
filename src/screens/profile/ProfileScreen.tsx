import React from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQuery } from '@tanstack/react-query'
import type { ProfileStackParamList } from '../../navigation'
import { b2cApi } from '../../api/b2c'
import { useAuthStore } from '../../stores/authStore'
import { colors } from '../../theme/colors'
import { fonts } from '../../theme/fonts'
import { radius, spacing } from '../../theme/spacing'
import { AppCard } from '../../components/ui/AppCard'
import { HeroHeader } from '../../components/ui/HeroHeader'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { Screen } from '../../components/ui/Screen'

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'ProfileMain'>

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || '-'}</Text>
    </View>
  )
}

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>()
  const { logout, user } = useAuthStore()
  const { data: profile, isLoading } = useQuery({
    queryKey: ['b2c-profile'],
    queryFn: b2cApi.getProfile,
  })

  const fullName = profile ? `${profile.first_name} ${profile.last_name}` : (user?.display_name || 'Student')
  const initials = fullName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  return (
    <Screen>
      <HeroHeader
        eyebrow="Profile"
        title={fullName}
        subtitle="Keep your student identity, standards, and account details up to date."
        icon="person-circle-outline"
      />

      <AppCard tone="dark" style={styles.identityCard}>
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.identityName}>{fullName}</Text>
            <Text style={styles.identitySub}>{profile?.email || user?.identifier || ''}</Text>
          </View>
        </View>
      </AppCard>

      <PrimaryButton label="Edit profile" variant="secondary" onPress={() => navigation.navigate('EditProfile')} />

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <AppCard style={styles.detailsCard}>
          <DetailRow label="Education level" value={profile?.education_level?.replace(/_/g, ' ') || '-'} />
          <DetailRow label="Board" value={profile?.board || profile?.school_board || '-'} />
          <DetailRow label="Standard" value={profile?.standard || profile?.school_standard || '-'} />
          <DetailRow label="Subjects" value={profile?.subjects?.join(', ') || '-'} />
          <DetailRow label="Email verified" value={profile?.is_email_verified ? 'Yes' : 'No'} />
        </AppCard>
      )}

      <PrimaryButton label="Sign out" variant="ghost" onPress={logout} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  identityCard: {
    gap: spacing[3],
  },
  identityRow: {
    flexDirection: 'row',
    gap: spacing[4],
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.textOnBrand,
    fontFamily: fonts.displayBold,
    fontSize: 24,
  },
  identityCopy: {
    flex: 1,
    gap: spacing[1],
  },
  identityName: {
    color: colors.textOnBrand,
    fontFamily: fonts.displaySemibold,
    fontSize: 20,
  },
  identitySub: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  loading: {
    paddingVertical: spacing[10],
    alignItems: 'center',
  },
  detailsCard: {
    gap: spacing[3],
  },
  detailRow: {
    gap: spacing[1],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    color: colors.textSubtle,
    fontFamily: fonts.semibold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  detailValue: {
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
  },
})
