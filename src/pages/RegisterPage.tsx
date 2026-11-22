import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { AuthErrorBanner } from '../components/CommonBadges';
import { useAuth } from '../context/AuthContext';

export const RegisterPage: React.FC = () => {
  const { register, loginWithGoogle, isSubmitting, authError, authErrorCode, clearAuthError } =
    useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!name.trim()) {
      setLocalError('Please enter your name.');
      return;
    }
    if (!email.trim()) {
      setLocalError('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }
    await register(email, password, name);
  };

  return (
    <div
      style={{
        paddingTop: 'calc(2rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
      }}
      className="flex min-h-screen w-full items-center justify-center bg-[#E6EBF2] px-4"
    >
      <main className="neu-raised-2 w-full max-w-md rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-display text-sm font-bold uppercase tracking-[0.08em] text-[#006B5F]">
              TERRA Track Rider
            </span>
            <h1 className="mt-1 font-display text-2xl font-bold text-[#111827]">Create account</h1>
          </div>
        </div>

        <p className="mt-2 text-sm font-medium text-[#1F2937] whitespace-normal break-words">
          Register a rider account with your email and password.
        </p>

        <AuthErrorBanner
          message={localError ?? authError}
          errorCode={localError ? null : authErrorCode}
        />

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="register-name"
              className="block text-xs font-bold uppercase tracking-[0.06em] text-[#1F2937]"
            >
              Rider Name
            </label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (authError) clearAuthError();
              }}
              placeholder="Alex Rivera"
              className="neu-inset mt-2 h-14 w-full rounded-2xl px-4 text-base font-medium text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="register-email"
              className="block text-xs font-bold uppercase tracking-[0.06em] text-[#1F2937]"
            >
              Email
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (authError) clearAuthError();
              }}
              placeholder="rider@example.com"
              className="neu-inset mt-2 h-14 w-full rounded-2xl px-4 text-base font-medium text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="block text-xs font-bold uppercase tracking-[0.06em] text-[#1F2937]"
            >
              Password
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (authError) clearAuthError();
              }}
              placeholder="At least 6 characters"
              className="neu-inset mt-2 h-14 w-full rounded-2xl px-4 text-base font-medium text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="neu-teal mt-2 flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-full px-6 py-3 font-display text-base font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <UserPlus className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{isSubmitting ? 'Creating account…' : 'Create account'}</span>
          </button>
        </form>

        <div className="mt-4">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setLocalError(null);
              void loginWithGoogle();
            }}
            className="neu-btn-slate flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-full px-6 py-3 font-display text-sm font-bold text-[#111827] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>

        <div className="mt-6 border-t border-[#C2C9D6]/60 pt-5 text-center">
          <p className="text-xs font-medium text-[#1F2937]">Already have an account?</p>
          <Link
            to="/login"
            onClick={() => clearAuthError()}
            className="neu-btn-slate mt-3 flex min-h-[56px] w-full items-center justify-center rounded-full px-6 py-3 font-display text-sm font-bold text-[#111827] transition-transform active:scale-[0.98]"
          >
            Sign in instead
          </Link>
        </div>
      </main>
    </div>
  );
};
