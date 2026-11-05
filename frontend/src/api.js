import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let accessToken = null;
let onAuthExpiredHandler = null;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token) => {
  accessToken = token;
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export const setOnAuthExpired = (fn) => {
  onAuthExpiredHandler = fn;
};

// Response interceptor to attempt refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry && !original.url.includes('/auth/login') && !original.url.includes('/auth/refresh')) {
      original._retry = true;
      try {
        const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const newToken = res.data.access_token;
        setAccessToken(newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        setAccessToken(null);
        if (onAuthExpiredHandler) onAuthExpiredHandler();
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(err);
  }
);

export const register = async (data) => (await api.post('/auth/register', data)).data;
export const login = async (data) => (await api.post('/auth/login', data)).data;
export const verify2FA = async (data) => (await api.post('/auth/verify-2fa', data)).data;
export const refreshSession = async () => (await api.post('/auth/refresh')).data;
export const logout = async () => (await api.post('/auth/logout')).data;
export const getMe = async () => (await api.get('/auth/me')).data;

// Google OAuth
export const getGoogleConfig = async () => (await api.get('/auth/google/config')).data;
export const verifyGoogleCredential = async (credential) => (await api.post('/auth/google/verify', { credential })).data;

// Managed Child Profiles
export const getManagedProfiles = async () => (await api.get('/profiles')).data;
export const createManagedProfile = async (data) => (await api.post('/profiles', data)).data;
export const deleteManagedProfile = async (id) => (await api.delete(`/profiles/${id}`)).data;

// Wishlists & Items
export const getMyWishlists = async (profileId = null) => {
  const url = profileId ? `/wishlists?profile_id=${profileId}` : '/wishlists';
  return (await api.get(url)).data;
};
export const getFamilyWishlists = async () => (await api.get('/wishlists/all-family')).data;
export const createWishlist = async (data) => (await api.post('/wishlists', data)).data;
export const getWishlist = async (id) => (await api.get(`/wishlists/${id}`)).data;
export const updateWishlist = async (id, data) => (await api.patch(`/wishlists/${id}`, data)).data;
export const deleteWishlist = async (id) => (await api.delete(`/wishlists/${id}`)).data;

export const addItem = async (wishlistId, item) => (await api.post(`/wishlists/${wishlistId}/items`, item)).data;
export const updateItem = async (itemId, item) => (await api.patch(`/wishlists/items/${itemId}`, item)).data;
export const deleteItem = async (itemId) => (await api.delete(`/wishlists/items/${itemId}`)).data;

// Scraper
export const scrapeUrl = async (url) => (await api.post('/wishlists/scrape', { url })).data;

// Claims (Secret Reservations)
export const claimItem = async (itemId, status, guestName = null) =>
  (await api.post(`/claims/items/${itemId}`, { status, guest_name: guestName })).data;
export const batchClaimItems = async (itemIds, status = 'reserved', guestName = null) =>
  (await api.post('/claims/batch', { item_ids: itemIds, status, guest_name: guestName })).data;
export const releaseClaim = async (itemId, guestName = null) =>
  (await api.delete(`/claims/items/${itemId}${guestName ? `?guest_name=${encodeURIComponent(guestName)}` : ''}`)).data;
export const getMyClaims = async () => (await api.get('/claims/my-claims')).data;

// Grandparent Magic Link Sharing
export const createShareToken = async (wishlistId, label = 'Family Link') =>
  (await api.post(`/wishlists/${wishlistId}/share-token`, null, { params: { label } })).data;
export const getSharedWishlist = async (token) => (await api.get(`/wishlists/shared-token/${token}`)).data;

// Groups / Multiple Families & Invites
export const getMyGroups = async () => (await api.get('/groups')).data;
export const createGroup = async (name) => (await api.post('/groups', { name })).data;
export const joinGroup = async (inviteCode) => (await api.post('/groups/join', { invite_code: inviteCode })).data;
export const leaveGroup = async (groupId) => (await api.delete(`/groups/${groupId}/leave`)).data;
export const adminResetMember2FA = async (groupId, userId) =>
  (await api.post(`/groups/${groupId}/admin/reset-member-2fa`, { user_id: userId })).data;
export const adminResetMemberPassword = async (groupId, userId, newPassword) =>
  (await api.post(`/groups/${groupId}/admin/reset-member-password`, { user_id: userId, new_password: newPassword })).data;

// Secret Santa
export const getSecretSantaDraws = async () => (await api.get('/secret-santa')).data;
export const createSecretSantaDraw = async (data) => (await api.post('/secret-santa', data)).data;
export const revealSecretSanta = async (token) => (await api.get(`/secret-santa/reveal/${token}`)).data;

// Settings & Security
export const setup2FA = async () => (await api.post('/settings/2fa/setup')).data;
export const confirm2FA = async (code) => (await api.post('/settings/2fa/confirm', { code })).data;
export const disable2FA = async (code) => (await api.post('/settings/2fa/disable', { code })).data;
export const getPasskeys = async () => (await api.get('/settings/passkeys')).data;
export const deletePasskey = async (id) => (await api.delete(`/settings/passkeys/${id}`)).data;
export const getSystemSettings = async () => (await api.get('/settings/system')).data;
export const updateSystemSettings = async (data) => (await api.post('/settings/system', data)).data;
export const reorderItems = async (wishlistId, itemIds) =>
  (await api.post(`/wishlists/${wishlistId}/reorder`, { item_ids: itemIds })).data;
export const logoutOtherDevices = async () =>
  (await api.post('/auth/logout-other-devices')).data;
export const changePassword = async (currentPassword, newPassword) =>
  (await api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword })).data;
export const adminResetUserPassword = async (userId, newPassword) =>
  (await api.post(`/settings/users/${userId}/reset-password`, { new_password: newPassword })).data;
export const downloadDatabaseBackup = async () => {
  const response = await api.get('/settings/backup', { responseType: 'blob' });
  const blob = new Blob([response.data], { type: 'application/x-sqlite3' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const disposition = response.headers && response.headers['content-disposition'];
  let filename = 'present_backup.db';
  if (disposition) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) filename = match[1];
  }
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};
