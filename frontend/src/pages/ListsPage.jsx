import React, { useState, useEffect } from 'react';
import {
  Plus, LayoutGrid, List as ListIcon, Share2, Sparkles, ChevronRight,
  Pencil, Trash2, Check, AlertCircle
} from 'lucide-react';
import {
  getMyWishlists, getManagedProfiles, createWishlist, updateWishlist,
  deleteWishlist, createManagedProfile, createShareToken
} from '../api';
import { PageHeader, Spinner, ErrorBanner } from '../components/ui';
import Modal, { Field } from '../components/Modal';
import ShareModal from '../components/ShareModal';
import { onLinkClick, navigate } from '../lib/router';

export default function ListsPage() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(null); // null = user's own lists
  const [wishlists, setWishlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create List Modal
  const [createListOpen, setCreateListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [newListOccasion, setNewListOccasion] = useState('Christmas');

  // Edit List Modal
  const [editListOpen, setEditListOpen] = useState(false);
  const [editingWishlist, setEditingWishlist] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editOccasion, setEditOccasion] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Add Child Modal
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [childName, setChildName] = useState('');
  const [childNotes, setChildNotes] = useState('');

  // Share Modal
  const [shareWishlist, setShareWishlist] = useState(null);
  const [shareUrl, setShareUrl] = useState('');

  const loadData = async (profId = selectedProfileId) => {
    try {
      setLoading(true);
      const [profs, lists] = await Promise.all([
        getManagedProfiles(),
        getMyWishlists(profId),
      ]);
      setProfiles(profs);
      setWishlists(lists);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedProfileId);
  }, [selectedProfileId]);

  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!newListTitle.trim()) return;
    try {
      const created = await createWishlist({
        title: newListTitle.trim(),
        occasion: newListOccasion,
        managed_profile_id: selectedProfileId,
      });
      setCreateListOpen(false);
      setNewListTitle('');
      navigate(`/lists/${created.id}`);
    } catch (err) {
      setError(err);
    }
  };

  const handleOpenEditList = (wl, e) => {
    e.stopPropagation();
    setEditingWishlist(wl);
    setEditTitle(wl.title);
    setEditOccasion(wl.occasion || 'Christmas');
    setEditDescription(wl.description || '');
    setEditListOpen(true);
  };

  const handleSaveEditList = async (e) => {
    e.preventDefault();
    if (!editingWishlist || !editTitle.trim()) return;
    try {
      const updated = await updateWishlist(editingWishlist.id, {
        title: editTitle.trim(),
        occasion: editOccasion,
        description: editDescription.trim() || null,
      });
      setWishlists(wishlists.map((w) => (w.id === updated.id ? updated : w)));
      setEditListOpen(false);
      setEditingWishlist(null);
    } catch (err) {
      setError(err);
    }
  };

  const handleDeleteList = async (wl, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete "${wl.title}"? All items inside will be removed.`)) return;
    try {
      await deleteWishlist(wl.id);
      setWishlists(wishlists.filter((w) => w.id !== wl.id));
    } catch (err) {
      setError(err);
    }
  };

  const handleAddChild = async (e) => {
    e.preventDefault();
    if (!childName.trim()) return;
    try {
      const created = await createManagedProfile({
        name: childName.trim(),
        notes: childNotes.trim() || null,
      });
      setAddChildOpen(false);
      setChildName('');
      setChildNotes('');
      setProfiles([...profiles, created]);
      setSelectedProfileId(created.id);
    } catch (err) {
      setError(err);
    }
  };

  const openShare = async (wl, e) => {
    e.stopPropagation();
    setShareWishlist(wl);
    try {
      const res = await createShareToken(wl.id);
      setShareUrl(res.url);
    } catch (err) {
      console.error(err);
    }
  };

  const currentTabName = selectedProfileId
    ? profiles.find((p) => p.id === selectedProfileId)?.name || 'Child'
    : 'My Wishlists';

  return (
    <div className="space-y-6">
      <PageHeader
        title={currentTabName}
        subtitle="Manage wishlists for yourself and your family"
        actions={
          <button
            type="button"
            onClick={() => setCreateListOpen(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            <span>New Wishlist</span>
          </button>
        }
      />

      <ErrorBanner error={error} />

      {/* Managed Profiles / Kids Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedProfileId(null)}
          className={`chip px-4 py-2 text-sm font-bold ${
            selectedProfileId === null ? 'chip-on' : 'hover:bg-line'
          }`}
        >
          🎁 My Lists
        </button>

        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedProfileId(p.id)}
            className={`chip px-4 py-2 text-sm font-bold flex items-center gap-1.5 ${
              selectedProfileId === p.id ? 'chip-on' : 'hover:bg-line'
            }`}
          >
            <span>{p.avatar_emoji || '🧸'}</span>
            <span>{p.name}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => setAddChildOpen(true)}
          className="chip border border-dashed border-tomato-400 bg-transparent text-tomato-600 hover:bg-tomato-50 dark:hover:bg-tomato-900/30 px-3.5 py-2 text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Child</span>
        </button>
      </div>

      {/* Lists View Grid */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner className="w-8 h-8 text-tomato-600" />
        </div>
      ) : wishlists.length === 0 ? (
        <div className="card p-10 text-center space-y-4">
          <div className="text-5xl">🎁</div>
          <h3 className="font-display font-extrabold text-2xl">No wishlists here yet</h3>
          <p className="text-muted text-sm max-w-md mx-auto">
            Create your first wishlist for Christmas, birthdays, or general ideas and share it easily with family!
          </p>
          <button
            type="button"
            onClick={() => setCreateListOpen(true)}
            className="btn-primary mx-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Wishlist</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {wishlists.map((wl) => (
            <div
              key={wl.id}
              onClick={() => navigate(`/lists/${wl.id}`)}
              className="card card-pad hover:shadow-lift hover:-translate-y-1 transition cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">{wl.icon || '🎁'}</span>
                  <div className="flex items-center gap-1">
                    <span className="chip chip-sunny text-xs">
                      {wl.occasion || 'Christmas'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleOpenEditList(wl, e)}
                      title="Edit wishlist name"
                      className="btn-icon w-8 h-8 text-muted hover:text-ink hover:bg-sunk"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteList(wl, e)}
                      title="Delete wishlist"
                      className="btn-icon w-8 h-8 text-muted hover:text-tomato-600 hover:bg-sunk"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => openShare(wl, e)}
                      title="Share with family"
                      className="btn-icon w-8 h-8 text-muted hover:text-tomato-600 hover:bg-sunk"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <h3 className="font-display font-extrabold text-xl text-ink group-hover:text-tomato-600 transition">
                  {wl.title}
                </h3>
                {wl.description && (
                  <p className="text-sm text-muted mt-1 line-clamp-2">{wl.description}</p>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-line/60 flex items-center justify-between text-xs text-muted font-bold">
                <span>{wl.items?.length || 0} items</span>
                <span className="text-tomato-600 flex items-center gap-1 group-hover:translate-x-1 transition font-bold">
                  View list <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create Wishlist */}
      <Modal open={createListOpen} onClose={() => setCreateListOpen(false)} title="New Wishlist">
        <form onSubmit={handleCreateList} className="space-y-4">
          <Field label="Wishlist Name" htmlFor="list-title">
            <input
              id="list-title"
              type="text"
              required
              autoFocus
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              placeholder="e.g. Christmas 2026 or Birthday Wishlist"
              className="input font-semibold"
            />
          </Field>
          <Field label="Occasion" htmlFor="list-occasion">
            <select
              id="list-occasion"
              value={newListOccasion}
              onChange={(e) => setNewListOccasion(e.target.value)}
              className="input"
            >
              <option value="Christmas">🎄 Christmas / Holiday</option>
              <option value="Birthday">🎂 Birthday</option>
              <option value="General">🎁 General Wishlist</option>
              <option value="Baby">👶 Baby / Kids</option>
              <option value="Wedding">💍 Wedding / Anniversary</option>
            </select>
          </Field>
          <button type="submit" className="btn-primary w-full py-3">
            Create Wishlist
          </button>
        </form>
      </Modal>

      {/* Modal: Edit Wishlist */}
      <Modal open={editListOpen} onClose={() => setEditListOpen(false)} title="Edit Wishlist">
        <form onSubmit={handleSaveEditList} className="space-y-4">
          <Field label="Wishlist Name" htmlFor="edit-list-title">
            <input
              id="edit-list-title"
              type="text"
              required
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input font-semibold"
            />
          </Field>
          <Field label="Occasion" htmlFor="edit-list-occasion">
            <select
              id="edit-list-occasion"
              value={editOccasion}
              onChange={(e) => setEditOccasion(e.target.value)}
              className="input"
            >
              <option value="Christmas">🎄 Christmas / Holiday</option>
              <option value="Birthday">🎂 Birthday</option>
              <option value="General">🎁 General Wishlist</option>
              <option value="Baby">👶 Baby / Kids</option>
              <option value="Wedding">💍 Wedding / Anniversary</option>
            </select>
          </Field>
          <Field label="Description (Optional)" htmlFor="edit-list-desc">
            <textarea
              id="edit-list-desc"
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Add details, size info, or instructions..."
              className="input text-sm"
            />
          </Field>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 py-3">
              Save Changes
            </button>
            <button
              type="button"
              onClick={() => {
                if (editingWishlist) {
                  setEditListOpen(false);
                  handleDeleteList(editingWishlist, { stopPropagation: () => {} });
                }
              }}
              className="btn-danger py-3 px-4 font-bold"
            >
              Delete
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add Child Profile */}
      <Modal open={addChildOpen} onClose={() => setAddChildOpen(false)} title="Add Child / Dependent">
        <form onSubmit={handleAddChild} className="space-y-4">
          <Field label="Child's Name" htmlFor="child-name">
            <input
              id="child-name"
              type="text"
              required
              autoFocus
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder="e.g. Liam or Maya"
              className="input"
            />
          </Field>
          <Field label="Age or Notes (Optional)" htmlFor="child-notes">
            <input
              id="child-notes"
              type="text"
              value={childNotes}
              onChange={(e) => setChildNotes(e.target.value)}
              placeholder="e.g. Age 5, loves outer space and Legos"
              className="input"
            />
          </Field>
          <button type="submit" className="btn-primary w-full py-3">
            Add Profile
          </button>
        </form>
      </Modal>

      {/* Share Modal */}
      <ShareModal
        open={Boolean(shareWishlist)}
        onClose={() => setShareWishlist(null)}
        wishlist={shareWishlist}
        shareUrl={shareUrl}
      />
    </div>
  );
}
