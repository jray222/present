import React, { useState, useEffect } from 'react';
import {
  Users, Plus, Gift, ArrowRight, UserPlus, Copy, Check, LogOut,
  Shield, KeyRound, Smartphone, Lock
} from 'lucide-react';
import {
  getFamilyWishlists, getMyGroups, createGroup, joinGroup, leaveGroup,
  adminResetMember2FA, adminResetMemberPassword
} from '../api';
import { PageHeader, Spinner, ErrorBanner, SuccessBanner } from '../components/ui';
import Modal, { Field } from '../components/Modal';
import { navigate } from '../lib/router';
import { useAuth } from '../context/AuthContext';

export default function FamilyPage() {
  const { user } = useAuth();
  const [wishlists, setWishlists] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Group Modals
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const [joinGroupOpen, setJoinGroupOpen] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  const [copiedCode, setCopiedCode] = useState(null);

  // Admin Member Rescue Modals
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [wls, grps] = await Promise.all([
        getFamilyWishlists(),
        getMyGroups(),
      ]);
      setWishlists(wls);
      setGroups(grps);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const created = await createGroup(newGroupName.trim());
      setGroups([...groups, created]);
      setCreateGroupOpen(false);
      setNewGroupName('');
      setSuccess(`Created "${created.name}"! Share the invite code with family.`);
      loadData();
    } catch (err) {
      setError(err);
    }
  };

  const handleJoinGroup = async (e) => {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;
    try {
      const joined = await joinGroup(inviteCodeInput.trim());
      setJoinGroupOpen(false);
      setInviteCodeInput('');
      setSuccess(`Joined "${joined.name}"!`);
      loadData();
    } catch (err) {
      setError(err);
    }
  };

  const handleLeaveGroup = async (groupId, groupName) => {
    if (!window.confirm(`Leave "${groupName}"?`)) return;
    try {
      await leaveGroup(groupId);
      setGroups(groups.filter((g) => g.id !== groupId));
      setSuccess(`Left "${groupName}".`);
      loadData();
    } catch (err) {
      setError(err);
    }
  };

  const handleAdminReset2FA = async (group, member) => {
    if (!window.confirm(`Reset 2FA for ${member.name} (@${member.username})? They will be prompted to re-enroll next time they log in.`)) return;
    try {
      await adminResetMember2FA(group.id, member.user_id);
      setSuccess(`2FA has been reset for ${member.name}.`);
      loadData();
    } catch (err) {
      setError(err);
    }
  };

  const handleAdminResetPassword = async (e) => {
    e.preventDefault();
    if (!selectedGroup || !selectedMember || !newPasswordInput.trim()) return;
    try {
      setResetBusy(true);
      await adminResetMemberPassword(selectedGroup.id, selectedMember.user_id, newPasswordInput.trim());
      setResetPasswordOpen(false);
      setNewPasswordInput('');
      setSuccess(`Password for ${selectedMember.name} has been reset!`);
    } catch (err) {
      setError(err);
    } finally {
      setResetBusy(false);
    }
  };

  const copyInvite = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Family & Circles"
        subtitle="Manage multiple family groups, invite relatives, and coordinate gifts"
        icon={Users}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setJoinGroupOpen(true)}
              className="btn-soft text-xs py-2 px-3 font-bold flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>Join with Code</span>
            </button>
            <button
              type="button"
              onClick={() => setCreateGroupOpen(true)}
              className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>New Family Group</span>
            </button>
          </div>
        }
      />

      <ErrorBanner error={error} />
      <SuccessBanner message={success} />

      {/* Multiple Family Groups Section */}
      <section className="space-y-3">
        <h2 className="font-display font-extrabold text-lg text-ink flex items-center gap-2">
          <span>Your Family Groups ({groups.length})</span>
        </h2>

        {groups.length === 0 ? (
          <div className="card card-pad text-center space-y-2 bg-sunk/30">
            <p className="text-sm text-muted">
              You haven&apos;t joined any family groups yet. Create one for your household or join one with an invite code!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((g) => {
              const isGroupAdmin = g.role === 'admin' || g.role === 'owner' || user?.is_superuser;

              return (
                <div key={g.id} className="card card-pad flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-extrabold text-xl text-ink">{g.name}</h3>
                          {isGroupAdmin && (
                            <span className="chip chip-pine text-[10px] py-0.5 px-2 font-bold flex items-center gap-0.5">
                              <Shield className="w-3 h-3" /> Admin
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted font-semibold">
                          {g.members_count} member{g.members_count === 1 ? '' : 's'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLeaveGroup(g.id, g.name)}
                        title="Leave group"
                        className="btn-icon w-8 h-8 text-muted hover:text-tomato-600 hover:bg-sunk"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Members List with Admin Rescue options */}
                    <div className="space-y-1.5 my-3">
                      <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Members</p>
                      <div className="space-y-1">
                        {g.members?.map((m) => (
                          <div
                            key={m.user_id}
                            className="flex items-center justify-between text-xs p-2 rounded-xl bg-sunk/50 border border-line/50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-pine-600 shrink-0" />
                              <span className="font-bold text-ink truncate">{m.name}</span>
                              <span className="text-muted truncate">(@{m.username})</span>
                            </div>

                            {/* Admin Rescue Controls */}
                            {isGroupAdmin && m.user_id !== user?.id && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedGroup(g);
                                    setSelectedMember(m);
                                    setResetPasswordOpen(true);
                                  }}
                                  title="Reset password for locked-out member"
                                  className="btn-ghost text-[10px] py-1 px-2 hover:text-tomato-600 font-bold"
                                >
                                  Reset Pwd
                                </button>
                                {m.totp_enabled && (
                                  <button
                                    type="button"
                                    onClick={() => handleAdminReset2FA(g, m)}
                                    title="Reset 2FA for locked-out member"
                                    className="btn-ghost text-[10px] py-1 px-2 text-tomato-600 font-bold"
                                  >
                                    Reset 2FA
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Invite Code Box */}
                  <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Group Invite Code</p>
                      <span className="font-mono font-extrabold text-sm text-ink tracking-wider">{g.invite_code}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyInvite(g.invite_code)}
                      className="btn-soft text-xs py-1.5 px-3 flex items-center gap-1 font-bold shrink-0"
                    >
                      {copiedCode === g.invite_code ? <Check className="w-3.5 h-3.5 text-pine-700" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode === g.invite_code ? 'Copied' : 'Copy Code'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Shared Wishlists Feed */}
      <section className="space-y-3 pt-4 border-t border-line/60">
        <h2 className="font-display font-extrabold text-lg text-ink">
          Shared Family Wishlists ({wishlists.length})
        </h2>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Spinner className="w-8 h-8 text-tomato-600" />
          </div>
        ) : wishlists.length === 0 ? (
          <div className="card p-10 text-center space-y-3">
            <div className="text-4xl">🎁</div>
            <h3 className="font-display font-extrabold text-xl">No family wishlists yet</h3>
            <p className="text-sm text-muted max-w-sm mx-auto">
              Once family members join your group and create wishlists, they will appear right here so you can coordinate gifts in secret!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {wishlists.map((wl) => (
              <div
                key={wl.id}
                onClick={() => navigate(`/lists/${wl.id}`)}
                className="card card-pad hover:shadow-lift hover:-translate-y-1 transition cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-3xl">{wl.icon || '🎁'}</span>
                    <span className="chip chip-sunny text-xs font-bold">{wl.occasion || 'Holiday'}</span>
                  </div>
                  <h3 className="font-display font-extrabold text-xl text-ink group-hover:text-tomato-600 transition">
                    {wl.title}
                  </h3>
                  <p className="text-xs text-muted mt-1 font-semibold">
                    By {wl.managed_profile_name ? `${wl.managed_profile_name} (managed by ${wl.owner_name})` : wl.owner_name}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-line/60 flex items-center justify-between text-xs text-muted font-bold">
                  <span>{wl.items.length} items</span>
                  <span className="text-tomato-600 flex items-center gap-1 group-hover:translate-x-1 transition font-extrabold">
                    Browse gifts <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal: Create Group */}
      <Modal open={createGroupOpen} onClose={() => setCreateGroupOpen(false)} title="Create New Family Group">
        <form onSubmit={handleCreateGroup} className="space-y-4">
          <Field label="Group Name" htmlFor="group-name" hint="e.g. The Miller Family, In-Laws, or College Friends">
            <input
              id="group-name"
              type="text"
              required
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g. Miller Family Christmas"
              className="input font-semibold"
            />
          </Field>
          <button type="submit" className="btn-primary w-full py-3">
            Create Family Group
          </button>
        </form>
      </Modal>

      {/* Modal: Join Group */}
      <Modal open={joinGroupOpen} onClose={() => setJoinGroupOpen(false)} title="Join Family Group">
        <form onSubmit={handleJoinGroup} className="space-y-4">
          <Field label="Invite Code" htmlFor="invite-code" hint="Enter the 6-character code given to you by family.">
            <input
              id="invite-code"
              type="text"
              required
              autoFocus
              value={inviteCodeInput}
              onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. AB12CD"
              className="input font-mono text-center tracking-widest text-xl font-bold uppercase"
            />
          </Field>
          <button type="submit" className="btn-primary w-full py-3">
            Join Group
          </button>
        </form>
      </Modal>

      {/* Modal: Admin Password Reset */}
      <Modal
        open={resetPasswordOpen}
        onClose={() => setResetPasswordOpen(false)}
        title={`Reset Password for ${selectedMember?.name}`}
      >
        <form onSubmit={handleAdminResetPassword} className="space-y-4">
          <p className="text-xs text-muted">
            As group admin, you can set a temporary password for this member so they can sign in and regain access to their account.
          </p>
          <Field label="Temporary New Password" htmlFor="temp-password">
            <input
              id="temp-password"
              type="password"
              required
              autoFocus
              value={newPasswordInput}
              onChange={(e) => setNewPasswordInput(e.target.value)}
              placeholder="At least 6 characters"
              className="input"
            />
          </Field>
          <button type="submit" disabled={resetBusy} className="btn-primary w-full py-3 font-bold">
            {resetBusy ? 'Resetting Password...' : 'Save & Set New Password'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
