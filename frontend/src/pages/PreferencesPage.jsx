import React, { useState, useEffect, useCallback } from 'react';
import { Heart, Save, Copy, Check, Users, Search } from 'lucide-react';
import {
  getFamilyPreferences,
  updateMyPreferences,
  updateProfilePreferences,
} from '../api';
import {
  GIFT_PREFERENCE_CATEGORIES,
  countFilledCategories,
  hasAnyPreferences,
  formatPreferencesAsText,
} from '../lib/preferences';
import { PageHeader, Spinner, ErrorBanner, SuccessBanner } from '../components/ui';
import GiftPreferencesCard from '../components/GiftPreferencesCard';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [copiedSelf, setCopiedSelf] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const syncFormFromPerson = useCallback((person) => {
    const nextCats = makeEmptyCategoryState();
    const existing = person?.preferences?.categories || {};
    GIFT_PREFERENCE_CATEGORIES.forEach((c) => {
      nextCats[c.key] = existing[c.key] || '';
    });
    setCategoriesForm(nextCats);
    setNotesForm(person?.preferences?.notes || '');
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await getFamilyPreferences();
        if (!active) return;
        setPeople(list);
        const defaultEditable = list.find((p) => p.is_self) || list.find((p) => p.is_editable) || list[0];
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

  const handleSelectPerson = (person) => {
    setSelectedKey(personKey(person));
    syncFormFromPerson(person);
    setSuccess(null);
    setError(null);
  };

  const handleCategoryChange = (key, value) => {
    setCategoriesForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedPerson) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        categories: categoriesForm,
        notes: notesForm.trim() || null,
      };
      const updated =
        selectedPerson.person_type === 'managed_profile'
          ? await updateProfilePreferences(selectedPerson.person_id, payload)
          : await updateMyPreferences(payload);

      setPeople((prev) =>
        prev.map((p) => (personKey(p) === personKey(updated) ? updated : p))
      );
      syncFormFromPerson(updated);
      setSuccess(`Saved gift preferences for ${updated.name}!`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gift Preferences"
        subtitle="Fill out favorite consumables, treats, scents, and notes for yourself and your family"
        icon={Heart}
      />

      <ErrorBanner error={error} />
      <SuccessBanner message={success} />

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner className="w-8 h-8 text-tomato-600" />
        </div>
      ) : (
        <>
          {/* Editable Section: Self & Managed Profiles */}
          {selectedPerson && (
            <section className="space-y-4">
              {/* Person Selector Tabs */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {editablePeople.map((person) => {
                    const active = personKey(person) === personKey(selectedPerson);
                    const count = person.preferences?.filled_count || 0;
                    return (
                      <button
                        key={personKey(person)}
                        type="button"
                        onClick={() => handleSelectPerson(person)}
                        className={`chip px-4 py-2 text-sm font-bold flex items-center gap-1.5 ${
                          active ? 'chip-on' : 'hover:bg-line'
                        }`}
                      >
                        <span>{person.person_type === 'managed_profile' ? person.avatar_emoji || '🧸' : '🎁'}</span>
                        <span>{person.is_self ? `My Preferences (${person.name})` : person.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                            active ? 'bg-white/20 text-white' : 'bg-surface text-muted'
                          }`}
                        >
                          {count}/{GIFT_PREFERENCE_CATEGORIES.length}
                        </span>
                      </button>
                    );
                  })}
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
                    <h2 className="font-display font-extrabold text-xl text-ink">
                      {selectedPerson.name}&apos;s Preference Ideas
                    </h2>
                    <p className="text-xs text-muted mt-0.5">
                      Visible to your family circle, on wishlists, and automatically shared with whoever draws your name in Secret Santa.
                    </p>
                  </div>
                  <span
                    className={`chip text-xs font-extrabold self-start sm:self-center ${
                      liveFilledCount === GIFT_PREFERENCE_CATEGORIES.length
                        ? 'chip-pine'
                        : 'chip-sunny'
                    }`}
                  >
                    {liveFilledCount} of {GIFT_PREFERENCE_CATEGORIES.length} filled
                  </span>
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

          {/* Family Gift Preferences Directory */}
          <section className="space-y-4 pt-4 border-t border-line/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-tomato-600" />
                <h2 className="font-display font-extrabold text-lg text-ink">
                  Family Gift Preferences ({otherFamilyPeople.length})
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
                  Once family members join your Family Group, their gift preferences will appear here so everyone knows what to get each other!
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
    </div>
  );
}
