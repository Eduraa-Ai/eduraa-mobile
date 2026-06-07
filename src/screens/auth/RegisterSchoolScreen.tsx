import React, { useEffect, useMemo, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation'
import { authApi, type BranchOption, type OfferingsEntry, type SchoolOption } from '../../api/auth'
import { colors, radius, shadows, spacing } from '../../theme'
import { fonts } from '../../theme/fonts'
import {
  normalizeBoardOptions,
  normalizeListOptions,
  normalizeStandardList,
  normalizeStandardValue,
  toSelectOptions,
} from '../../data/authOptions'
import { AnimatedButton, AppScreen, AuthLogoMark, TextInputField } from '../../components/ui'
import { SelectField } from '../../components/ui/SelectField'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'RegisterSchool'>
type Role = 'student' | 'teacher' | 'principal'

type TeacherForm = {
  first_name: string
  last_name: string
  email: string
  teacher_id: string
  password: string
  confirm_password: string
  school_id: string
  branch_id: string
  board: string
}

type StudentForm = {
  first_name: string
  last_name: string
  email: string
  student_id: string
  password: string
  confirm_password: string
  school_id: string
  branch_id: string
  board: string
  standard: string
  division: string
}

type PrincipalForm = {
  first_name: string
  last_name: string
  email: string
  password: string
  confirm_password: string
  school_id: string
  branch_id: string
}

const teacherInitial: TeacherForm = {
  first_name: '',
  last_name: '',
  email: '',
  teacher_id: '',
  password: '',
  confirm_password: '',
  school_id: '',
  branch_id: '',
  board: '',
}

const studentInitial: StudentForm = {
  first_name: '',
  last_name: '',
  email: '',
  student_id: '',
  password: '',
  confirm_password: '',
  school_id: '',
  branch_id: '',
  board: '',
  standard: '',
  division: '',
}

const principalInitial: PrincipalForm = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  confirm_password: '',
  school_id: '',
  branch_id: '',
}

const getErrorMessage = (err: any, fallback: string) => {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item: any) => item.msg || JSON.stringify(item)).join('\n')
  return fallback
}

const buildOfferingsMap = (entries: OfferingsEntry[]) => {
  const next: Record<string, string[]> = {}
  entries.forEach((entry) => {
    const standard = normalizeStandardValue(entry.standard)
    if (!standard) return
    next[standard] = normalizeListOptions(entry.divisions)
  })
  return next
}

export default function RegisterSchoolScreen() {
  const navigation = useNavigation<Nav>()
  const [role, setRole] = useState<Role>('student')
  const [teacherForm, setTeacherForm] = useState<TeacherForm>(teacherInitial)
  const [studentForm, setStudentForm] = useState<StudentForm>(studentInitial)
  const [principalForm, setPrincipalForm] = useState<PrincipalForm>(principalInitial)
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [offeringsMap, setOfferingsMap] = useState<Record<string, string[]>>({})
  const [loadingSchools, setLoadingSchools] = useState(true)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [loadingOfferings, setLoadingOfferings] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const activeForm = role === 'teacher' ? teacherForm : role === 'student' ? studentForm : principalForm
  const activeSchoolId = activeForm.school_id
  const activeBranchId = activeForm.branch_id
  const selectedSchool = useMemo(() => schools.find((school) => school.id === activeSchoolId) ?? null, [schools, activeSchoolId])
  const selectedBranch = useMemo(() => branches.find((branch) => branch.id === activeBranchId) ?? null, [branches, activeBranchId])

  const schoolOptions = useMemo(() => schools.map((school) => ({ label: school.name, value: school.id })), [schools])
  const branchOptions = useMemo(() => branches.map((branch) => ({ label: branch.name, value: branch.id })), [branches])

  const availableBoards = useMemo(() => {
    const branchBoards = normalizeBoardOptions(selectedBranch?.boards, selectedBranch?.board_other)
    if (branchBoards.length > 0) return branchBoards
    return normalizeBoardOptions(selectedSchool?.boards, selectedSchool?.board_other)
  }, [selectedBranch, selectedSchool])

  const availableStandards = useMemo(() => {
    const offeringStandards = normalizeStandardList(Object.keys(offeringsMap))
    if (offeringStandards.length > 0) return offeringStandards
    const branchStandards = normalizeStandardList(normalizeListOptions(selectedBranch?.standards))
    if (branchStandards.length > 0) return branchStandards
    return normalizeStandardList(normalizeListOptions(selectedSchool?.standards))
  }, [offeringsMap, selectedBranch, selectedSchool])

  const availableDivisions = useMemo(() => {
    const offeringStandards = normalizeStandardList(Object.keys(offeringsMap))
    if (offeringStandards.length > 0 && studentForm.standard) {
      return normalizeListOptions(offeringsMap[normalizeStandardValue(studentForm.standard)])
    }
    const branchDivisions = normalizeListOptions(selectedBranch?.divisions)
    if (branchDivisions.length > 0) return branchDivisions
    return normalizeListOptions(selectedSchool?.divisions)
  }, [offeringsMap, selectedBranch, selectedSchool, studentForm.standard])

  useEffect(() => {
    let mounted = true
    const loadSchools = async () => {
      setLoadingSchools(true)
      try {
        const data = await authApi.listSchools()
        if (mounted) setSchools(data)
      } catch (err) {
        if (mounted) Alert.alert('Unable to load schools', getErrorMessage(err, 'Please try again later.'))
      } finally {
        if (mounted) setLoadingSchools(false)
      }
    }
    void loadSchools()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const loadBranches = async () => {
      if (!activeSchoolId) {
        setBranches([])
        return
      }
      setLoadingBranches(true)
      try {
        const data = await authApi.listBranches(activeSchoolId)
        if (mounted) setBranches(data)
      } catch (err) {
        if (mounted) {
          setBranches([])
          Alert.alert('Unable to load branches', getErrorMessage(err, 'Please try again later.'))
        }
      } finally {
        if (mounted) setLoadingBranches(false)
      }
    }
    void loadBranches()
    return () => {
      mounted = false
    }
  }, [activeSchoolId])

  useEffect(() => {
    let mounted = true
    const loadOfferings = async () => {
      if (!activeSchoolId || !activeBranchId) {
        setOfferingsMap({})
        return
      }
      setLoadingOfferings(true)
      try {
        const data = await authApi.listOfferings(activeSchoolId, activeBranchId)
        if (mounted) setOfferingsMap(buildOfferingsMap(data))
      } catch {
        if (mounted) setOfferingsMap({})
      } finally {
        if (mounted) setLoadingOfferings(false)
      }
    }
    void loadOfferings()
    return () => {
      mounted = false
    }
  }, [activeSchoolId, activeBranchId])

  const setSchoolForRole = (value: string) => {
    setOfferingsMap({})
    if (role === 'teacher') {
      setTeacherForm((prev) => ({ ...prev, school_id: value, branch_id: '', board: '' }))
    } else if (role === 'student') {
      setStudentForm((prev) => ({ ...prev, school_id: value, branch_id: '', board: '', standard: '', division: '' }))
    } else {
      setPrincipalForm((prev) => ({ ...prev, school_id: value, branch_id: '' }))
    }
  }

  const setBranchForRole = (value: string) => {
    setOfferingsMap({})
    if (role === 'teacher') {
      setTeacherForm((prev) => ({ ...prev, branch_id: value, board: '' }))
    } else if (role === 'student') {
      setStudentForm((prev) => ({ ...prev, branch_id: value, board: '', standard: '', division: '' }))
    } else {
      setPrincipalForm((prev) => ({ ...prev, branch_id: value }))
    }
  }

  const validateCommon = () => {
    if (!activeForm.first_name.trim() || !activeForm.last_name.trim() || !activeForm.email.trim()) return 'Fill in name and email.'
    if (!activeForm.password.trim() || !activeForm.confirm_password.trim()) return 'Enter and confirm your password.'
    if (activeForm.password.length < 8) return 'Password must be at least 8 characters.'
    if (activeForm.password !== activeForm.confirm_password) return 'Passwords do not match.'
    if (!activeSchoolId || !activeBranchId) return 'Select both a school and branch.'
    return null
  }

  const handleSubmit = async () => {
    const commonError = validateCommon()
    if (commonError) {
      Alert.alert('Check details', commonError)
      return
    }
    if (role === 'student') {
      if (!studentForm.student_id.trim()) return Alert.alert('Student ID required', 'Enter your student ID.')
      if (!studentForm.board) return Alert.alert('Board required', 'Select a board.')
      if (!studentForm.standard) return Alert.alert('Standard required', 'Select a standard.')
    }
    if (role === 'teacher') {
      if (!teacherForm.teacher_id.trim()) return Alert.alert('Teacher ID required', 'Enter your teacher ID.')
      if (!teacherForm.board) return Alert.alert('Board required', 'Select a board.')
    }

    setSubmitting(true)
    try {
      if (role === 'student') {
        await authApi.registerStudent({
          ...studentForm,
          first_name: studentForm.first_name.trim(),
          last_name: studentForm.last_name.trim(),
          email: studentForm.email.trim(),
          student_id: studentForm.student_id.trim(),
          division: studentForm.division.trim() ? studentForm.division : null,
        })
      } else if (role === 'teacher') {
        await authApi.registerTeacher({
          ...teacherForm,
          first_name: teacherForm.first_name.trim(),
          last_name: teacherForm.last_name.trim(),
          email: teacherForm.email.trim(),
          teacher_id: teacherForm.teacher_id.trim(),
          standards_taught: [],
          divisions_taught: [],
          subjects_taught: [],
        })
      } else {
        await authApi.registerPrincipal({
          ...principalForm,
          first_name: principalForm.first_name.trim(),
          last_name: principalForm.last_name.trim(),
          email: principalForm.email.trim(),
        })
      }
      Alert.alert(
        'Account created',
        'Thank you for creating the account. You will be able to access your account once it has been approved by your assigned supervisor.',
        [{ text: 'Back to login', onPress: () => navigation.navigate('Login') }],
      )
    } catch (err) {
      Alert.alert('Registration failed', getErrorMessage(err, 'Please check the details and try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  const roleTitle = role === 'student' ? 'Register as Student' : role === 'teacher' ? 'Register as Teacher' : 'Register as Principal'

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppScreen>
        <View style={styles.topRow}>
          <View style={styles.leftHeader}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={18} color={colors.text} />
            </TouchableOpacity>
            <AuthLogoMark size={42} />
          </View>
          <View style={styles.stepPill}>
            <Text style={styles.stepText}>Institution-linked</Text>
          </View>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.kicker}>School workspace</Text>
          <Text style={styles.title}>{roleTitle}</Text>
          <Text style={styles.subtitle}>
            Connect to your institution, choose your role, and create the account your school can approve.
          </Text>
        </View>

        <View style={styles.roleGrid}>
          {[
            { label: 'Student', value: 'student' as const, icon: 'person-outline' as const },
            { label: 'Teacher', value: 'teacher' as const, icon: 'briefcase-outline' as const },
            { label: 'Principal', value: 'principal' as const, icon: 'shield-checkmark-outline' as const },
          ].map((item) => {
            const active = role === item.value
            return (
              <TouchableOpacity key={item.value} style={[styles.roleCard, active && styles.roleCardActive]} onPress={() => setRole(item.value)}>
                <Ionicons name={item.icon} size={17} color={active ? colors.textOnBrand : colors.accentStrong} />
                <Text style={[styles.roleText, active && styles.roleTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionEyebrow}>Personal information</Text>
          <View style={styles.nameGrid}>
            <View style={styles.nameField}>
              <TextInputField label="First name" value={activeForm.first_name} onChangeText={(value) => {
                if (role === 'teacher') setTeacherForm((prev) => ({ ...prev, first_name: value }))
                else if (role === 'student') setStudentForm((prev) => ({ ...prev, first_name: value }))
                else setPrincipalForm((prev) => ({ ...prev, first_name: value }))
              }} placeholder="First" />
            </View>
            <View style={styles.nameField}>
              <TextInputField label="Last name" value={activeForm.last_name} onChangeText={(value) => {
                if (role === 'teacher') setTeacherForm((prev) => ({ ...prev, last_name: value }))
                else if (role === 'student') setStudentForm((prev) => ({ ...prev, last_name: value }))
                else setPrincipalForm((prev) => ({ ...prev, last_name: value }))
              }} placeholder="Last" />
            </View>
          </View>
          <TextInputField
            label="Email"
            value={activeForm.email}
            onChangeText={(value) => {
              if (role === 'teacher') setTeacherForm((prev) => ({ ...prev, email: value }))
              else if (role === 'student') setStudentForm((prev) => ({ ...prev, email: value }))
              else setPrincipalForm((prev) => ({ ...prev, email: value }))
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            left={<Ionicons name="mail-outline" size={18} color={colors.accentStrong} />}
            placeholder="you@example.com"
          />
          {role === 'student' ? (
            <TextInputField label="Student ID" value={studentForm.student_id} onChangeText={(value) => setStudentForm((prev) => ({ ...prev, student_id: value }))} placeholder="Student ID" />
          ) : null}
          {role === 'teacher' ? (
            <TextInputField label="Teacher ID" value={teacherForm.teacher_id} onChangeText={(value) => setTeacherForm((prev) => ({ ...prev, teacher_id: value }))} placeholder="Teacher ID" />
          ) : null}
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionEyebrow}>Institution context</Text>
          <SelectField label="School / Institute" value={activeSchoolId} options={schoolOptions} loading={loadingSchools} placeholder="Select school" onChange={setSchoolForRole} />
          <SelectField label="Branch" value={activeBranchId} options={branchOptions} loading={loadingBranches} disabled={!activeSchoolId} placeholder="Select branch" onChange={setBranchForRole} />
          {role !== 'principal' ? (
            <SelectField
              label="Board"
              value={role === 'teacher' ? teacherForm.board : studentForm.board}
              options={toSelectOptions(availableBoards)}
              disabled={!activeBranchId || availableBoards.length === 0}
              placeholder={availableBoards.length ? 'Select board' : 'No boards available'}
              onChange={(value) => {
                if (role === 'teacher') setTeacherForm((prev) => ({ ...prev, board: value }))
                else setStudentForm((prev) => ({ ...prev, board: value }))
              }}
            />
          ) : null}
          {role === 'student' ? (
            <>
              <SelectField
                label="Standard"
                value={studentForm.standard}
                options={toSelectOptions(availableStandards)}
                loading={loadingOfferings}
                disabled={!activeBranchId || availableStandards.length === 0}
                placeholder={availableStandards.length ? 'Select standard' : 'No standards available'}
                onChange={(value) => setStudentForm((prev) => ({ ...prev, standard: value, division: '' }))}
              />
              <SelectField
                label="Division"
                value={studentForm.division}
                options={toSelectOptions(availableDivisions)}
                disabled={!studentForm.standard || availableDivisions.length === 0}
                placeholder={availableDivisions.length ? 'Optional division' : 'No divisions available'}
                onChange={(value) => setStudentForm((prev) => ({ ...prev, division: value }))}
              />
            </>
          ) : null}
          {role === 'teacher' ? (
            <View style={styles.noteBox}>
              <Ionicons name="information-circle-outline" size={18} color={colors.accentStrong} />
              <Text style={styles.noteText}>Standards, divisions, and subjects are assigned later by your institution, matching the web flow.</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionEyebrow}>Account information</Text>
          <TextInputField
            label="Password"
            value={activeForm.password}
            onChangeText={(value) => {
              if (role === 'teacher') setTeacherForm((prev) => ({ ...prev, password: value }))
              else if (role === 'student') setStudentForm((prev) => ({ ...prev, password: value }))
              else setPrincipalForm((prev) => ({ ...prev, password: value }))
            }}
            secureTextEntry={!showPassword}
            left={<Ionicons name="lock-closed-outline" size={18} color={colors.accentStrong} />}
            right={(
              <TouchableOpacity onPress={() => setShowPassword((value) => !value)} hitSlop={8}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            placeholder="Minimum 8 characters"
          />
          <TextInputField
            label="Confirm password"
            value={activeForm.confirm_password}
            onChangeText={(value) => {
              if (role === 'teacher') setTeacherForm((prev) => ({ ...prev, confirm_password: value }))
              else if (role === 'student') setStudentForm((prev) => ({ ...prev, confirm_password: value }))
              else setPrincipalForm((prev) => ({ ...prev, confirm_password: value }))
            }}
            secureTextEntry={!showConfirmPassword}
            left={<Ionicons name="checkmark-circle-outline" size={18} color={colors.accentStrong} />}
            right={(
              <TouchableOpacity onPress={() => setShowConfirmPassword((value) => !value)} hitSlop={8}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            placeholder="Repeat your password"
          />
          <AnimatedButton label={submitting ? 'Creating account...' : 'Create account'} loading={submitting} onPress={handleSubmit} style={styles.cta} />
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  stepPill: {
    borderRadius: radius.full,
    backgroundColor: colors.accentMid,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  stepText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  heroBlock: {
    gap: spacing[2],
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[5],
    ...shadows.sm,
  },
  kicker: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 23,
  },
  roleGrid: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  roleCard: {
    flex: 1,
    minHeight: 78,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    padding: spacing[3],
  },
  roleCardActive: {
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentStrong,
  },
  roleText: {
    color: colors.text,
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
  roleTextActive: {
    color: colors.textOnBrand,
    fontFamily: fonts.bold,
  },
  formCard: {
    gap: spacing[4],
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[5],
    ...shadows.sm,
  },
  sectionEyebrow: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  nameGrid: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  nameField: {
    flex: 1,
  },
  noteBox: {
    flexDirection: 'row',
    gap: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.accentSurface,
    padding: spacing[4],
  },
  noteText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
  },
  cta: {
    marginTop: spacing[2],
  },
})
