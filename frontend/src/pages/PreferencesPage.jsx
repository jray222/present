import React, { useState, useEffect, useCallback } from 'react';
import {
  Heart,
  Save,
  Copy,
  Check,
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react';
import {
  getFamilyPreferences,
  updateMyPreferences,
  updateProfilePreferences,
  createManagedProfile,
  updateManagedProfile,
  deleteManagedProfile,
} from '../api';
import {
  GIFT_PREFERENCE_CATEGORIES,
  countFilledCategories,
  hasAnyPreferences,
  formatPreferencesAsText,
} from '../lib/preferences';
import { PageHeader, Spinner, ErrorBanner, SuccessBanner } from '../components/ui';
import Modal, { Field } from '../components/Modal';
import GiftPreferencesCard from '../components/GiftPreferencesCard';

const AVATAR_EMOJIS = ['🎁', '👩', '👨', '👵', '👴', '🧑', '🧸', '🌟'];

function makeEmptyCategoryState() {
  const obj = {};
  GIFT_PREFERENCE_CATEGORIES.forEach((c) => {
    obj[c.key] = '';
  });
  return obj;
}

function personKey(person) {
  return `${person.person_type}:${person.person_id}`;
}

export default function PreferencesPage() {
  const [people, setPeople] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [categoriesForm, setCategoriesForm] = useState(makeEmptyCategoryState);
  const [notesForm, setNotesForm] = useState('');
  const [conflictsForm, setConflictsForm] = useState([]);
  const [customConflictInput, setCustomConflictInput] = useState('');
  const [mutualSync, setMutualSync] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [copiedSelf, setCopiedSelf] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Add / Edit Non-User Person Modal
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [personNameInput, setPersonNameInput] = useState('');
  const [personEmojiInput, setPersonEmojiInput] = useState('🎁');
  const [personNotesInput, setPersonNotesInput] = useState('');
  const [personModalBusy, setPersonModalBusy] = useState(false);

  const syncFormFromPerson = useCallback((person) => {
    const nextCats = makeEmptyCategoryState();
    const existing = person?.preferences?.categories || {};
    GIFT_PREFERENCE_CATEGORIES.forEach((c) => {
      nextCats[c.key] = existing[c.key] || '';
    });
    setCategoriesForm(nextCats);
    setNotesForm(person?.preferences?.notes || '');
    setConflictsForm(Array.isArray(person?.preferences?.conflicts) ? [...person.preferences.conflicts] : []);
    setCustomConflictInput('');
  }, []);

  const refreshFamilyPreferences = useCallback(
    async (selectKeyAfter = null) => {
      const list = await getFamilyPreferences();
      setPeople(list);
      const target =
        (selectKeyAfter && list.find((p) => personKey(p) === selectKeyAfter)) ||
        list.find((p) => p.is_self) ||
        list.find((p) => p.is_editable) ||
        list[0];
      if (target) {
        setSelectedKey(personKey(target));
        syncFormFromPerson(target);
      }
      return list;
    },
    [syncFormFromPerson]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await getFamilyPreferences();
        if (!active) return;
        setPeople(list);
        const defaultEditable =
          list.find((p) => p.is_self) || list.find((p) => p.is_editable) || list[0];
        if (defaultEditable) {
          setSelectedKey(personKey(defaultEditable));
          syncFormFromPerson(defaultEditable);
        }
        setLoading(false);
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
  }, [syncFormFromPerson]);

  const editablePeople = people.filter((p) => p.is_editable);
  const otherFamilyPeople = people.filter((p) => !p.is_editable);
  const selectedPerson =
    editablePeople.find((p) => personKey(p) === selectedKey) || editablePeople[0] || null;

  const otherPeopleForConflicts = people.filter(
    (p) => !selectedPerson || personKey(p) !== personKey(selectedPerson)
  );

  const handleSelectPerson = (person) => {
    setSelectedKey(personKey(person));
    syncFormFromPerson(person);
    setSuccess(null);
    setError(null);
  };

  const handleCategoryChange = (key, value) => {
    setCategoriesForm((prev) => ({ ...prev, [key]: value }));
  };

  const hasConflictName = (name) =>
    conflictsForm.some((c) => c.toLowerCase() === String(name || '').trim().toLowerCase());

  const toggleConflictName = (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    if (selectedPerson && trimmed.toLowerCase() === selectedPerson.name.trim().toLowerCase()) {
      return;
    }
    setConflictsForm((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === trimmed.toLowerCase());
      if (exists) {
        return prev.filter((c) => c.toLowerCase() !== trimmed.toLowerCase());
      }
      return [...prev, trimmed];
    });
  };

  const handleAddCustomConflict = () => {
    const trimmed = customConflictInput.trim();
    if (!trimmed) return;
    if (selectedPerson && trimmed.toLowerCase() === selectedPerson.name.trim().toLowerCase()) {
      setCustomConflictInput('');
      return;
    }
    if (!hasConflictName(trimmed)) {
      setConflictsForm((prev) => [...prev, trimmed]);
    }
    setCustomConflictInput('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedPerson) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const prevConflicts = Array.isArray(selectedPerson.preferences?.conflicts)
        ? selectedPerson.preferences.conflicts
        : [];
      const payload = {
        categories: categoriesForm,
        notes: notesForm.trim() || null,
        conflicts: conflictsForm,
      };
      const updated =
        selectedPerson.person_type === 'managed_profile'
          ? await updateProfilePreferences(selectedPerson.person_id, payload)
          : await updateMyPreferences(payload);

      let nextPeople = people.map((p) => (personKey(p) === personKey(updated) ? updated : p));

      // Optionally keep mutual (A <-> B) conflicts in sync for other people you manage/edit
      if (mutualSync) {
        const prevLower = new Set(prevConflicts.map((c) => c.toLowerCase()));
        const currLower = new Set(conflictsForm.map((c) => c.toLowerCase()));
        const addedLower = new Set([...currLower].filter((x) => !prevLower.has(x)));
        const removedLower = new Set([...prevLower].filter((x) => !currLower.has(x)));

        const syncTargets = nextPeople.filter(
          (p) =>
            p.is_editable &&
            personKey(p) !== personKey(updated) &&
            (addedLower.has(p.name.trim().toLowerCase()) ||
              removedLower.has(p.name.trim().toLowerCase()))
        );

        for (const target of syncTargets) {
          const targetNameLower = target.name.trim().toLowerCase();
          const targetConflicts = Array.isArray(target.preferences?.conflicts)
            ? [...target.preferences.conflicts]
            : [];
          let changed = false;
          let updatedTargetConflicts = targetConflicts;

          if (addedLower.has(targetNameLower)) {
            if (!targetConflicts.some((c) => c.toLowerCase() === updated.name.trim().toLowerCase())) {
              updatedTargetConflicts = [...targetConflicts, updated.name];
              changed = true;
            }
          } else if (removedLower.has(targetNameLower)) {
            const filtered = targetConflicts.filter(
              (c) => c.toLowerCase() !== updated.name.trim().toLowerCase()
            );
            if (filtered.length !== targetConflicts.length) {
              updatedTargetConflicts = filtered;
              changed = true;
            }
          }

          if (changed) {
            const targetPayload = {
              categories: target.preferences?.categories || {},
              notes: target.preferences?.notes || null,
              conflicts: updatedTargetConflicts,
            };
            const synced =
              target.person_type === 'managed_profile'
                ? await updateProfilePreferences(target.person_id, targetPayload)
                : await updateMyPreferences(targetPayload);
            nextPeople = nextPeople.map((p) => (personKey(p) === personKey(synced) ? synced : p));
          }
        }
      }

      setPeople(nextPeople);
      syncFormFromPerson(updated);
      setSuccess(`Saved gift preferences & conflicts for ${updated.name}!`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const openAddPersonModal = () => {
    setEditingProfileId(null);
    setPersonNameInput('');
    setPersonEmojiInput('🎁');
    setPersonNotesInput('');
    setPersonModalOpen(true);
  };

  const openEditPersonModal = (person) => {
    if (!person || person.person_type !== 'managed_profile') return;
    setEditingProfileId(person.person_id);
    setPersonNameInput(person.name || '');
    setPersonEmojiInput(person.avatar_emoji || '🎁');
    setPersonNotesInput('');
    setPersonModalOpen(true);
  };

  const handleSavePersonModal = async (e) => {
    e.preventDefault();
    if (!personNameInput.trim()) return;
    setPersonModalBusy(true);
    setError(null);
    try {
      if (editingProfileId) {
        await updateManagedProfile(editingProfileId, {
          name: personNameInput.trim(),
          avatar_emoji: personEmojiInput,
          notes: personNotesInput.trim() || undefined,
        });
        await refreshFamilyPreferences(`managed_profile:${editingProfileId}`);
        setSuccess(`Updated ${personNameInput.trim()}!`);
      } else {
        const created = await createManagedProfile({
          name: personNameInput.trim(),
          avatar_emoji: personEmojiInput,
          notes: personNotesInput.trim() || null,
        });
        await refreshFamilyPreferences(`managed_profile:${created.id}`);
        setSuccess(`Added ${created.name}! Fill out their gift preferences and conflicts below.`);
      }
      setPersonModalOpen(false);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err);
    } finally {
      setPersonModalBusy(false);
    }
  };

  const handleDeletePerson = async (person) => {
    if (!person || person.person_type !== 'managed_profile') return;
    if (
      !window.confirm(
        `Remove "${person.name}" from your family roster? Their gift preferences and any wishlists under this profile will also be removed.`
      )
    ) {
      return;
    }
    try {
      setError(null);
      await deleteManagedProfile(person.person_id);
      await refreshFamilyPreferences(null);
      setSuccess(`Removed ${person.name}.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err);
    }
  };

  const handleCopyCurrent = () => {
    if (!selectedPerson) return;
    const text = formatPreferencesAsText(selectedPerson.name, {
      categories: categoriesForm,
      notes: notesForm,
    });
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedSelf(true);
      setTimeout(() => setCopiedSelf(false), 2000);
    }
  };

  const filteredFamily = otherFamilyPeople.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.username && p.username.toLowerCase().includes(q)) ||
      (p.manager_name && p.manager_name.toLowerCase().includes(q))
    );
  });

  const liveFilledCount = countFilledCategories({ categories: categoriesForm });

  // Collect summary of all saved conflicts across all people
  const allConflictRules = [];
  people.forEach((p) => {
    (p.preferences?.conflicts || []).forEach((target) => {
      allConflictRules.push(`${p.name} -> ${target}`);
    });
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gift Preferences"
        subtitle="Store every family member (app users or non-users), their favorite treats, and Secret Santa gift conflicts"
        icon={Heart}
        actions={
          <button
            type="button"
            onClick={openAddPersonModal}
            className="btn-primary text-xs py-2.5 px-4 font-extrabold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Person</span>
          </button>
        }
      />

      <ErrorBanner error={error} />
      <SuccessBanner message={success} />

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner className="w-8 h-8 text-tomato-600" />
        </div>
      ) : (
        <>
          {/* Editable Section: Self & Managed Non-User People */}
          {selectedPerson && (
            <section className="space-y-4">
              {/* Person Selector Tabs */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {editablePeople.map((person) => {
                    const active = personKey(person) === personKey(selectedPerson);
                    const count = person.preferences?.filled_count || 0;
                    const conflictCount = (person.preferences?.conflicts || []).length;
                    return (
                      <button
                        key={personKey(person)}
                        type="button"
                        onClick={() => handleSelectPerson(person)}
                        className={`chip px-4 py-2 text-sm font-bold flex items-center gap-1.5 ${
                          active ? 'chip-on' : 'hover:bg-line'
                        }`}
                      >
                        <span>
                          {person.person_type === 'managed_profile'
                            ? person.avatar_emoji || '🎁'
                            : '🎁'}
                        </span>
                        <span>
                          {person.is_self ? `My Preferences (${person.name})` : person.name}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                            active ? 'bg-white/20 text-white' : 'bg-surface text-muted'
                          }`}
                        >
                          {count}/{GIFT_PREFERENCE_CATEGORIES.length}
                        </span>
                        {conflictCount > 0 && (
                          <span
                            title={`${conflictCount} Secret Santa gift conflict(s)`}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                              active
                                ? 'bg-white/25 text-white'
                                : 'bg-tomato-100 text-tomato-700 dark:bg-tomato-900/40 dark:text-tomato-200'
                            }`}
                          >
                            🚫 {conflictCount}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={openAddPersonModal}
                    className="chip border border-dashed border-tomato-400 bg-transparent text-tomato-600 hover:bg-tomato-50 dark:hover:bg-tomato-900/30 px-3.5 py-2 text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Person</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCopyCurrent}
                  className="btn-soft text-xs py-2 px-3 flex items-center gap-1.5 font-bold shrink-0"
                >
                  {copiedSelf ? (
                    <Check className="w-3.5 h-3.5 text-pine-700" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedSelf ? 'Copied!' : 'Copy as Text'}</span>
                </button>
              </div>

              {/* Editor Form Card */}
              <form onSubmit={handleSave} className="card card-pad space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-line/60">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display font-extrabold text-xl text-ink">
                        {selectedPerson.name}&apos;s Preference Ideas
                      </h2>
                      {selectedPerson.person_type === 'managed_profile' && (
                        <span className="chip text-[10px] font-bold">Non-User Family Member</span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      Visible to your family circle, on wishlists, and automatically shared with whoever draws their name in Secret Santa.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                    <span
                      className={`chip text-xs font-extrabold ${
                        liveFilledCount === GIFT_PREFERENCE_CATEGORIES.length
                          ? 'chip-pine'
                          : 'chip-sunny'
                      }`}
                    >
                      {liveFilledCount} of {GIFT_PREFERENCE_CATEGORIES.length} filled
                    </span>
                    {selectedPerson.person_type === 'managed_profile' && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditPersonModal(selectedPerson)}
                          title="Rename or change icon"
                          aria-label={`Edit ${selectedPerson.name}`}
                          className="btn-icon w-8 h-8 text-muted hover:text-ink hover:bg-sunk"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePerson(selectedPerson)}
                          title="Remove person"
                          aria-label={`Remove ${selectedPerson.name}`}
                          className="btn-icon w-8 h-8 text-muted hover:text-tomato-600 hover:bg-tomato-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {GIFT_PREFERENCE_CATEGORIES.map((cat) => (
                    <div
                      key={cat.key}
                      className="rounded-2xl bg-sunk/45 border border-line/70 p-3.5 space-y-2"
                    >
                      <label
                        htmlFor={`pref-${cat.key}`}
                        className="flex items-center gap-2 font-display font-extrabold text-sm text-ink"
                      >
                        <span className="text-lg" aria-hidden="true">
                          {cat.icon}
                        </span>
                        <span>{cat.label}</span>
                      </label>
                      <textarea
                        id={`pref-${cat.key}`}
                        rows={3}
                        maxLength={1000}
                        value={categoriesForm[cat.key] || ''}
                        onChange={(e) => handleCategoryChange(cat.key, e.target.value)}
                        placeholder={cat.placeholder}
                        className="input text-sm leading-relaxed resize-y"
                      />
                    </div>
                  ))}
                </div>

                {/* General Notes / Allergies / Dislikes */}
                <div className="rounded-2xl bg-sunny-50/60 dark:bg-sunny-600/10 border border-line/70 p-3.5 space-y-2">
                  <label
                    htmlFor="pref-notes"
                    className="flex items-center gap-2 font-display font-extrabold text-sm text-ink"
                  >
                    <span className="text-lg" aria-hidden="true">
                      📝
                    </span>
                    <span>Other Notes, Allergies &amp; Dislikes (Optional)</span>
                  </label>
                  <textarea
                    id="pref-notes"
                    rows={2}
                    maxLength={2000}
                    value={notesForm}
                    onChange={(e) => setNotesForm(e.target.value)}
                    placeholder="Allergies, dietary restrictions, scents to avoid, favorite stores, or other gift ideas..."
                    className="input text-sm leading-relaxed resize-y"
                  />
                </div>

                {/* Secret Santa Gift Conflicts Section */}
                <div className="rounded-2xl bg-tomato-50/50 dark:bg-tomato-900/15 border border-tomato-200/70 dark:border-tomato-900/40 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 font-display font-extrabold text-sm text-ink">
                        <span aria-hidden="true">🚫</span>
                        <span>Secret Santa Gift Conflicts (Who {selectedPerson.name} should NOT draw)</span>
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        Automatically loaded as <code className="font-mono text-[11px]">{selectedPerson.name} -&gt; Person</code> exclusions in the Secret Santa picker (e.g. spouses or couples).
                      </p>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-ink cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={mutualSync}
                        onChange={(e) => setMutualSync(e.target.checked)}
                        className="rounded border-line text-tomato-600 focus:ring-tomato-500"
                      />
                      <span>Mutual conflict (A ↔ B)</span>
                    </label>
                  </div>

                  {/* Quick Toggle Chips for Known Family Members */}
                  {otherPeopleForConflicts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {otherPeopleForConflicts.map((other) => {
                        const selected = hasConflictName(other.name);
                        return (
                          <button
                            key={personKey(other)}
                            type="button"
                            onClick={() => toggleConflictName(other.name)}
                            aria-label={`${selected ? 'Remove' : 'Add'} gift conflict with ${other.name}`}
                            className={`chip px-3 py-1.5 text-xs font-bold flex items-center gap-1 ${
                              selected
                                ? 'bg-tomato-600 text-white shadow-sm'
                                : 'bg-surface text-ink border border-line hover:bg-sunk'
                            }`}
                          >
                            <span>{selected ? '🚫' : '+'}</span>
                            <span>{other.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Custom Conflict Name Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      aria-label="Add custom gift conflict name"
                      value={customConflictInput}
                      onChange={(e) => setCustomConflictInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomConflict();
                        }
                      }}
                      placeholder="Or type another person's name (e.g. Uncle Dave)..."
                      className="input text-xs py-2"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomConflict}
                      className="btn-soft text-xs py-2 px-3 font-bold shrink-0"
                    >
                      Add Conflict
                    </button>
                  </div>

                  {/* Active Conflict Rules Preview */}
                  {conflictsForm.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {conflictsForm.map((target) => (
                        <span
                          key={target}
                          className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-tomato-300 dark:border-tomato-800 px-3 py-1 text-xs font-mono font-bold text-tomato-700 dark:text-tomato-200"
                        >
                          <span>
                            {selectedPerson.name} -&gt; {target}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleConflictName(target)}
                            aria-label={`Remove conflict ${target}`}
                            className="hover:text-tomato-900 dark:hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                  <p className="text-xs text-muted">
                    {selectedPerson.preferences?.updated_at
                      ? `Last updated ${new Date(selectedPerson.preferences.updated_at).toLocaleDateString()}`
                      : 'Not saved yet'}
                  </p>
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn-primary py-2.5 px-6 font-extrabold flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Saving...' : 'Save Preferences'}</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Active Gift Conflicts Overview */}
          {allConflictRules.length > 0 && (
            <section className="card p-4 bg-sunk/40 border-line/70 space-y-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-ink uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-tomato-600" />
                <span>Saved Secret Santa Gift Conflicts ({allConflictRules.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allConflictRules.map((rule) => (
                  <span
                    key={rule}
                    className="chip bg-surface border border-line text-ink font-mono text-xs font-bold"
                  >
                    {rule}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Family Gift Preferences Directory */}
          <section className="space-y-4 pt-4 border-t border-line/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-tomato-600" />
                <h2 className="font-display font-extrabold text-lg text-ink">
                  Other Family Members ({otherFamilyPeople.length})
                </h2>
              </div>

              {otherFamilyPeople.length > 3 && (
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by name..."
                    className="input pl-9 py-2 text-xs"
                  />
                </div>
              )}
            </div>

            {otherFamilyPeople.length === 0 ? (
              <div className="card card-pad text-center space-y-2 bg-sunk/30">
                <p className="text-sm text-muted">
                  Use <strong>+ Add Person</strong> above to store non-user family members, or invite relatives to join your Family Group so their preferences appear here too!
                </p>
              </div>
            ) : filteredFamily.length === 0 ? (
              <div className="card card-pad text-center text-sm text-muted">
                No family members match &quot;{searchQuery}&quot;.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredFamily.map((person) => {
                  const displayName =
                    person.person_type === 'managed_profile' && person.manager_name
                      ? `${person.name} (${person.manager_name}'s family)`
                      : person.name;
                  return (
                    <GiftPreferencesCard
                      key={personKey(person)}
                      personName={displayName}
                      preferences={person.preferences}
                      showConflicts
                      collapsible={hasAnyPreferences(person.preferences)}
                      defaultOpen={hasAnyPreferences(person.preferences)}
                      emptyMessage={`${person.name} hasn't filled out their gift preferences yet.`}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* Modal: Add or Edit Non-User Family Member */}
      <Modal
        open={personModalOpen}
        onClose={() => setPersonModalOpen(false)}
        title={editingProfileId ? 'Edit Family Member' : 'Add Family Member (Non-User)'}
      >
        <form onSubmit={handleSavePersonModal} className="space-y-4">
          <p className="text-xs text-muted">
            Add anyone who doesn&apos;t have a Present account (Grandma, Uncle Dave, in-laws, kids). You can store their gift preferences, wishlists, and Secret Santa conflicts right here!
          </p>

          <Field label="Name" htmlFor="person-name">
            <input
              id="person-name"
              type="text"
              required
              autoFocus
              value={personNameInput}
              onChange={(e) => setPersonNameInput(e.target.value)}
              placeholder="e.g. Aunt Kelly, Grandma, or Uncle Dave"
              className="input font-semibold"
            />
          </Field>

          <Field label="Icon">
            <div className="flex flex-wrap gap-2">
              {AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setPersonEmojiInput(emoji)}
                  className={`w-10 h-10 rounded-2xl text-xl flex items-center justify-center border-2 transition ${
                    personEmojiInput === emoji
                      ? 'border-tomato-500 bg-tomato-50 dark:bg-tomato-900/30'
                      : 'border-line bg-sunk/50 hover:bg-sunk'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </Field>

          {!editingProfileId && (
            <Field label="Relationship or Notes (Optional)" htmlFor="person-notes">
              <input
                id="person-notes"
                type="text"
                value={personNotesInput}
                onChange={(e) => setPersonNotesInput(e.target.value)}
                placeholder="e.g. Mom's sister, or Age 7"
                className="input text-sm"
              />
            </Field>
          )}

          <button type="submit" disabled={personModalBusy} className="btn-primary w-full py-3 font-extrabold">
            {personModalBusy
              ? 'Saving...'
              : editingProfileId
              ? 'Save Changes'
              : 'Add Family Member'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
