/**
 * Eduraa Mobile — Analytics API
 */

import apiClient from './client'
import type { StudentDashboardInsights, StudentDashboardLab } from '../types'

export const analyticsApi = {
  getStudentDashboard: async (): Promise<StudentDashboardLab> => {
    const response = await apiClient.get<StudentDashboardLab>('/analytics/student-dashboard-lab')
    return response.data
  },
  getStudentDashboardInsights: async (): Promise<StudentDashboardInsights> => {
    const response = await apiClient.get<StudentDashboardInsights>('/analytics/student-dashboard-insights')
    return response.data
  },
}
