import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { authApi } from '../../api/authApi'
import { PasswordInput } from '../../components/PasswordInput'
import { parseApiError } from '../../utils/apiError'

const PASSWORD_POLICY_MESSAGE = 'Password must be at least 8 characters and include 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 symbol.'
const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!token) {
    return (
      <div className="ui-auth-shell">
        <div className="ui-auth-card text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center">
              <AlertTriangle size={28} strokeWidth={2} className="text-amber-500" />
            </div>
          </div>
          <h1 className="ui-title-sm">Invalid Reset Link</h1>
          <p className="ui-subtitle">
            This password reset link is invalid or missing a token.
            Please request a new one from the forgot password page.
          </p>
          <Link to="/forgot-password" className="ui-link inline-flex justify-center">
            Request new link
          </Link>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!PASSWORD_POLICY_REGEX.test(newPassword)) { setError(PASSWORD_POLICY_MESSAGE); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true); setError(null)
    try {
      await authApi.resetPassword(token, newPassword)
      navigate('/login', { state: { message: 'Password reset successful. Please log in with your new password.' } })
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to reset password. The link may have expired.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ui-auth-shell">
      <div className="ui-auth-card space-y-6">

        <div>
          <h1 className="ui-title-sm">Set New Password</h1>
          <p className="ui-subtitle">Enter and confirm your new password below.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="newPassword" className="ui-label">New Password</label>
            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Use a strong password"
              className="shadow-sm"
              autoFocus
              minLength={8}
              required
            />
            <p className="ui-help">{PASSWORD_POLICY_MESSAGE}</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="ui-label">Confirm Password</label>
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Repeat the password"
              className="shadow-sm"
              required
            />
          </div>

          {error && <p className="ui-error-text" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="ui-btn ui-btn-primary w-full"
          >
            {loading ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>

        <Link to="/login" className="ui-link block text-center">
          Back to login
        </Link>
      </div>
    </div>
  )
}
