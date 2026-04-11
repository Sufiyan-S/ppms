import apiClient from './client'
import type { LoginRequest, LoginResponse } from '../types/auth'

export const authApi = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', credentials)
    return data
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout')
  },

  forgotPassword: async (phoneNumber: string): Promise<{ message: string }> => {
    const { data } = await apiClient.post('/auth/forgot-password', { phoneNumber })
    return data
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<{ message: string }> => {
    const { data } = await apiClient.post('/auth/change-password', { currentPassword, newPassword })
    return data
  },

  resetPassword: async (token: string, newPassword: string): Promise<{ message: string }> => {
    const { data } = await apiClient.post('/auth/reset-password', { token, newPassword })
    return data
  },
}
