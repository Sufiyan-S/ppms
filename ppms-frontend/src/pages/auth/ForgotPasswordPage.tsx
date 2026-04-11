import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../../api/authApi'

export default function ForgotPasswordPage() {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber.trim()) { setError('Phone number is required'); return }
    setLoading(true); setError(null)
    try {
      await authApi.forgotPassword(phoneNumber.trim())
      setSent(true)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="ui-auth-shell">
        <div className="ui-auth-card text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <span className="text-emerald-600 text-2xl">✓</span>
          </div>
          <h1 className="ui-title-sm">Check your email</h1>
          <p className="ui-subtitle">
            If this phone number is registered and has an email address on file,
            we have sent a password reset link. Check your inbox.
          </p>
          <p className="text-xs text-slate-400">The link expires in 1 hour.</p>
          <Link to="/login" className="ui-link inline-flex justify-center">
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="ui-auth-shell">
      <div className="ui-auth-card space-y-6">

        <div>
          <h1 className="ui-title-sm">Forgot Password</h1>
          <p className="ui-subtitle">
            Enter your registered phone number and we'll send a reset link to your email.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="ui-label">Phone Number</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              placeholder="e.g. 9876543210"
              className="shadow-sm"
              autoFocus
            />
          </div>

          {error && <p className="ui-error-text">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="ui-btn ui-btn-primary w-full"
          >
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>

        <Link to="/login" className="ui-link block text-center">
          Back to login
        </Link>
      </div>
    </div>
  )
}
