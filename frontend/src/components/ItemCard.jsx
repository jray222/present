import React from 'react';
import { Check, ExternalLink, Trash2, Pencil, Lock, CheckSquare, Square } from 'lucide-react';
import ProductImage from './ProductImage';

export default function ItemCard({
  item,
  isOwner,
  onEdit,
  onDelete,
  onClaim,
  onRelease,
  onExternalLinkClick,
  selectionMode = false,
  isSelected = false,
  onToggleSelect = null,
}) {
  const isClaimed = item.is_claimed;
  const isPurchased = item.claim_status === 'purchased';
  const myClaim = item.claims?.find((c) => c.is_own_claim);
  const otherClaim = item.claims?.find((c) => !c.is_own_claim);

  // Price formatting
  const formattedPrice = item.price ? `$${Number(item.price).toFixed(2)}` : null;

  return (
    <div
      onClick={selectionMode ? () => onToggleSelect && onToggleSelect(item.id) : undefined}
      className={`card overflow-hidden flex flex-col justify-between transition-all duration-200 relative ${
        selectionMode ? 'cursor-pointer select-none' : ''
      } ${
        isSelected
          ? 'ring-2 ring-tomato-500 shadow-lift bg-tomato-50/20'
          : isClaimed
          ? 'opacity-65 bg-sunk/50 border-line/40'
          : 'hover:shadow-lift hover:-translate-y-0.5'
      }`}
    >
      {/* Product Image / Placeholder Banner */}
      <div className="relative aspect-video sm:aspect-square w-full bg-sunk/60 overflow-hidden flex items-center justify-center">
        <ProductImage
          src={item.image_url}
          isClaimed={isClaimed}
          className="w-full h-full object-cover transition-opacity"
        />

        {/* Selection Checkbox Overlay */}
        {selectionMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleSelect) onToggleSelect(item.id);
            }}
            className={`absolute top-3 left-3 z-10 p-1.5 rounded-xl transition ${
              isSelected
                ? 'bg-tomato-600 text-white shadow-soft ring-2 ring-white'
                : 'bg-surface/90 text-muted hover:text-ink shadow-sm'
            }`}
            title={isSelected ? 'Deselect item' : 'Select item'}
          >
            {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
          </button>
        )}

        {/* Priority Star / Heart Pill (shifted right if in selection mode) */}
        {item.priority > 1 && !selectionMode && (
          <span className="absolute top-3 left-3 chip chip-sunny shadow-sm">
            ⭐ {item.priority === 3 ? 'Most Wanted' : 'Loved Item'}
          </span>
        )}

        {/* Claim / Taken Status Overlay Badge */}
        {isClaimed && (
          <div className="absolute top-3 right-3">
            {isPurchased ? (
              <span className="chip chip-pine shadow-sm font-extrabold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Purchased {otherClaim ? `by ${otherClaim.claimed_by_name}` : ''}
              </span>
            ) : (
              <span className="chip bg-sunny-200 text-sunny-900 shadow-sm font-extrabold flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" />
                Reserved {otherClaim ? `by ${otherClaim.claimed_by_name}` : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3
              className={`font-display font-extrabold text-lg leading-snug line-clamp-2 ${
                isClaimed ? 'line-through text-muted' : 'text-ink'
              }`}
            >
              {item.title}
            </h3>
            {formattedPrice && (
              <span className="font-extrabold text-sm px-2.5 py-1 rounded-xl bg-sunk text-ink shrink-0">
                {formattedPrice}
              </span>
            )}
          </div>

          {item.description && (
            <p className="text-sm text-muted line-clamp-2 mt-1">{item.description}</p>
          )}
        </div>

        {/* Actions Bar */}
        <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between gap-2">
          {/* External Store Link Button (Disabled if Claimed to prevent duplicates!) */}
          {item.url ? (
            isClaimed ? (
              <span
                className="text-xs font-bold text-muted/60 flex items-center gap-1 cursor-not-allowed select-none"
                title="This gift is claimed; store link locked to avoid accidental duplicates."
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Store Locked</span>
              </span>
            ) : (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (selectionMode) {
                    e.stopPropagation();
                  } else if (onExternalLinkClick) {
                    onExternalLinkClick(item);
                  }
                }}
                className="btn-soft text-xs py-1.5 px-3 flex items-center gap-1 font-bold text-tomato-600 dark:text-tomato-400"
              >
                <span>View Store</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )
          ) : (
            <span />
          )}

          {/* Owner vs Family Giver Controls */}
          {isOwner ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(item);
                }}
                className="btn-icon w-8 h-8 text-muted hover:text-ink hover:bg-sunk"
                title="Edit item"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="btn-icon w-8 h-8 text-muted hover:text-tomato-600 hover:bg-sunk"
                title="Delete item"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {myClaim ? (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold text-pine-700 bg-pine-100 dark:bg-pine-950/60 px-2 py-1 rounded-xl">
                      {myClaim.status === 'purchased' ? '✓ You bought this' : '🎁 You reserved this'}
                    </span>
                    {myClaim.status === 'reserved' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onClaim) onClaim(item.id, 'purchased');
                        }}
                        className="text-xs text-pine-700 dark:text-pine-300 font-bold px-1.5 py-1 hover:underline"
                        title="Mark as purchased"
                      >
                        Bought it?
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRelease(item.id);
                      }}
                      className="text-xs text-muted hover:text-tomato-600 font-bold px-1.5 py-1"
                      title="Release your claim"
                    >
                      Release
                    </button>
                  </div>
                  {myClaim.needs_purchase_reminder && (
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-300 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800">
                      ⚠️ Reserved 7+ days ago — have you purchased this yet?
                    </span>
                  )}
                </div>
              ) : otherClaim ? (
                <span className="text-xs font-bold text-muted flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Taken by {otherClaim.claimed_by_name}
                </span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClaim(item.id, 'reserved');
                    }}
                    className="btn-soft text-xs py-1.5 px-2.5 font-bold"
                    title="Reserve this so no one else buys it"
                  >
                    Hold
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClaim(item.id, 'purchased');
                    }}
                    className="btn-primary text-xs py-1.5 px-3 font-extrabold"
                  >
                    I Bought This
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
