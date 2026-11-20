import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check, Heart, Pencil } from 'lucide-react';
import {
  GIFT_PREFERENCE_CATEGORIES,
  hasAnyPreferences,
  countFilledCategories,
  formatPreferencesAsText,
} from '../lib/preferences';

export default function GiftPreferencesCard({
  personName,
  preferences,
  collapsible = false,
  defaultOpen = true,
  showCopy = true,
  showConflicts = false,
  onEdit = null,
  emptyMessage = null,
  compact = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const hasPrefs = hasAnyPreferences(preferences);
  const filledCount = countFilledCategories(preferences);
  const conflicts = showConflicts ? preferences?.conflicts || [] : [];

  if (!hasPrefs && conflicts.length === 0 && !emptyMessage && !onEdit) {
    return null;
  }

  const handleCopy = (e) => {
    e.stopPropagation();
    const text = formatPreferencesAsText(personName, preferences);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filledCategories = GIFT_PREFERENCE_CATEGORIES.filter((cat) =>
    Boolean(preferences?.categories?.[cat.key]?.trim())
  );

  return (
    <div className={`card ${compact ? 'p-4' : 'card-pad'} bg-surface border-line/80 space-y-3`}>
      <div
        className={`flex items-center justify-between gap-2 flex-wrap ${
          collapsible ? 'cursor-pointer select-none' : ''
        }`}
        onClick={collapsible ? () => setOpen((prev) => !prev) : undefined}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-tomato-100 text-tomato-600 dark:bg-tomato-900/40 dark:text-tomato-200 flex items-center justify-center shrink-0">
            <Heart className="w-4 h-4" />
          </div>
          <div className="min-w-0 text-left">
            <h3 className="font-display font-extrabold text-base text-ink truncate">
              {personName ? `${personName}'s Gift Preferences` : 'Gift Preferences'}
            </h3>
            <p className="text-[11px] text-muted font-semibold">
              {hasPrefs
                ? `${filledCount} of ${GIFT_PREFERENCE_CATEGORIES.length} categories filled`
                : 'No preferences filled out yet'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {hasPrefs && showCopy && (
            <button
              type="button"
              onClick={handleCopy}
              className="btn-soft text-xs py-1.5 px-2.5 flex items-center gap-1 font-bold"
              title="Copy preferences as text"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-pine-700" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}

          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="btn-soft text-xs py-1.5 px-2.5 flex items-center gap-1 font-bold"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>{hasPrefs ? 'Edit' : 'Add'}</span>
            </button>
          )}

          {collapsible && hasPrefs && (
            <button
              type="button"
              aria-label={open ? 'Collapse preferences' : 'Expand preferences'}
              onClick={(e) => {
                e.stopPropagation();
                setOpen((prev) => !prev);
              }}
              className="btn-icon w-8 h-8 text-muted hover:text-ink hover:bg-sunk"
            >
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {(!collapsible || open) && (
        <>
          {!hasPrefs ? (
            emptyMessage && <p className="text-xs text-muted italic text-left">{emptyMessage}</p>
          ) : (
            <div className="space-y-3 pt-1 text-left">
              {filledCategories.length > 0 && (
                <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-2'} gap-2.5`}>
                  {filledCategories.map((cat) => (
                    <div
                      key={cat.key}
                      className="rounded-2xl bg-sunk/60 border border-line/60 p-3 space-y-1"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-ink">
                        <span aria-hidden="true">{cat.icon}</span>
                        <span>{cat.label}</span>
                      </div>
                      <p className="text-xs text-muted whitespace-pre-wrap leading-relaxed">
                        {preferences.categories[cat.key]}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {preferences?.notes?.trim() && (
                <div className="rounded-2xl bg-sunny-50/70 dark:bg-sunny-600/15 border border-line/60 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-ink">
                    <span aria-hidden="true">📝</span>
                    <span>Other Notes, Allergies &amp; Dislikes</span>
                  </div>
                  <p className="text-xs text-muted whitespace-pre-wrap leading-relaxed">
                    {preferences.notes}
                  </p>
                </div>
              )}

              {conflicts.length > 0 && (
                <div className="rounded-2xl bg-tomato-50/60 dark:bg-tomato-900/20 border border-tomato-200/70 dark:border-tomato-900/40 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-tomato-700 dark:text-tomato-200">
                    <span aria-hidden="true">🚫</span>
                    <span>Secret Santa Gift Conflicts</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {conflicts.map((target) => (
                      <span
                        key={target}
                        className="chip bg-surface text-ink border border-line text-[11px] font-mono font-bold"
                      >
                        {personName ? `${personName} -> ${target}` : target}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {(!collapsible || open) && !hasPrefs && conflicts.length > 0 && (
        <div className="rounded-2xl bg-tomato-50/60 dark:bg-tomato-900/20 border border-tomato-200/70 dark:border-tomato-900/40 p-3 space-y-1.5 text-left">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-tomato-700 dark:text-tomato-200">
            <span aria-hidden="true">🚫</span>
            <span>Secret Santa Gift Conflicts</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {conflicts.map((target) => (
              <span
                key={target}
                className="chip bg-surface text-ink border border-line text-[11px] font-mono font-bold"
              >
                {personName ? `${personName} -> ${target}` : target}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
