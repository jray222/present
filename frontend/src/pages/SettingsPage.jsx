import React, { useState, useEffect } from 'react';
import { Smartphone, Key, Trash2, CheckCircle2, Globe, Save, LogOut, ShieldAlert, Download, Lock } from 'lucide-react';
import {
  setup2FA, confirm2FA, getPasskeys, deletePasskey,
  getSystemSettings, updateSystemSettings, logoutOtherDevices,
  changePassword, downloadDatabaseBackup
} from '../api';
import { PageHeader, Spinner, ErrorBanner, SuccessBanner } from '../components/ui';
import Modal, { Field } from '../components/Modal';
import { useAuth } from '../context/useAuth';

export default function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const [totpSetupData, setTotpSetupData] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpModalOpen, setTotpModalOpen] = useState(false);
  const [backupCodes, setBackupCodes] = useState(null);

  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // App Base URL config
  const [publicUrl, setPublicUrl] = useState('');
  const [defaultUrl, setDefaultUrl] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [loggingOutOthers, setLoggingOutOthers] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);

  // Password change state
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState(null);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [p, sys] = await Promise.all([
          getPasskeys(),
          getSystemSettings().catch(() => ({ public_url: window.location.origin, default_url: window.location.origin })),
        ]);
        if (active) {
          setPasskeys(p);
          if (sys) {
            setPublicUrl(sys.public_url || window.location.origin);
            setDefaultUrl(sys.default_url || window.location.origin);
          }
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(err);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleStart2FA = async () => {
    setError(null);
    try {
      const data = await setup2FA();
      setTotpSetupData(data);
      setTotpModalOpen(true);
    } catch (err) {
      setError(err);
    }
  };

  const handleConfirm2FA = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await confirm2FA(totpCode);
      setBackupCodes(res.backup_codes);
      setTotpModalOpen(false);
      setSuccess('Two-Factor Authentication is now active on your account!');
      if (user) {
        setUser({ ...user, totp_enabled: true });
      }
    } catch (err) {
      setError(err);
    }
  };

  const handleDeletePasskey = async (id) => {
    if (!confirm('Remove this passkey from your account?')) return;
    try {
      await deletePasskey(id);
      setPasskeys(passkeys.filter((p) => p.id !== id));
      setSuccess('Passkey removed successfully.');
    } catch (err) {
      setError(err);
    }
  };

  const handleSaveSystemConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await updateSystemSettings({ public_url: publicUrl });
      setPublicUrl(res.public_url);
      setSuccess('App Base URL updated successfully!');
    } catch (err) {
      setError(err);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleLogoutOtherDevices = async () => {
    if (!confirm('Log out of all other active browser sessions?')) return;
    setLoggingOutOthers(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await logoutOtherDevices();
      setSuccess(`Successfully signed out of ${res.revoked_sessions} other session(s).`);
    } catch (err) {
      setError(err);
    } finally {
      setLoggingOutOthers(false);
    }
  };

  const handleDownloadBackup = async () => {
    setDownloadingBackup(true);
    setError(null);
    setSuccess(null);
    try {
      await downloadDatabaseBackup();
      setSuccess('Database backup downloaded successfully.');
    } catch (err) {
      setError(err);
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError(null);
    if (newPassword.length < 8) {
      setPwdError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setChangePwdOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Your password has been changed successfully.');
    } catch (err) {
      setPwdError(err);
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner className="w-8 h-8 text-tomato-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="Settings & Security"
        subtitle="Manage your profile, authentication methods, passkeys, and public share URLs"
      />

      {error && <ErrorBanner error={error} />}
      {success && <SuccessBanner message={success} />}

      {/* Profile Overview Card */}
      <div className="card card-pad space-y-3">
        <div className="flex items-center justify-between">
          <span className="chip chip-sunny text-xs font-bold">Profile</span>
          <button
            type="button"
            onClick={logout}
            className="btn-soft text-xs py-1.5 px-3 flex items-center gap-1.5 font-extrabold text-tomato-600 hover:bg-tomato-50 border border-tomato-200 dark:border-tomato-900/40"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-pine-700 text-white font-extrabold flex items-center justify-center text-xl uppercase">
            {user?.full_name?.[0] || user?.username?.[0] || 'U'}
          </div>
          <div>
            <p className="font-bold text-ink">{user?.full_name || user?.username}</p>
            <p className="text-xs text-muted">@{user?.username} {user?.email ? `• ${user.email}` : ''}</p>
          </div>
        </div>
      </div>

      {/* App Configuration & Public Base URL */}
      <div className="card card-pad space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-tomato-600" />
              <h3 className="font-display font-extrabold text-lg text-ink">App Base URL & Network</h3>
            </div>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              Define the external or LAN address used when generating Grandparent magic links and Secret Santa envelopes.
            </p>
          </div>
        </div>

        {user?.is_superuser ? (
          <form onSubmit={handleSaveSystemConfig} className="space-y-3 pt-1">
            <Field
              label="Public / Network Base URL"
              htmlFor="public-url"
              hint={`Current origin: ${typeof window !== 'undefined' ? window.location.origin : defaultUrl}`}
            >
              <div className="flex gap-2">
                <input
                  id="public-url"
                  type="url"
                  required
                  value={publicUrl}
                  onChange={(e) => setPublicUrl(e.target.value)}
                  placeholder="http://192.168.1.111:5732 or https://wishlist.yourdomain.com"
                  className="input font-mono text-xs"
                />
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="btn-primary shrink-0 text-xs py-2 px-3.5 font-bold flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingConfig ? 'Saving...' : 'Save URL'}</span>
                </button>
              </div>
            </Field>

            <div className="banner-soft p-3 text-xs space-y-1">
              <p className="font-bold text-ink">💡 Note for Apple iOS / Safari Users:</p>
              <p className="text-muted leading-relaxed">
                Apple requires an <strong>HTTPS</strong> address to trigger the native iOS system popup sheet and Passkeys.
                Direct <strong>iMessage &amp; SMS sharing</strong> works cleanly over plain HTTP, but if you want the native iOS popup sheet,
                point Present through a secure domain or Cloudflare Tunnel (e.g. <code>https://present.myfamily.com</code>).
              </p>
            </div>

            <div className="pt-3 border-t border-line/60 flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-xs text-ink">Database Backup</p>
                <p className="text-[11px] text-muted">Download an SQLite snapshot of all wishlists, claims, and users</p>
              </div>
              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={downloadingBackup}
                className="btn-soft text-xs py-2 px-3 font-bold flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{downloadingBackup ? 'Exporting...' : 'Export Backup'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="p-3 bg-sunk rounded-xl text-xs space-y-1">
            <p className="font-bold text-ink">Current Base URL: <span className="font-mono text-muted">{publicUrl || defaultUrl}</span></p>
            <p className="text-muted text-[11px]">System URL settings can only be modified by system administrators.</p>
          </div>
        )}
      </div>

      {/* Two-Factor Authentication Section */}
      <div className="card card-pad space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-tomato-600" />
              <h3 className="font-display font-extrabold text-lg text-ink">Two-Factor Authentication</h3>
            </div>
            <p className="text-sm text-muted mt-1">
              Require a code from an authenticator app (Google Authenticator, 1Password, Authy) on login.
            </p>
          </div>
          <span className={`chip font-bold ${user?.totp_enabled ? 'chip-pine' : 'chip-sunny'}`}>
            {user?.totp_enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <div>
          {!user?.totp_enabled ? (
            <button
              type="button"
              onClick={handleStart2FA}
              className="btn-primary text-xs py-2 px-4"
            >
              Set up Authenticator App (2FA)
            </button>
          ) : (
            <p className="text-xs text-pine-800 dark:text-pine-200 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Your account is protected by Two-Factor Authentication.
            </p>
          )}
        </div>
      </div>

      {/* Password Management Section */}
      <div className="card card-pad space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-tomato-600" />
              <h3 className="font-display font-extrabold text-lg text-ink">Account Password</h3>
            </div>
            <p className="text-sm text-muted mt-1">
              Change or update your password to keep your account secure.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPwdError(null);
              setChangePwdOpen(true);
            }}
            className="btn-soft text-xs py-2 px-3.5 font-bold shrink-0"
          >
            Change Password
          </button>
        </div>
      </div>

      {/* Passkeys Section */}
      <div className="card card-pad space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-pine-700" />
          <h3 className="font-display font-extrabold text-lg text-ink">FIDO2 Passkeys</h3>
        </div>
        <p className="text-sm text-muted">
          Sign in instantly with Face ID, Touch ID, Windows Hello, or a security key without typing a password.
        </p>

        {passkeys.length === 0 ? (
          <p className="text-xs text-muted italic">No passkeys registered on this device yet.</p>
        ) : (
          <div className="space-y-2">
            {passkeys.map((p) => (
              <div key={p.id} className="card p-3 bg-sunk/40 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-ink">{p.name}</p>
                  <p className="text-[11px] text-muted">
                    Added: {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Recently'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeletePasskey(p.id)}
                  className="btn-icon w-8 h-8 text-muted hover:text-tomato-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Session Management */}
      <div className="card card-pad bg-sunk/40 border-line/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-sm text-ink">Active Sessions</h4>
          <p className="text-xs text-muted">Log out of your sessions on other phones, laptops or browsers</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleLogoutOtherDevices}
            disabled={loggingOutOthers}
            className="btn-soft text-xs py-2 px-3.5 font-bold text-ink hover:bg-line border border-line flex items-center gap-1.5"
          >
            <ShieldAlert className="w-4 h-4 text-tomato-600" />
            <span>{loggingOutOthers ? 'Revoking...' : 'Log Out Other Devices'}</span>
          </button>
          <button
            type="button"
            onClick={logout}
            className="btn-soft text-xs py-2 px-3.5 font-extrabold text-tomato-600 hover:bg-tomato-50 border border-tomato-200 dark:border-tomato-900/40 flex items-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* TOTP Setup Modal */}
      <Modal open={totpModalOpen} onClose={() => setTotpModalOpen(false)} title="Set Up Two-Factor Authentication">
        {totpSetupData && (
          <form onSubmit={handleConfirm2FA} className="space-y-4 text-center">
            <p className="text-xs text-muted">
              Scan this QR code with Google Authenticator, 1Password, or Authy:
            </p>

            <div className="p-3 bg-white rounded-2xl w-fit mx-auto border border-line shadow-soft">
              <img src={totpSetupData.qr_code} alt="2FA QR Code" className="w-48 h-48" />
            </div>

            <p className="text-xs font-mono text-muted select-all">
              Key: {totpSetupData.secret}
            </p>

            <Field label="Enter 6-digit code to confirm" htmlFor="confirm-totp">
              <input
                id="confirm-totp"
                type="text"
                required
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                className="input text-center text-xl tracking-widest font-mono"
              />
            </Field>

            <button type="submit" className="btn-primary w-full py-3">
              Confirm &amp; Enable 2FA
            </button>
          </form>
        )}
      </Modal>

      {/* Backup Codes Modal */}
      <Modal open={Boolean(backupCodes)} onClose={() => setBackupCodes(null)} title="Save Your Backup Codes">
        <div className="space-y-4">
          <p className="text-xs text-muted">
            If you ever lose access to your phone or authenticator app, each code below can be used once to log in:
          </p>

          <div className="p-4 bg-sunk rounded-2xl font-mono text-xs sm:text-sm grid grid-cols-2 gap-2 text-ink select-all">
            {backupCodes?.map((code, idx) => (
              <span key={idx} className="font-bold">{code}</span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setBackupCodes(null)}
            className="btn-primary w-full py-2.5"
          >
            I Saved These Codes
          </button>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal open={changePwdOpen} onClose={() => setChangePwdOpen(false)} title="Change Account Password">
        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwdError && <ErrorBanner error={pwdError} />}
          <Field label="Current Password" htmlFor="current-password">
            <input
              id="current-password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="input text-sm"
            />
          </Field>
          <Field label="New Password (min. 8 characters)" htmlFor="new-password">
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="input text-sm"
            />
          </Field>
          <Field label="Confirm New Password" htmlFor="confirm-password">
            <input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="input text-sm"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setChangePwdOpen(false)}
              className="btn-soft text-xs py-2 px-3.5 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={changingPassword}
              className="btn-primary text-xs py-2 px-4 font-bold"
            >
              {changingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
