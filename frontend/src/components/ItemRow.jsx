import React from 'react';
import { Check, ExternalLink, Trash2, Pencil, Lock, CheckSquare, Square } from 'lucide-react';
import ProductImage from './ProductImage';

export default function ItemRow({
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
  const formattedPrice = item.price ? `$${Number(item.price).toFixed(2)}` : null;

  return (
    <div
      onClick={selectionMode ? () => onToggleSelect && onToggleSelect(item.id) : undefined}
      className={`card p-3 sm:p-4 flex items-center justify-between gap-3 sm:gap-4 transition ${
        selectionMode ? 'cursor-pointer select-none' : ''
      } ${
        isSelected
          ? 'ring-2 ring-tomato-500 shadow-lift bg-tomato-50/20'
          : isClaimed
          ? 'opacity-65 bg-sunk/40 border-line/40'
          : 'hover:border-line'
      }`}
    >
      {/* Selection Checkbox */}
      {selectionMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect && onToggleSelect(item.id);
          }}
          className={`p-1.5 rounded-xl transition shrink-0 ${
            isSelected
              ? 'bg-tomato-600 text-white shadow-soft'
              : 'bg-sunk text-muted hover:text-ink'
          }`}
          title={isSelected ? 'Deselect item' : 'Select item'}
        >
          {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
        </button>
      )}

      {/* Thumbnail + Title + Meta */}
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-sunk shrink-0 overflow-hidden flex items-center justify-center">
          <ProductImage
            src={item.image_url}
            isClaimed={isClaimed}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4
              className={`font-display font-extrabold text-base truncate ${
                isClaimed ? 'line-through text-muted' : 'text-ink'
              }`}
            >
              {item.title}
            </h4>
            {item.priority > 1 && (
              <span className="chip chip-sunny text-[10px] py-0.5 px-2">
                ⭐ {item.priority === 3 ? 'Top Wish' : 'Love'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted mt-0.5 flex-wrap">
            {formattedPrice && <span className="font-bold text-ink">{formattedPrice}</span>}

            {item.url && (
              isClaimed ? (
                <span className="text-muted/60 font-semibold flex items-center gap-1 cursor-not-allowed">
                  <Lock className="w-3 h-3" /> Store link locked
                </span>
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (selectionMode) {
                      e.stopPropagation();
                    } else {
                      onExternalLinkClick && onExternalLinkClick(item);
                    }
                  }}
                  className="text-tomato-600 dark:text-tomato-400 font-bold hover:underline flex items-center gap-1"
                >
                  Store <ExternalLink className="w-3 h-3" />
                </a>
              )
            )}

            {isClaimed && (
              <span className="chip chip-pine text-[10px] py-0 px-2 font-bold">
                {isPurchased ? '✓ Purchased' : '🔒 Reserved'} {otherClaim ? `by ${otherClaim.claimed_by_name}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isOwner ? (
          <>
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
          </>
        ) : (
          <>
            {myClaim ? (
              <div className="flex items-center gap-1.5">
                <span className="chip chip-pine text-xs font-extrabold">
                  {myClaim.status === 'purchased' ? '✓ You bought this' : '🎁 Reserved by you'}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRelease(item.id);
                  }}
                  className="text-xs text-muted hover:text-tomato-600 font-bold px-1.5"
                >
                  Release
                </button>
              </div>
            ) : otherClaim ? (
              <span className="text-xs text-muted font-bold flex items-center gap-1">
                <Lock className="w-3 h-3" /> Claimed
              </span>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClaim(item.id, 'reserved');
                  }}
                  className="btn-soft text-xs py-1.5 px-2.5 font-bold"
                >
                  Reserve
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
          </>
        )}
      </div>
    </div>
  );
}
