import React, { useState, useEffect, useCallback } from 'react';
import { AuthContext } from './auth-context-def';
import {
  setAccessToken,
  setOnAuthExpired,
  getMe,
  refreshSession,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  verify2FA as apiVerify2FA,
  verifyGoogleCredential as apiVerifyGoogle,
} from '../api';



export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mfaChallenge, setMfaChallenge] = useState(null);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setOnAuthExpired(() => clearSession());
  }, [clearSession]);

  useEffect(() => {
    (async () => {
      try {
        const { access_token, user: me } = await refreshSession();
        setAccessToken(access_token);
        setUser(me || (await getMe()));
      } catch {
        clearSession();
      } finally {
        setLoading(false);
      }
    })();
  }, [clearSession]);

  const login = async (username, password) => {
    try {
      const res = await apiLogin({ username, password });
      setAccessToken(res.access_token);
      setUser(res.user);
      setMfaChallenge(null);
      return res.user;
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.detail?.mfa_required) {
        setMfaChallenge(err.response.data.detail.temp_token);
        throw new Error('MFA_REQUIRED');
      }
      throw err;
    }
  };

  const verifyMFA = async (code) => {
    if (!mfaChallenge) throw new Error('No MFA challenge in progress');
    const res = await apiVerify2FA({ temp_token: mfaChallenge, code });
    setAccessToken(res.access_token);
    setUser(res.user);
    setMfaChallenge(null);
    return res.user;
  };

  const register = async (data) => {
    const res = await apiRegister(data);
    setAccessToken(res.access_token);
    setUser(res.user);
    return res.user;
  };

  const loginWithGoogle = async (credential) => {
    const res = await apiVerifyGoogle(credential);
    setAccessToken(res.access_token);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch {}
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        mfaChallenge,
        setMfaChallenge,
        login,
        verifyMFA,
        register,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
