import React, { useState, useEffect, useCallback } from 'react';
import { Smartphone } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { getGoogleConfig, setup2FA, confirm2FA } from '../api';
import { ErrorBanner, Spinner } from './ui';
import Modal, { Field } from './Modal';

export default function AuthGateway() {
  const { user, login, register, mfaChallenge, verifyMFA, loginWithGoogle, setUser } = useAuth();
  const [groupCode, setGroupCode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('code') || '';
    }
    return '';
  });
  const [isRegister, setIsRegister] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return Boolean(params.get('code'));
    }
    return false;
  });
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

  const initGoogleBtn = useCallback((clientId) => {
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

      const container = document.getElementById('google-btn-container');
      if (container) {
        container.innerHTML = '';
        window.google.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          width: 320,
          text: 'signin_with',
        });
      }
    } catch (e) {
      console.warn('Google init error:', e);
    }
  }, [loginWithGoogle]);

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
  }, [initGoogleBtn]);

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
        const loggedUser = await register({
          username,
          password,
          full_name: fullName,
          group_code: groupCode || undefined
        });
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
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card card-pad max-w-md w-full shadow-lift border-line">
        <div className="text-center space-y-2 mb-6">
          <div className="w-16 h-16 rounded-3xl bg-tomato-100 dark:bg-tomato-950/40 text-tomato-600 flex items-center justify-center mx-auto text-3xl shadow-soft">
            🎁
          </div>
          <h1 className="font-display font-extrabold text-2xl text-ink">
            {mfaChallenge ? 'Two-Factor Authentication' : isRegister ? 'Join Your Family Wishlist' : 'Welcome to Present'}
          </h1>
          <p className="text-xs text-muted">
            {mfaChallenge
              ? 'Enter the 6-digit code from your authenticator app or backup code'
              : isRegister
              ? 'Create your account to share and reserve family gifts'
              : 'Sign in to access your family registries and wishlists'}
          </p>
        </div>

        {error && <ErrorBanner error={error} className="mb-4" />}

        {/* Google One-Tap Sign In */}
        {!mfaChallenge && googleClientId && (
          <div className="space-y-4 mb-6">
            <div id="google-btn-container" className="flex justify-center" />
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-surface px-2 text-muted font-bold">Or with username</span>
              </div>
            </div>
          </div>
        )}

        {/* 2FA MFA Verification Challenge View */}
        {mfaChallenge ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="6-Digit Authenticator Code or Backup Code" htmlFor="totp-code">
              <input
                id="totp-code"
                type="text"
                autoFocus
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                className="input text-center text-xl tracking-widest font-mono"
              />
            </Field>

            <button type="submit" disabled={busy} className="btn-primary w-full py-3 text-base">
              {busy ? <Spinner className="w-5 h-5 text-white" /> : 'Verify Code & Sign In'}
            </button>
          </form>
        ) : (
          /* Standard Login & Registration Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
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
                <div>
                  <label className="label">Family Invite Code (Optional)</label>
                  <input
                    type="text"
                    value={groupCode}
                    onChange={(e) => setGroupCode(e.target.value)}
                    placeholder="e.g. AB12CD34"
                    className="input font-mono uppercase"
                  />
                </div>
              </>
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

      {/* Mandatory Enforced 2FA Setup Modal for Non-Google Logins */}
      <Modal open={Boolean(enforce2FAData)} onClose={() => {}} title="Security Requirement: Setup 2FA">
        {enforce2FAData && (
          <form onSubmit={handleConfirmEnforced2FA} className="space-y-4 text-center">
            <p className="text-xs text-muted">
              To keep wishlists private, all accounts require Two-Factor Authentication. Scan this QR code with Google Authenticator, 1Password, or Authy:
            </p>

            <div className="p-3 bg-white rounded-2xl w-fit mx-auto border border-line shadow-soft">
              <img src={enforce2FAData.qr_code} alt="2FA QR Code" className="w-44 h-44 mx-auto" />
            </div>

            <p className="text-xs font-mono text-muted select-all">
              Key: {enforce2FAData.secret}
            </p>

            <Field label="Enter 6-digit code from your app" htmlFor="enforce-code">
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
              {enforceBusy ? <Spinner className="w-5 h-5 text-white" /> : 'Confirm & Enable 2FA'}
            </button>
          </form>
        )}
      </Modal>

      {/* Backup Codes Display Modal */}
      <Modal open={Boolean(backupCodesDisplay)} onClose={() => setBackupCodesDisplay(null)} title="Save Your Backup Codes">
        <div className="space-y-4">
          <div className="banner-soft p-3 text-xs flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-pine-700 shrink-0" />
            <span>Store these 8 one-time emergency codes safely. If you ever lose access to your phone, you can use one to log in:</span>
          </div>

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
            I Have Saved My Codes
          </button>
        </div>
      </Modal>
    </div>
  );
}
