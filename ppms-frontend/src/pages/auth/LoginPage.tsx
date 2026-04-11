import { useState } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '../../api/authApi'
import { useAuthStore } from '../../store/authStore'
import type { AuthUser } from '../../types/auth'

const loginSchema = z.object({
  phoneNumber: z.string().length(10, 'Phone number must be exactly 10 digits').regex(/^\d+$/, 'Must be digits only'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const sessionExpired = searchParams.get('reason') === 'session_expired'
  const successMessage = (location.state as { message?: string } | null)?.message ?? null
  const setAuth = useAuthStore((s) => s.setAuth)
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null)
    setLoading(true)
    try {
      const response = await authApi.login(data)
      const user: AuthUser = {
        userId: response.userId,
        fullName: response.fullName,
        phoneNumber: response.phoneNumber,
        role: response.role,
        assignedPumpId: response.assignedPumpId,
      }
      setAuth(user, response.token)
      navigate(response.role === 'SUPER_ADMIN' ? '/super-admin' : '/dashboard')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      setServerError(error?.response?.data?.message ?? 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ui-auth-shell ui-auth-shell--split">
      <div className="ui-auth-orb ui-auth-orb--blue" />
      <div className="ui-auth-orb ui-auth-orb--amber" />
      <div className="ui-auth-frame">
        <section className="ui-auth-hero">
          <div className="ui-auth-badge">
            <span>⛽</span>
            <span>Operations Console</span>
          </div>
          <div className="space-y-4">
            <h1 className="ui-auth-display">Run every pump shift with clarity.</h1>
            <p className="ui-auth-copy">
              Track fuel, credit, cash, inventory, payroll, and compliance from one focused workspace built for petrol pump teams.
            </p>
          </div>
          <div className="ui-auth-metrics">
            <div className="ui-auth-metric">
              <span className="ui-auth-metric-value">Live</span>
              <span className="ui-auth-metric-label">shift and stock visibility</span>
            </div>
            <div className="ui-auth-metric">
              <span className="ui-auth-metric-value">Fast</span>
              <span className="ui-auth-metric-label">daily close and reconciliations</span>
            </div>
          </div>
          <div className="ui-auth-points">
            <div className="ui-auth-point">
              <span className="ui-auth-point-icon">📊</span>
              <div>
                <p className="ui-auth-point-title">Daily control</p>
                <p className="ui-auth-point-copy">Keep dips, deliveries, and sales aligned across the site.</p>
              </div>
            </div>
            <div className="ui-auth-point">
              <span className="ui-auth-point-icon">🛡️</span>
              <div>
                <p className="ui-auth-point-title">Secure access</p>
                <p className="ui-auth-point-copy">Role-based workflows for operators, managers, owners, and admins.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="ui-auth-card ui-auth-form-panel">
          <div className="space-y-2">
            <p className="ui-auth-kicker">Welcome back</p>
            <h2 className="ui-title">Sign in to PPMS</h2>
            <p className="ui-subtitle">Use your registered phone number and password to continue.</p>
          </div>

          {sessionExpired && (
            <div className="ui-alert ui-alert-warning flex items-start gap-2.5">
              <span className="text-amber-500 text-base mt-0.5">⚠</span>
              <div>
                <p className="text-sm font-medium text-amber-800">Session expired</p>
                <p className="text-xs text-amber-600 mt-0.5">You were signed out because your session timed out. Please sign in again.</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="ui-alert ui-alert-success">
              <p className="text-sm text-emerald-700">{successMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="ui-label">
                Phone Number
              </label>
              <input
                {...register('phoneNumber')}
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="e.g. 9999999999"
                className="shadow-sm"
              />
              {errors.phoneNumber && (
                <p className="ui-error-text">{errors.phoneNumber.message}</p>
              )}
            </div>

            <div>
              <label className="ui-label">
                Password
              </label>
              <input
                {...register('password')}
                type="password"
                placeholder="Enter your password"
                className="shadow-sm"
              />
              {errors.password && (
                <p className="ui-error-text">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="ui-alert ui-alert-danger">
                <p className="text-red-600 text-sm">{serverError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="ui-btn ui-btn-primary w-full"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-400">Need help accessing your account?</span>
              <Link to="/forgot-password" className="ui-link text-sm">
                Forgot password?
              </Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
