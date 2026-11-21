import { useState } from 'react';
import { X } from 'lucide-react';
import type { UserProfile } from '../types.ts';
import { ALVERON_LOGO_URL } from '../utils/currency.ts';

interface AuthModalProps {
  onClose: () => void;
  onAuthenticated: (token: string, user: UserProfile) => void;
}

export function AuthModal({ onClose, onAuthenticated }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const json = (await res.json()) as {
        token?: string;
        user?: UserProfile;
        error?: string;
      };
      if (!res.ok || !json.token || !json.user) {
        throw new Error(json.error || 'Authentication failed.');
      }
      onAuthenticated(json.token, json.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider: 'google' | 'apple' | 'github') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          email: email.trim() || undefined,
          name: name.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        token?: string;
        user?: UserProfile;
        error?: string;
      };
      if (!res.ok || !json.token || !json.user) {
        throw new Error(json.error || 'Social sign-in failed.');
      }
      onAuthenticated(json.token, json.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Social authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl border border-black/[0.08]"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex items-center gap-3">
          <img
            src={ALVERON_LOGO_URL}
            alt="Alveron Premiums"
            className="h-11 w-11 rounded-xl border border-black/[0.08] object-cover"
          />
          <div>
            <h2 className="font-display text-xl font-semibold text-[#1D1D1F]">
              {mode === 'login' ? 'Sign in to Alveron' : 'Create your Alveron ID'}
            </h2>
            <p className="text-xs text-[#6E6E73]">
              Sync wishlist, INR price-drop alerts & Shopify orders.
            </p>
          </div>
        </div>

        {/* Quick Social Sign-In */}
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSocial('google')}
            className="rounded-xl border border-black/10 bg-[#FAFAFA] py-2.5 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors"
          >
            Google
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSocial('apple')}
            className="rounded-xl border border-black/10 bg-[#FAFAFA] py-2.5 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors"
          >
            Apple
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSocial('github')}
            className="rounded-xl border border-black/10 bg-[#FAFAFA] py-2.5 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors"
          >
            GitHub
          </button>
        </div>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-[#86868B]">
          <div className="h-px flex-1 bg-black/10" />
          <span>or with email</span>
          <div className="h-px flex-1 bg-black/10" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-[#1D1D1F]">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Mercer"
                className="mt-1 w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-sm text-[#1D1D1F] focus:border-[#0071E3] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#1D1D1F]">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-1 w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-sm text-[#1D1D1F] focus:border-[#0071E3] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1D1D1F]">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="mt-1 w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-sm text-[#1D1D1F] focus:border-[#0071E3] focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#0071E3] py-3 text-sm font-medium text-white hover:bg-[#0077ED] disabled:opacity-60 transition-colors"
          >
            {loading ? 'Signing in...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[#6E6E73]">
          {mode === 'login' ? "Don't have an Alveron ID?" : 'Already have an Alveron ID?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'login' ? 'register' : 'login'));
              setError(null);
            }}
            className="font-medium text-[#0071E3] hover:underline"
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
