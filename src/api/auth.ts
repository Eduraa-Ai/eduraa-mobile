/**
 * Eduraa Mobile — Auth API
 */

import apiClient from './client'
import type { AuthToken, B2CRegisterRequest } from '../types'

export interface LoginRequest {
  username: string // email or identifier
  password: string
}

export interface RegistrationChallenge {
  email: string
  message: string
  requires_verification: boolean
  delivery_channel: string
  dev_otp?: string | null
}

export interface SchoolOption {
  id: string
  name: string
  boards?: string[] | null
  board_other?: string | null
  standards?: string[] | null
  divisions?: string[] | null
}

export interface BranchOption {
  id: string
  name: string
  boards?: string[] | null
  board_other?: string | null
  standards?: string[] | null
  divisions?: string[] | null
}

export interface OfferingsEntry {
  standard: string
  divisions: string[]
}

export interface RegisterStudentRequest {
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
  division?: string | null
}

export interface RegisterTeacherRequest {
  first_name: string
  last_name: string
  email: string
  teacher_id: string
  password: string
  confirm_password: string
  school_id: string
  branch_id: string
  board: string
  standards_taught: string[]
  divisions_taught: string[]
  subjects_taught: string[]
}

export interface RegisterPrincipalRequest {
  first_name: string
  last_name: string
  email: string
  password: string
  confirm_password: string
  school_id: string
  branch_id: string
}

export const authApi = {
  login: async (data: LoginRequest): Promise<AuthToken> => {
    const response = await apiClient.post<AuthToken>('/auth/login', {
      identifier: data.username,
      password: data.password,
    })
    return response.data
  },

  registerIndividual: async (data: B2CRegisterRequest): Promise<RegistrationChallenge> => {
    const response = await apiClient.post<RegistrationChallenge>('/auth/register/individual', data)
    return response.data
  },

  verifyEmailOtp: async (email: string, otp: string): Promise<AuthToken> => {
    const response = await apiClient.post<AuthToken>('/auth/verify-email-otp', { email, otp })
    return response.data
  },

  resendEmailOtp: async (email: string): Promise<RegistrationChallenge> => {
    const response = await apiClient.post<RegistrationChallenge>('/auth/resend-email-otp', { email })
    return response.data
  },

  forgotPassword: async (identifier: string): Promise<string> => {
    const response = await apiClient.post<{ message: string }>('/auth/forgot-password', { identifier })
    return response.data.message
  },

  listSchools: async (): Promise<SchoolOption[]> => {
    const response = await apiClient.get<SchoolOption[]>('/schools')
    return response.data
  },

  listBranches: async (schoolId: string): Promise<BranchOption[]> => {
    const response = await apiClient.get<BranchOption[]>(`/schools/${schoolId}/branches`)
    return response.data
  },

  listOfferings: async (schoolId: string, branchId: string): Promise<OfferingsEntry[]> => {
    const response = await apiClient.get<OfferingsEntry[]>(`/schools/${schoolId}/offerings?branch_id=${branchId}`)
    return response.data
  },

  registerStudent: async (data: RegisterStudentRequest): Promise<void> => {
    await apiClient.post('/auth/register/student', data)
  },

  registerTeacher: async (data: RegisterTeacherRequest): Promise<void> => {
    await apiClient.post('/auth/register/teacher', data)
  },

  registerPrincipal: async (data: RegisterPrincipalRequest): Promise<void> => {
    await apiClient.post('/auth/register/principal', data)
  },

  me: async (): Promise<AuthToken['user']> => {
    const response = await apiClient.get('/auth/me')
    return response.data
  },

  logout: async (refreshToken?: string | null): Promise<void> => {
    await apiClient.post(
      '/auth/logout',
      refreshToken ? { refresh_token: refreshToken } : undefined,
      { timeout: 5000 },
    )
  },
}
