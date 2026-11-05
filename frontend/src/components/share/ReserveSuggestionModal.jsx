import React from 'react';
import Modal from '../Modal';
import { Spinner } from '../ui';

export default function ReserveSuggestionModal({
  open,
  onClose,
  itemsToReserve,
  onConfirmReserve,
  onSkipReserve,
  reserving,
}) {
  return (
    <Modal open={open} onClose={onClose} title="Mark as Reserved?">
      <div className="space-y-4">
        <p className="text-sm text-muted leading-relaxed">
          Would you like to mark {itemsToReserve.length === 1 ? 'this gift' : `these ${itemsToReserve.length} gifts`} as{' '}
          <strong className="text-ink">Reserved</strong> before sharing? This prevents anyone else in the family from accidentally buying the same gift.
        </p>

        <div className="p-3 bg-sunk/60 rounded-2xl space-y-1.5 max-h-36 overflow-y-auto">
          {itemsToReserve.map((item) => (
            <div key={item.id} className="text-xs font-bold text-ink truncate flex items-center justify-between">
              <span>🎁 {item.title}</span>
              {item.price && (
                <span className="font-mono text-muted text-[11px]">${Number(item.price).toFixed(2)}</span>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2 pt-2">
          <button
            type="button"
            disabled={reserving}
            onClick={onConfirmReserve}
            className="btn-primary w-full py-3 text-sm font-extrabold flex items-center justify-center gap-2"
          >
            {reserving ? (
              <Spinner className="w-4 h-4 text-white" />
            ) : (
              <span>🔒 Yes, Mark Reserved &amp; Share</span>
            )}
          </button>
          <button
            type="button"
            disabled={reserving}
            onClick={onSkipReserve}
            className="btn-soft w-full py-2.5 text-xs font-bold text-muted hover:text-ink"
          >
            No, Just Share Without Reserving
          </button>
        </div>
      </div>
    </Modal>
  );
}
