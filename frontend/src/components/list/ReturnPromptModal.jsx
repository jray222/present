import React from 'react';
import Modal from '../Modal';

export default function ReturnPromptModal({
  open,
  onClose,
  item,
  onClaim,
}) {
  if (!item) return null;

  return (
    <Modal open={open} onClose={onClose} title="Welcome back!">
      <div className="space-y-4 text-center py-2">
        <div className="text-4xl">🛍️</div>
        <p className="font-extrabold text-lg text-ink">
          Did you buy <span className="text-tomato-600 font-black">{item.title}</span>?
        </p>
        <p className="text-sm text-muted max-w-sm mx-auto">
          Marking it off makes sure no one else in the family accidentally buys the same thing!
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={() => onClaim(item.id, 'purchased')}
            className="btn-pine py-3 font-extrabold"
          >
            ✓ Yes, I bought it!
          </button>
          <button
            type="button"
            onClick={() => onClaim(item.id, 'reserved')}
            className="btn-soft py-3 font-bold"
          >
            🎁 Hold it (Reserve)
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted hover:text-ink font-semibold mt-2"
        >
          No, just looking for now
        </button>
      </div>
    </Modal>
  );
}
