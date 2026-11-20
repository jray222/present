import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Plus,
  Copy,
  Check,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ArrowRight,
  Link2,
  RefreshCw,
  AlertTriangle,
  Users,
} from 'lucide-react';
import {
  getSecretSantaDraws,
  createSecretSantaDraw,
  updateSecretSantaDraw,
  redrawSecretSantaDraw,
  deleteSecretSantaDraw,
  getFamilyPreferences,
} from '../api';
import {
  buildExclusionsFromPeople,
  findDrawConflictWarnings,
} from '../lib/preferences';
import { PageHeader, Spinner, ErrorBanner, SuccessBanner } from '../components/ui';
import Modal, { Field } from '../components/Modal';

function formatExclusionsToText(exclusions) {
  if (!exclusions || typeof exclusions !== 'object') return '';
  const lines = [];
  Object.entries(exclusions).forEach(([giver, excludedList]) => {
    if (Array.isArray(excludedList)) {
      excludedList.forEach((receiver) => {
        if (giver && receiver) {
          lines.push(`${giver} -> ${receiver}`);
        }
      });
    }
  });
  return lines.join('\n');
}

function parseExclusionsFromText(text) {
  const exclusions = {};
  if (!text || !text.trim()) return exclusions;
  text.split('\n').forEach((line) => {
    const parts = line.split('->').map((s) => s.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      if (!exclusions[parts[0]]) exclusions[parts[0]] = [];
      if (!exclusions[parts[0]].includes(parts[1])) {
        exclusions[parts[0]].push(parts[1]);
      }
    }
  });
  return exclusions;
}

function getPairShareUrl(pair) {
  if (!pair) return '';
  const rawUrl = pair.view_url || '';
  if (
    typeof window !== 'undefined' &&
    window.location?.origin &&
    pair.view_token &&
    (!rawUrl || rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1'))
  ) {
    return `${window.location.origin}/santa/view/${pair.view_token}`;
  }
  return rawUrl;
}

export default function SecretSantaPage() {
  const [draws, setDraws] = useState([]);
  const [familyPeople, setFamilyPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Admin visibility toggle for matched names (defaults to true so admin sees names with links)
  const [showNames, setShowNames] = useState(true);

  // Create / Edit Draw Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingDraw, setEditingDraw] = useState(null);
  const [title, setTitle] = useState('');
  const [budgetLimit, setBudgetLimit] = useState('50');
  const [exchangeDate, setExchangeDate] = useState('');
  const [participantsText, setParticipantsText] = useState('');
  const [exclusionsText, setExclusionsText] = useState('');
  const [busy, setBusy] = useState(false);

  // Results / View Links Modal
  const [activeResults, setActiveResults] = useState(null); // { draw, pairs }
  const [copiedToken, setCopiedToken] = useState(null);
  const [copiedAllKey, setCopiedAllKey] = useState(null);

  const loadDraws = useCallback(async () => {
    try {
      const data = await getSecretSantaDraws();
      setDraws(data);
      setLoading(false);
      return data;
    } catch (err) {
      setError(err);
      setLoading(false);
      return [];
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [data, people] = await Promise.all([
          getSecretSantaDraws(),
          Promise.resolve(getFamilyPreferences()).catch(() => []),
        ]);
        if (active) {
          setDraws(data);
          setFamilyPeople(Array.isArray(people) ? people : []);
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

  const mergeConflictsIntoExclusionsText = (names, existingText = '') => {
    const merged = parseExclusionsFromText(existingText);
    const saved = buildExclusionsFromPeople(familyPeople, names);
    Object.entries(saved).forEach(([giver, targets]) => {
      if (!merged[giver]) merged[giver] = [];
      targets.forEach((target) => {
        if (!merged[giver].includes(target)) {
          merged[giver].push(target);
        }
      });
    });
    // Prune exclusions pointing to names no longer in participants list
    const lowerSet = new Set(names.map((n) => n.trim().toLowerCase()));
    const pruned = {};
    Object.entries(merged).forEach(([giver, targets]) => {
      if (!lowerSet.has(giver.toLowerCase())) return;
      const validTargets = targets.filter((t) => lowerSet.has(t.toLowerCase()));
      if (validTargets.length > 0) pruned[giver] = validTargets;
    });
    return formatExclusionsToText(pruned);
  };

  const openNewDrawModal = () => {
    setEditingDraw(null);
    setTitle('Family Secret Santa 2026');
    setBudgetLimit('100');
    setExchangeDate('');
    if (familyPeople.length >= 2) {
      const names = familyPeople.map((p) => p.name);
      setParticipantsText(names.join('\n'));
      setExclusionsText(formatExclusionsToText(buildExclusionsFromPeople(familyPeople, names)));
    } else {
      setParticipantsText('Grandma\nMom\nDad\nSarah\nJohn\nUncle Dave');
      setExclusionsText('Mom -> Dad\nDad -> Mom\nSarah -> John\nJohn -> Sarah');
    }
    setError(null);
    setFormOpen(true);
  };

  const toggleRosterParticipant = (personName) => {
    const current = participantsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const exists = current.some((n) => n.toLowerCase() === personName.toLowerCase());
    const next = exists
      ? current.filter((n) => n.toLowerCase() !== personName.toLowerCase())
      : [...current, personName];
    setParticipantsText(next.join('\n'));
    setExclusionsText((prev) => mergeConflictsIntoExclusionsText(next, prev));
  };

  const handleSelectAllFamily = () => {
    const names = familyPeople.map((p) => p.name);
    setParticipantsText(names.join('\n'));
    setExclusionsText((prev) => mergeConflictsIntoExclusionsText(names, prev));
  };

  const handleSyncSavedConflicts = () => {
    const names = participantsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    setExclusionsText((prev) => mergeConflictsIntoExclusionsText(names, prev));
  };

  const openEditDrawModal = (draw) => {
    const participantNames =
      draw.participants && draw.participants.length > 0
        ? draw.participants
        : (draw.pairs || []).map((p) => p.giver_name);

    setEditingDraw(draw);
    setTitle(draw.title || '');
    setBudgetLimit(draw.budget_limit != null ? String(draw.budget_limit) : '');
    setExchangeDate(draw.exchange_date || '');
    setParticipantsText(participantNames.join('\n'));
    setExclusionsText(formatExclusionsToText(draw.exclusions));
    setError(null);
    setActiveResults(null);
    setFormOpen(true);
  };

  const handleSaveAndRunDraw = async (e) => {
    e.preventDefault();
    const names = participantsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (names.length < 2) {
      setError('Please add at least 2 participants (one per line).');
      return;
    }

    const exclusions = parseExclusionsFromText(exclusionsText);
    const payload = {
      title: title.trim(),
      budget_limit: budgetLimit !== '' ? parseFloat(budgetLimit) : null,
      exchange_date: exchangeDate.trim() || null,
      participants: names,
      exclusions,
    };

    try {
      setBusy(true);
      setError(null);
      if (editingDraw) {
        const updatedDraw = await updateSecretSantaDraw(editingDraw.id, payload);
        const refreshed = await loadDraws();
        const latestDraw = refreshed.find((d) => d.id === updatedDraw.id) || updatedDraw;
        setFormOpen(false);
        setEditingDraw(null);
        setActiveResults({
          draw: latestDraw,
          pairs: latestDraw.pairs || updatedDraw.pairs || [],
        });
        setSuccessMsg(`Updated and re-ran "${latestDraw.title}"!`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        const pairs = await createSecretSantaDraw(payload);
        const refreshed = await loadDraws();
        const newestDraw = refreshed[0] || {
          title: payload.title,
          budget_limit: payload.budget_limit,
          exchange_date: payload.exchange_date,
          participants: names,
          exclusions,
          pairs,
        };
        setFormOpen(false);
        setActiveResults({
          draw: newestDraw,
          pairs: newestDraw.pairs && newestDraw.pairs.length > 0 ? newestDraw.pairs : pairs,
        });
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleQuickRedraw = async (draw) => {
    try {
      setBusy(true);
      setError(null);
      const updatedDraw = await redrawSecretSantaDraw(draw.id);
      await loadDraws();
      setActiveResults({
        draw: updatedDraw,
        pairs: updatedDraw.pairs || [],
      });
      setSuccessMsg(`Generated new random matches for "${updatedDraw.title}"!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDraw = async (draw) => {
    try {
      setError(null);
      await deleteSecretSantaDraw(draw.id);
      if (activeResults?.draw?.id === draw.id) {
        setActiveResults(null);
      }
      await loadDraws();
    } catch (err) {
      setError(err);
    }
  };

  const copyUrl = (url, key) => {
    navigator.clipboard.writeText(url);
    setCopiedToken(key);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const copyAllLinks = (drawTitle, pairs, key) => {
    if (!pairs || pairs.length === 0) return;
    const lines = [
      `🎅 ${drawTitle || 'Secret Santa'} - Private Reveal Links`,
      '',
      ...pairs.map((p) => `${p.giver_name}: ${getPairShareUrl(p)}`),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAllKey(key);
    setTimeout(() => setCopiedAllKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Secret Santa Generator"
        subtitle="Automatic random drawing with exclusion rules and private secret links"
        icon={Sparkles}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {draws.some((d) => d.is_admin !== false && (d.pairs || []).length > 0) && (
              <button
                type="button"
                onClick={() => setShowNames((prev) => !prev)}
                className="btn-soft text-xs py-2 px-3 flex items-center gap-1.5 font-bold"
              >
                {showNames ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span>{showNames ? 'Hide Matched Names' : 'Show Matched Names'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={openNewDrawModal}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" />
              <span>New Secret Santa Draw</span>
            </button>
          </div>
        }
      />

      <ErrorBanner error={error} />
      <SuccessBanner message={successMsg} />

      {/* Existing Draws */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner className="w-8 h-8 text-tomato-600" />
        </div>
      ) : draws.length === 0 ? (
        <div className="card p-12 text-center space-y-4">
          <div className="text-5xl">🎅</div>
          <h3 className="font-display font-extrabold text-2xl">No Secret Santa draws yet!</h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            Set up an exchange, add your family&apos;s names, optionally prevent spouses from drawing each other,
            and everyone gets their own secret reveal link!
          </p>
          <button
            type="button"
            onClick={openNewDrawModal}
            className="btn-primary mx-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Start an Exchange</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {draws.map((d) => {
            const pairs = d.pairs || [];
            const isDrawAdmin = d.is_admin !== false;
            return (
              <div key={d.id} className="card card-pad space-y-4">
                {/* Draw Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-3 border-b border-line/60">
                  <div>
                    <div className="flex items-center flex-wrap gap-2 mb-1.5">
                      <span className="chip chip-pine text-xs font-bold">Active Exchange</span>
                      {d.budget_limit != null && (
                        <span className="font-extrabold text-xs text-ink bg-sunk px-2.5 py-1 rounded-xl">
                          ${d.budget_limit} Limit
                        </span>
                      )}
                      {d.exchange_date && (
                        <span className="text-xs font-semibold text-muted bg-sunk px-2.5 py-1 rounded-xl">
                          📅 {d.exchange_date}
                        </span>
                      )}
                    </div>
                    <h3 className="font-display font-extrabold text-xl text-ink">{d.title}</h3>
                    <p className="text-xs text-muted mt-0.5">
                      {isDrawAdmin
                        ? `${d.pairs_count} participants • Click Edit & Re-run anytime to modify names or redraw`
                        : `${d.pairs_count} participants • Matches and reveal links are managed privately by your group admin`}
                    </p>
                  </div>

                  {/* Draw Actions (Group Admins / Owners Only) */}
                  {isDrawAdmin && (
                    <div className="flex items-center flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveResults({ draw: d, pairs })}
                        className="btn-soft text-xs py-2 px-3 flex items-center gap-1.5 font-bold"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>View Links Modal</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => copyAllLinks(d.title, pairs, `card-${d.id}`)}
                        className="btn-soft text-xs py-2 px-3 flex items-center gap-1.5 font-bold"
                      >
                        {copiedAllKey === `card-${d.id}` ? (
                          <Check className="w-3.5 h-3.5 text-pine-700" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedAllKey === `card-${d.id}` ? 'Copied All!' : 'Copy All Links'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditDrawModal(d)}
                        className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5 font-bold"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit &amp; Re-run</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickRedraw(d)}
                        disabled={busy}
                        title="Re-shuffle matches with current participants and rules"
                        className="btn-soft text-xs py-2 px-3 flex items-center gap-1.5 font-bold"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Re-draw</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteDraw(d)}
                        title="Delete this Secret Santa draw"
                        aria-label={`Delete ${d.title}`}
                        className="btn-icon text-muted hover:text-tomato-600 hover:bg-tomato-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Draw Exclusions / Gift Conflicts & Warnings */}
                {(() => {
                  const drawExclLines = formatExclusionsToText(d.exclusions)
                    .split('\n')
                    .filter(Boolean);
                  const warnings = isDrawAdmin ? findDrawConflictWarnings(d, familyPeople) : { violated: [], missingRules: [] };
                  if (
                    drawExclLines.length === 0 &&
                    warnings.violated.length === 0 &&
                    warnings.missingRules.length === 0
                  ) {
                    return null;
                  }
                  return (
                    <div className="space-y-2">
                      {drawExclLines.length > 0 && (
                        <div className="flex items-center flex-wrap gap-1.5 text-xs">
                          <span className="font-bold text-muted">🚫 Gift Conflicts:</span>
                          {drawExclLines.map((rule) => (
                            <span
                              key={rule}
                              className="chip bg-sunk text-ink font-mono text-[11px] font-bold"
                            >
                              {rule}
                            </span>
                          ))}
                        </div>
                      )}
                      {warnings.violated.length > 0 && (
                        <div className="banner-error text-xs py-2.5 px-3">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>
                            <strong>Gift conflict alert:</strong> Current matches violate saved preferences conflicts (
                            <span className="font-mono">{warnings.violated.join(', ')}</span>). Click{' '}
                            <strong>Edit &amp; Re-run</strong> and sync saved conflicts to fix.
                          </span>
                        </div>
                      )}
                      {warnings.violated.length === 0 && warnings.missingRules.length > 0 && (
                        <div className="banner-warn text-xs py-2.5 px-3">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>
                            <strong>New saved gift conflicts in Preferences:</strong>{' '}
                            <span className="font-mono">{warnings.missingRules.join(', ')}</span> not yet applied to this draw.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Pairs List: Names & Secret Links */}
                {pairs.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {pairs.map((p) => {
                      const shareUrl = getPairShareUrl(p);
                      const copyKey = `card-pair-${p.id}`;
                      return (
                        <div
                          key={p.id}
                          className="p-3 rounded-2xl bg-sunk/60 border border-line/60 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center flex-wrap gap-1.5 text-sm">
                              <span className="font-extrabold text-ink">{p.giver_name}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-muted shrink-0" />
                              {showNames ? (
                                <span className="font-extrabold text-pine-800 dark:text-pine-200 bg-pine-100 dark:bg-pine-900/40 px-2 py-0.5 rounded-lg text-xs">
                                  🎁 {p.receiver_name}
                                </span>
                              ) : (
                                <span className="text-xs text-muted italic">Hidden match</span>
                              )}
                              {p.viewed_at && (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded-md">
                                  Opened
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted font-mono truncate select-all">
                              {shareUrl}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => copyUrl(shareUrl, copyKey)}
                            className="btn-soft text-xs py-1.5 px-3 flex items-center gap-1 font-bold shrink-0"
                          >
                            {copiedToken === copyKey ? (
                              <Check className="w-3.5 h-3.5 text-pine-700" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedToken === copyKey ? 'Copied' : 'Copy Link'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create or Edit & Re-run Draw */}
      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingDraw(null);
        }}
        title={editingDraw ? 'Edit & Re-run Secret Santa' : 'New Secret Santa Exchange'}
      >
        <form onSubmit={handleSaveAndRunDraw} className="space-y-4">
          <Field label="Exchange Title" htmlFor="draw-title">
            <input
              id="draw-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Miller Family Christmas 2026"
              className="input font-semibold"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget Limit ($)" htmlFor="draw-budget">
              <input
                id="draw-budget"
                type="number"
                min="0"
                value={budgetLimit}
                onChange={(e) => setBudgetLimit(e.target.value)}
                placeholder="50"
                className="input"
              />
            </Field>

            <Field label="Exchange Date (Optional)" htmlFor="draw-date">
              <input
                id="draw-date"
                type="text"
                value={exchangeDate}
                onChange={(e) => setExchangeDate(e.target.value)}
                placeholder="Dec 25"
                className="input"
              />
            </Field>
          </div>

          {/* Quick Pick from Family Roster (App Users + Non-User Family Members) */}
          {familyPeople.length > 0 && (
            <div className="rounded-2xl bg-sunk/50 border border-line/70 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-ink flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-tomato-600" />
                  <span>Pick from Family Roster ({familyPeople.length})</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectAllFamily}
                    className="btn-soft text-[11px] py-1 px-2.5 font-bold"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncSavedConflicts}
                    className="btn-soft text-[11px] py-1 px-2.5 font-bold"
                  >
                    Sync Conflicts
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const selectedLower = new Set(
                    participantsText
                      .split('\n')
                      .map((s) => s.trim().toLowerCase())
                      .filter(Boolean)
                  );
                  return familyPeople.map((person) => {
                    const isPicked = selectedLower.has(person.name.trim().toLowerCase());
                    const conflictCount = (person.preferences?.conflicts || []).length;
                    const filledCount = person.preferences?.filled_count || 0;
                    return (
                      <button
                        key={`${person.person_type}:${person.person_id}`}
                        type="button"
                        onClick={() => toggleRosterParticipant(person.name)}
                        className={`chip px-3 py-1.5 text-xs font-bold flex items-center gap-1 ${
                          isPicked
                            ? 'chip-on'
                            : 'bg-surface text-ink border border-line hover:bg-sunk'
                        }`}
                      >
                        <span>
                          {person.person_type === 'managed_profile'
                            ? person.avatar_emoji || '🎁'
                            : '🎁'}
                        </span>
                        <span>{person.name}</span>
                        {filledCount > 0 && (
                          <span
                            className={`text-[10px] px-1 rounded ${
                              isPicked ? 'bg-white/20 text-white' : 'bg-pine-100 text-pine-800'
                            }`}
                          >
                            ♥{filledCount}
                          </span>
                        )}
                        {conflictCount > 0 && (
                          <span
                            title={`Has ${conflictCount} saved gift conflict(s)`}
                            className={`text-[10px] px-1 rounded ${
                              isPicked ? 'bg-white/25 text-white' : 'bg-tomato-100 text-tomato-700'
                            }`}
                          >
                            🚫{conflictCount}
                          </span>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          <Field
            label="Participants (One name per line)"
            htmlFor="draw-participants"
            hint="Enter at least 2 family members or tap names above."
          >
            <textarea
              id="draw-participants"
              required
              rows={5}
              value={participantsText}
              onChange={(e) => setParticipantsText(e.target.value)}
              placeholder="Grandma&#10;Mom&#10;Dad&#10;Sarah&#10;John"
              className="input font-mono text-sm"
            />
          </Field>

          <Field
            label="Exclusions / Gift Conflicts (Optional, one rule per line)"
            htmlFor="draw-exclusions"
            hint="Format: Person -> Excluded (e.g. John -> Sarah ensures John won't draw Sarah). Auto-populated from saved Gift Conflicts."
          >
            <textarea
              id="draw-exclusions"
              rows={3}
              value={exclusionsText}
              onChange={(e) => setExclusionsText(e.target.value)}
              placeholder="John -> Sarah&#10;Sarah -> John"
              className="input font-mono text-xs"
            />
          </Field>

          {/* Live Conflict Validation Check */}
          {(() => {
            const names = participantsText
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean);
            const parsedExcl = parseExclusionsFromText(exclusionsText);
            const blockedPeople = names.filter((giver) => {
              const excluded = new Set(
                (parsedExcl[giver] || []).map((x) => x.toLowerCase())
              );
              const eligible = names.filter(
                (r) =>
                  r.toLowerCase() !== giver.toLowerCase() &&
                  !excluded.has(r.toLowerCase())
              );
              return names.length >= 2 && eligible.length === 0;
            });
            if (blockedPeople.length === 0) return null;
            return (
              <div className="banner-warn text-xs py-2.5 px-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Impossible conflict rule:</strong>{' '}
                  <span className="font-bold">{blockedPeople.join(', ')}</span> has no eligible
                  person left to draw. Add more participants or remove a conflict rule.
                </span>
              </div>
            );
          })()}

          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy
              ? 'Running Random Draw...'
              : editingDraw
              ? '🎁 Save & Re-run Secret Santa Draw'
              : '🎁 Draw Names & Generate Secret Links'}
          </button>
        </form>
      </Modal>

      {/* Modal: Reveal & Share Links */}
      <Modal
        open={Boolean(activeResults)}
        onClose={() => setActiveResults(null)}
        title={activeResults?.draw?.title ? `${activeResults.draw.title} — Links & Matches` : 'Secret Santa Results Generated!'}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted flex-1">
              Send each participant their private link below. When they open it, their secret match will be revealed!
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowNames((prev) => !prev)}
                className="btn-soft text-xs py-1.5 px-2.5 flex items-center gap-1 font-bold"
              >
                {showNames ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showNames ? 'Hide Names' : 'Show Names'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  copyAllLinks(
                    activeResults?.draw?.title,
                    activeResults?.pairs,
                    'modal-all'
                  )
                }
                className="btn-soft text-xs py-1.5 px-2.5 flex items-center gap-1 font-bold"
              >
                {copiedAllKey === 'modal-all' ? (
                  <Check className="w-3.5 h-3.5 text-pine-700" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedAllKey === 'modal-all' ? 'Copied All' : 'Copy All'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {activeResults?.pairs?.map((p) => {
              const shareUrl = getPairShareUrl(p);
              const copyKey = `modal-pair-${p.id}`;
              return (
                <div key={p.id} className="card p-3 bg-sunk/50 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="font-bold text-sm text-ink">{p.giver_name}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted shrink-0" />
                      {showNames ? (
                        <span className="font-extrabold text-xs text-pine-800 dark:text-pine-200 bg-pine-100 dark:bg-pine-900/40 px-2 py-0.5 rounded-lg">
                          🎁 {p.receiver_name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted italic">Hidden match</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted font-mono truncate select-all">{shareUrl}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyUrl(shareUrl, copyKey)}
                    className="btn-soft text-xs py-1.5 px-3 flex items-center gap-1 font-bold shrink-0"
                  >
                    {copiedToken === copyKey ? (
                      <Check className="w-3.5 h-3.5 text-pine-700" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedToken === copyKey ? 'Copied' : 'Copy Link'}</span>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            {activeResults?.draw && (
              <button
                type="button"
                onClick={() => openEditDrawModal(activeResults.draw)}
                className="btn-soft flex-1 py-2.5 flex items-center justify-center gap-1.5 font-bold text-xs"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit &amp; Re-run Draw</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveResults(null)}
              className="btn-primary flex-1 py-2.5"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
