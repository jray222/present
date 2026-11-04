import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Copy, Check, Lock, Gift, Users } from 'lucide-react';
import { getSecretSantaDraws, createSecretSantaDraw } from '../api';
import { PageHeader, Spinner, ErrorBanner } from '../components/ui';
import Modal, { Field } from '../components/Modal';

export default function SecretSantaPage() {
  const [draws, setDraws] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create Draw Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [budgetLimit, setBudgetLimit] = useState('50');
  const [exchangeDate, setExchangeDate] = useState('');
  const [participantsText, setParticipantsText] = useState('');
  const [exclusionsText, setExclusionsText] = useState('');
  const [busy, setBusy] = useState(false);

  // Result Modal
  const [createdPairs, setCreatedPairs] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);

  const loadDraws = async () => {
    try {
      setLoading(true);
      const data = await getSecretSantaDraws();
      setDraws(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDraws();
  }, []);

  const handleCreateDraw = async (e) => {
    e.preventDefault();
    const names = participantsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (names.length < 2) {
      setError('Please add at least 2 participants (one per line).');
      return;
    }

    // Parse exclusions: "John -> Sarah"
    const exclusions = {};
    if (exclusionsText.trim()) {
      exclusionsText.split('\n').forEach((line) => {
        const parts = line.split('->').map((s) => s.trim());
        if (parts.length === 2 && parts[0] && parts[1]) {
          if (!exclusions[parts[0]]) exclusions[parts[0]] = [];
          exclusions[parts[0]].push(parts[1]);
        }
      });
    }

    try {
      setBusy(true);
      setError(null);
      const pairs = await createSecretSantaDraw({
        title: title.trim(),
        budget_limit: budgetLimit ? parseFloat(budgetLimit) : null,
        exchange_date: exchangeDate || null,
        participants: names,
        exclusions,
      });
      setCreatedPairs(pairs);
      setCreateOpen(false);
      loadDraws();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Secret Santa Generator"
        subtitle="Automatic random drawing with exclusion rules and private secret links"
        icon={Sparkles}
        actions={
          <button
            type="button"
            onClick={() => {
              setTitle('Family Secret Santa 2026');
              setParticipantsText('Grandma\nMom\nDad\nSarah\nJohn\nUncle Dave');
              setExclusionsText('Mom -> Dad\nDad -> Mom\nSarah -> John\nJohn -> Sarah');
              setCreateOpen(true);
            }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            <span>New Secret Santa Draw</span>
          </button>
        }
      />

      <ErrorBanner error={error} />

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
            onClick={() => setCreateOpen(true)}
            className="btn-primary mx-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Start an Exchange</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {draws.map((d) => (
            <div key={d.id} className="card card-pad flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="chip chip-pine text-xs font-bold">Active Exchange</span>
                  {d.budget_limit && (
                    <span className="font-extrabold text-xs text-ink bg-sunk px-2.5 py-1 rounded-xl">
                      ${d.budget_limit} Limit
                    </span>
                  )}
                </div>
                <h3 className="font-display font-extrabold text-xl text-ink">{d.title}</h3>
                <p className="text-xs text-muted mt-1">
                  {d.pairs_count} participants • Drawing permanently saved in database
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create Draw */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Secret Santa Exchange">
        <form onSubmit={handleCreateDraw} className="space-y-4">
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

          <Field
            label="Participants (One name per line)"
            htmlFor="draw-participants"
            hint="Enter at least 2 family members or friends."
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
            label="Exclusions (Optional, one rule per line)"
            htmlFor="draw-exclusions"
            hint="Format: Person -> Excluded (e.g. John -> Sarah ensures John won't draw Sarah)."
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

          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy ? 'Running Random Draw...' : '🎁 Draw Names & Generate Secret Links'}
          </button>
        </form>
      </Modal>

      {/* Modal: Reveal & Share Links */}
      <Modal open={Boolean(createdPairs)} onClose={() => setCreatedPairs(null)} title="Secret Santa Results Generated!">
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Send each participant their private link below. When they open it, their secret match will be revealed!
          </p>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {createdPairs?.map((p) => (
              <div key={p.id} className="card p-3 bg-sunk/50 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-ink">{p.giver_name}</p>
                  <p className="text-[11px] text-muted font-mono truncate">{p.view_url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyUrl(p.view_url, p.id)}
                  className="btn-soft text-xs py-1.5 px-3 flex items-center gap-1 font-bold shrink-0"
                >
                  {copiedToken === p.id ? <Check className="w-3.5 h-3.5 text-pine-700" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedToken === p.id ? 'Copied' : 'Copy Link'}</span>
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setCreatedPairs(null)}
            className="btn-primary w-full py-2.5"
          >
            Done
          </button>
        </div>
      </Modal>
    </div>
  );
}
