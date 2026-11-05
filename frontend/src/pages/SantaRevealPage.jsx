import React, { useState, useEffect } from 'react';
import { revealSecretSanta } from '../api';
import { Spinner } from '../components/ui';

export default function SantaRevealPage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await revealSecretSanta(token);
        setData(res);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <Spinner className="w-8 h-8 text-tomato-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="card card-pad max-w-md text-center space-y-3">
          <div className="text-4xl">❄</div>
          <h2 className="text-xl font-bold">Invalid or Expired Link</h2>
          <p className="text-sm text-muted">This Secret Santa link could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card card-pad max-w-md w-full text-center space-y-6 shadow-lift border-line">
        <div className="space-y-1">
          <span className="chip chip-sunny text-xs font-bold">🎅 Secret Santa Draw</span>
          <h1 className="font-display font-extrabold text-2xl text-ink mt-2">{data.title}</h1>
          <p className="text-xs text-muted">
            Hello, <span className="font-bold text-ink">{data.giver_name}</span>!
          </p>
        </div>

        {!opened ? (
          <div className="py-6 space-y-4">
            <div className="w-24 h-24 mx-auto rounded-3xl bg-tomato-100 text-tomato-600 flex items-center justify-center text-5xl shadow-soft">
              ✉️
            </div>
            <p className="text-sm text-muted max-w-xs mx-auto">
              Tap the envelope below to secretly reveal who you are giving a gift to!
            </p>
            <button
              type="button"
              onClick={() => setOpened(true)}
              className="btn-primary py-3.5 px-8 text-base shadow-pop font-extrabold"
            >
              🎁 Reveal My Match
            </button>
          </div>
        ) : (
          <div className="py-4 space-y-4 animate-in fade-in zoom-in-95 duration-300">
            <p className="text-sm text-muted uppercase tracking-wider font-extrabold">You are buying a gift for:</p>
            <div className="p-6 rounded-3xl bg-pine-100 dark:bg-pine-900/40 text-pine-900 dark:text-pine-100 border border-pine-200">
              <span className="font-display font-black text-3xl sm:text-4xl block leading-tight">
                {data.receiver_name}
              </span>
            </div>

            {data.budget_limit && (
              <p className="text-sm text-muted">
                Suggested budget: <span className="font-bold text-ink">${data.budget_limit}</span>
              </p>
            )}
            {data.exchange_date && (
              <p className="text-xs text-muted">
                Exchange date: <span className="font-bold text-ink">{data.exchange_date}</span>
              </p>
            )}

            <p className="text-xs text-muted/80 italic pt-2">
              Keep it a secret! 🤫 You can revisit this link any time if you forget.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
