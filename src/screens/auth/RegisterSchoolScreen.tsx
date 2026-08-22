import React, { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
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
  const [formError, setFormError] = useState<string | null>(null)
  const [schoolsError, setSchoolsError] = useState<string | null>(null)
  const [branchesError, setBranchesError] = useState<string | null>(null)
  const [offeringsError, setOfferingsError] = useState<string | null>(null)
  const [schoolsRetry, setSchoolsRetry] = useState(0)
  const [branchesRetry, setBranchesRetry] = useState(0)
  const [offeringsRetry, setOfferingsRetry] = useState(0)

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
      setSchoolsError(null)
      try {
        const data = await authApi.listSchools()
        if (mounted) setSchools(data)
      } catch (err) {
        if (mounted) {
          setSchools([])
          setSchoolsError(getErrorMessage(err, 'We could not load institutions. Check your connection and try again.'))
        }
      } finally {
        if (mounted) setLoadingSchools(false)
      }
    }
    void loadSchools()
    return () => {
      mounted = false
    }
  }, [schoolsRetry])

  useEffect(() => {
    let mounted = true
    const loadBranches = async () => {
      if (!activeSchoolId) {
        setBranches([])
        setBranchesError(null)
        return
      }
      setLoadingBranches(true)
      setBranchesError(null)
      try {
        const data = await authApi.listBranches(activeSchoolId)
        if (mounted) setBranches(data)
      } catch (err) {
        if (mounted) {
          setBranches([])
          setBranchesError(getErrorMessage(err, 'We could not load branches. Check your connection and try again.'))
        }
      } finally {
        if (mounted) setLoadingBranches(false)
      }
    }
    void loadBranches()
    return () => {
      mounted = false
    }
  }, [activeSchoolId, branchesRetry])

  useEffect(() => {
    let mounted = true
    const loadOfferings = async () => {
      if (!activeSchoolId || !activeBranchId) {
        setOfferingsMap({})
        setOfferingsError(null)
        return
      }
      setLoadingOfferings(true)
      setOfferingsError(null)
      try {
        const data = await authApi.listOfferings(activeSchoolId, activeBranchId)
        if (mounted) setOfferingsMap(buildOfferingsMap(data))
      } catch (err) {
        if (mounted) {
          setOfferingsMap({})
          setOfferingsError(getErrorMessage(err, 'Class options are unavailable right now. Try loading them again.'))
        }
      } finally {
        if (mounted) setLoadingOfferings(false)
      }
    }
    void loadOfferings()
    return () => {
      mounted = false
    }
  }, [activeSchoolId, activeBranchId, offeringsRetry])

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
    if (!activeForm.first_name.trim() || !activeForm.last_name.trim() || !activeForm.email.trim()) return 'Fill in your name and email.'
    if (!/^\S+@\S+\.\S+$/.test(activeForm.email.trim())) return 'Enter a valid email address.'
    if (!activeForm.password.trim() || !activeForm.confirm_password.trim()) return 'Enter and confirm your password.'
    if (activeForm.password.length < 8) return 'Password must be at least 8 characters.'
    if (!/[^A-Za-z0-9\s]/.test(activeForm.password)) return 'Password must include at least one special character.'
    if (activeForm.password !== activeForm.confirm_password) return 'Passwords do not match.'
    if (!activeSchoolId || !activeBranchId) return 'Select both a school and branch.'
    return null
  }

  const handleSubmit = async () => {
    if (submitting) return
    setFormError(null)
    const commonError = validateCommon()
    if (commonError) {
      setFormError(commonError)
      return
    }
    if (role === 'student') {
      if (!studentForm.student_id.trim()) return setFormError('Enter the student ID provided by your institution.')
      if (!studentForm.board) return setFormError('Choose your school board.')
      if (!studentForm.standard) return setFormError('Choose your current standard.')
    }
    if (role === 'teacher') {
      if (!teacherForm.teacher_id.trim()) return setFormError('Enter the teacher ID provided by your institution.')
      if (!teacherForm.board) return setFormError('Choose the board you teach.')
    }

    setSubmitting(true)
    try {
      if (role === 'student') {
        await authApi.registerStudent({
          ...studentForm,
          first_name: studentForm.first_name.trim(),
          last_name: studentForm.last_name.trim(),
          email: studentForm.email.trim().toLowerCase(),
          student_id: studentForm.student_id.trim(),
          division: studentForm.division.trim() ? studentForm.division : null,
        })
      } else if (role === 'teacher') {
        await authApi.registerTeacher({
          ...teacherForm,
          first_name: teacherForm.first_name.trim(),
          last_name: teacherForm.last_name.trim(),
          email: teacherForm.email.trim().toLowerCase(),
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
          email: principalForm.email.trim().toLowerCase(),
        })
      }
      navigation.replace('SchoolApprovalStatus', {
        identifier: activeForm.email.trim().toLowerCase(),
        role,
        displayName: `${activeForm.first_name.trim()} ${activeForm.last_name.trim()}`.trim(),
      })
    } catch (err) {
      setFormError(getErrorMessage(err, 'Please check the details and try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppScreen tone="auth" contentStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <View style={styles.leftHeader}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={18} color={colors.text} />
            </TouchableOpacity>
            <AuthLogoMark size={42} />
            <View>
              <Text style={styles.brandName}>Eduraa AI</Text>
              <Text style={styles.brandContext}>Institution workspace</Text>
            </View>
          </View>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.kicker}>Institution workspace</Text>
          <Text style={styles.title}>Join your school.</Text>
          <Text style={styles.subtitle}>Choose your role, then connect to the branch that knows you.</Text>
          <View style={styles.workspaceCue}>
            <View style={styles.workspaceCueIcon}><Ionicons name="git-network-outline" size={16} color="#ffffff" /></View>
            <Text style={styles.workspaceCueText}>Your school connection keeps classes, papers and approvals in sync.</Text>
          </View>
        </View>

        {formError ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={19} color="#c2410c" />
            <View style={styles.errorBannerCopy}>
              <Text style={styles.errorBannerTitle}>Check your details</Text>
              <Text style={styles.errorBannerText}>{formError}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.roleGrid}>
          {[
            { label: 'Student', value: 'student' as const },
            { label: 'Teacher', value: 'teacher' as const },
            { label: 'Principal', value: 'principal' as const },
          ].map((item) => {
            const active = role === item.value
            return (
              <TouchableOpacity key={item.value} style={[styles.roleCard, active && styles.roleCardActive]} onPress={() => { setRole(item.value); setFormError(null) }} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                <Text style={[styles.roleText, active && styles.roleTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <View style={styles.formCard}>
          <View style={[styles.sectionMarker, styles.sectionMarkerActive]}><Text style={styles.sectionMarkerText}>1</Text></View>
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
            autoComplete="email"
            textContentType="emailAddress"
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
          <View style={styles.sectionMarker}><Text style={styles.sectionMarkerText}>2</Text></View>
          <Text style={styles.sectionEyebrow}>Institution context</Text>
          {schoolsError ? (
            <View style={styles.dataError} accessibilityRole="alert">
              <Ionicons name="cloud-offline-outline" size={19} color="#c2410c" />
              <Text style={styles.dataErrorText}>{schoolsError}</Text>
              <TouchableOpacity onPress={() => setSchoolsRetry((value) => value + 1)} style={styles.retryButton} accessibilityRole="button">
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <SelectField label="School / Institute" value={activeSchoolId} options={schoolOptions} loading={loadingSchools} placeholder="Select school" onChange={setSchoolForRole} />
          {branchesError ? (
            <View style={styles.dataError} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={19} color="#c2410c" />
              <Text style={styles.dataErrorText}>{branchesError}</Text>
              <TouchableOpacity onPress={() => setBranchesRetry((value) => value + 1)} style={styles.retryButton} accessibilityRole="button">
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <SelectField label="Branch" value={activeBranchId} options={branchOptions} loading={loadingBranches} disabled={!activeSchoolId} placeholder="Select branch" onChange={setBranchForRole} />
          {offeringsError && role === 'student' ? (
            <View style={styles.dataError} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={19} color="#c2410c" />
              <Text style={styles.dataErrorText}>{offeringsError}</Text>
              <TouchableOpacity onPress={() => setOfferingsRetry((value) => value + 1)} style={styles.retryButton} accessibilityRole="button">
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
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
          <View style={styles.sectionMarker}><Text style={styles.sectionMarkerText}>3</Text></View>
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
            autoComplete="new-password"
            textContentType="newPassword"
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
            autoComplete="new-password"
            textContentType="newPassword"
          />
          {formError ? (
            <View style={styles.inlineSubmitError} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={18} color="#c2410c" />
              <Text style={styles.inlineSubmitErrorText}>{formError}</Text>
            </View>
          ) : null}
          <AnimatedButton label={submitting ? 'Creating account...' : 'Create account'} loading={submitting} onPress={handleSubmit} variant="auth" style={styles.cta} />
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    gap: spacing[4],
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
  brandName: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  brandContext: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    marginTop: 1,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  stepPill: {
    borderRadius: radius.full,
    backgroundColor: '#fff0e5',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  stepText: {
    color: '#c2410c',
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  heroBlock: {
    gap: spacing[1],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  kicker: {
    color: '#c2410c',
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#07152d',
    fontFamily: fonts.displayBold,
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.45,
  },
  subtitle: {
    color: '#667085',
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 23,
  },
  workspaceCue: {
    marginTop: spacing[3],
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: '#07152d',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  workspaceCueIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f36c21',
  },
  workspaceCueText: {
    flex: 1,
    color: '#d9e2ee',
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  roleGrid: {
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#e0d6c8',
    backgroundColor: '#f4ede4',
    padding: spacing[1],
  },
  roleCard: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  roleCardActive: {
    backgroundColor: '#07152d',
    ...shadows.xs,
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
    position: 'relative',
    gap: spacing[4],
    marginLeft: spacing[2],
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(7,21,45,0.16)',
    paddingLeft: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[2],
  },
  sectionMarker: {
    position: 'absolute',
    left: -13,
    top: 16,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#fbf6ec',
    backgroundColor: '#07152d',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#07152d',
    shadowOpacity: 0.15,
    shadowRadius: 7,
  },
  sectionMarkerActive: { backgroundColor: '#f36c21' },
  sectionMarkerText: { color: '#ffffff', fontFamily: fonts.bold, fontSize: 11 },
  sectionEyebrow: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  nameGrid: {
    flexDirection: 'column',
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
    marginBottom: spacing[5],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
    padding: spacing[4],
  },
  errorBannerCopy: { flex: 1, gap: 2 },
  errorBannerTitle: { color: '#9a3412', fontFamily: fonts.bold, fontSize: 13 },
  errorBannerText: { color: '#7c2d12', fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  dataError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
    padding: spacing[3],
  },
  dataErrorText: { flex: 1, color: '#7c2d12', fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  retryButton: { minWidth: 52, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#07152d', paddingHorizontal: spacing[2] },
  retryText: { color: '#ffffff', fontFamily: fonts.bold, fontSize: 11 },
  inlineSubmitError: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], borderRadius: radius.lg, backgroundColor: '#fff0e5', padding: spacing[3] },
  inlineSubmitErrorText: { flex: 1, color: '#7c2d12', fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
})
