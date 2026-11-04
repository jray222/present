import React, { useState, useEffect } from 'react';
import { Gift, Lock, User, LogIn, Key, Sparkles, Smartphone, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getGoogleConfig, setup2FA, confirm2FA } from '../api';
import { ErrorBanner, Spinner } from './ui';
import Modal, { Field } from './Modal';

export default function AuthGateway() {
  const { user, login, register, mfaChallenge, verifyMFA, loginWithGoogle, setUser } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Google OAuth Config
  const [googleClientId, setGoogleClientId] = useState('');

  // Mandatory 2FA Setup Flow for Non-Google Accounts
  const [enforce2FAData, setEnforce2FAData] = useState(null);
  const [enforceCode, setEnforceCode] = useState('');
  const [enforceBusy, setEnforceBusy] = useState(false);
  const [backupCodesDisplay, setBackupCodesDisplay] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const config = await getGoogleConfig();
        if (config.enabled && config.client_id) {
          setGoogleClientId(config.client_id);
          // Load Google Identity Services script if client_id exists
          if (!window.google && !document.getElementById('google-jssdk')) {
            const script = document.createElement('script');
            script.id = 'google-jssdk';
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = () => initGoogleBtn(config.client_id);
            document.head.appendChild(script);
          } else if (window.google) {
            initGoogleBtn(config.client_id);
          }
        }
      } catch (err) {
        console.warn('Google auth config check:', err);
      }
    })();
  }, []);

  const initGoogleBtn = (clientId) => {
    if (!window.google || !clientId) return;
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          try {
            setBusy(true);
            await loginWithGoogle(response.credential);
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        },
      });
      const el = document.getElementById('google-signin-btn');
      if (el) {
        window.google.accounts.id.renderButton(el, {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'signin_with',
          shape: 'pill',
        });
      }
    } catch (e) {
      console.warn('Google button init:', e);
    }
  };

  const checkUser2FARequirement = async (loggedUser) => {
    if (loggedUser && loggedUser.requires_2fa_setup) {
      try {
        setEnforceBusy(true);
        const data = await setup2FA();
        setEnforce2FAData(data);
      } catch (err) {
        console.error('Failed to trigger 2FA setup:', err);
      } finally {
        setEnforceBusy(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mfaChallenge) {
        const loggedUser = await verifyMFA(totpCode);
        await checkUser2FARequirement(loggedUser);
      } else if (isRegister) {
        const loggedUser = await register({ username, password, full_name: fullName });
        await checkUser2FARequirement(loggedUser);
      } else {
        const loggedUser = await login(username, password);
        await checkUser2FARequirement(loggedUser);
      }
    } catch (err) {
      if (err.message !== 'MFA_REQUIRED') {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEnforced2FA = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      setEnforceBusy(true);
      const res = await confirm2FA(enforceCode);
      setBackupCodesDisplay(res.backup_codes);
      setEnforce2FAData(null);
      // Update local user state
      if (user) {
        setUser({ ...user, totp_enabled: true, requires_2fa_setup: false });
      }
    } catch (err) {
      setError(err);
    } finally {
      setEnforceBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative Orbs */}
      <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-pine-200/40 dark:bg-pine-900/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-tomato-200/40 dark:bg-tomato-900/15 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative">
        <div className="flex flex-col items-center mb-6 space-y-2">
          <div className="w-16 h-16 rounded-3xl bg-tomato-600 text-white shadow-pop flex items-center justify-center text-3xl font-display font-extrabold">
            🎁
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-ink tracking-tight flex items-center justify-center gap-2">
              Present <span className="text-pine-600 dark:text-pine-400 text-2xl">❄</span>
            </h1>
            <p className="text-muted font-medium text-sm mt-1">
              Secret wishlists, family sharing & stress-free gifting.
            </p>
          </div>
        </div>

        <div className="card card-pad shadow-lift">
          <ErrorBanner error={error} className="mb-4" />

          {/* Google Sign In Button */}
          {googleClientId ? (
            <div className="space-y-3 mb-5">
              <div id="google-signin-btn" className="w-full flex justify-center" />
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-line/70" />
                <span className="flex-shrink mx-3 text-xs text-muted font-bold uppercase tracking-wider">
                  Or with password
                </span>
                <div className="flex-grow border-t border-line/70" />
              </div>
            </div>
          ) : null}

          {mfaChallenge ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-bold">Two-Factor Authentication</h3>
                <p className="text-xs text-muted mt-1">Enter the 6-digit code or backup code from your authenticator app.</p>
              </div>
              <input
                type="text"
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                className="input text-center text-2xl tracking-widest font-mono"
                required
              />
              <button type="submit" disabled={busy} className="btn-primary w-full py-3">
                {busy ? <Spinner className="w-5 h-5 text-white" /> : 'Verify Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <label className="label">What should family call you?</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Uncle Dave or Mom"
                    className="input font-semibold"
                    required
                  />
                </div>
              )}

              <div>
                <label className="label">Username</label>
                <input
                  type="text"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="input font-semibold"
                  required
                />
              </div>

              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="input"
                  required
                />
              </div>

              <button type="submit" disabled={busy} className="btn-primary w-full py-3 text-base">
                {busy ? <Spinner className="w-5 h-5 text-white" /> : isRegister ? 'Create Account' : 'Sign In'}
              </button>

              <div className="pt-2 text-center border-t border-line/60">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setError(null);
                  }}
                  className="text-sm font-bold text-tomato-600 dark:text-tomato-400 hover:underline"
                >
                  {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Mandatory Enforced 2FA Setup Modal for Non-Google Logins */}
      <Modal open={Boolean(enforce2FAData)} onClose={() => {}} title="Security Requirement: Setup 2FA">
        {enforce2FAData && (
          <form onSubmit={handleConfirmEnforced2FA} className="space-y-4 text-center">
            <div className="banner-warn text-left">
              <Smartphone className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-xs">
                To protect family wishlists and gifts, Two-Factor Authentication is required for password accounts.
              </p>
            </div>
            <p className="text-xs text-muted">
              Scan this QR code with <strong>Google Authenticator</strong>, <strong>1Password</strong>, or <strong>Authy</strong>:
            </p>
            <div className="p-3 bg-white rounded-2xl w-fit mx-auto border border-line shadow-soft">
              <img src={enforce2FAData.qr_code} alt="2FA QR Code" className="w-44 h-44" />
            </div>
            <p className="text-xs font-mono text-muted select-all">
              Key: {enforce2FAData.secret}
            </p>
            <Field label="Enter 6-digit code to complete setup" htmlFor="enforce-code">
              <input
                id="enforce-code"
                type="text"
                required
                autoFocus
                value={enforceCode}
                onChange={(e) => setEnforceCode(e.target.value)}
                placeholder="123456"
                className="input text-center text-xl tracking-widest font-mono"
              />
            </Field>
            <button type="submit" disabled={enforceBusy} className="btn-primary w-full py-3">
              {enforceBusy ? 'Verifying...' : 'Enable 2FA & Continue'}
            </button>
          </form>
        )}
      </Modal>

      {/* Backup Codes Display */}
      <Modal open={Boolean(backupCodesDisplay)} onClose={() => setBackupCodesDisplay(null)} title="Save Your Backup Codes">
        <div className="space-y-4">
          <p className="text-xs text-muted">
            If you ever lose access to your phone or authenticator, each code below can be used once to log in:
          </p>
          <div className="p-4 bg-sunk rounded-2xl font-mono text-xs sm:text-sm grid grid-cols-2 gap-2 text-ink select-all">
            {backupCodesDisplay?.map((code, idx) => (
              <span key={idx} className="font-bold">{code}</span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setBackupCodesDisplay(null)}
            className="btn-primary w-full py-2.5 font-bold"
          >
            I Saved These Codes → Enter Dashboard
          </button>
        </div>
      </Modal>
    </div>
  );
}
