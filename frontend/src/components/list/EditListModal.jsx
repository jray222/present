import React, { useState } from 'react';
import Modal, { Field } from '../Modal';

export default function EditListModal({
  open,
  onClose,
  wishlist,
  onSave,
  onDelete,
}) {
  const [prevWishlist, setPrevWishlist] = useState(wishlist);
  const [title, setTitle] = useState(wishlist?.title || '');
  const [occasion, setOccasion] = useState(wishlist?.occasion || 'Christmas');
  const [description, setDescription] = useState(wishlist?.description || '');
  const [isArchived, setIsArchived] = useState(Boolean(wishlist?.is_archived));

  if (wishlist !== prevWishlist) {
    setPrevWishlist(wishlist);
    setTitle(wishlist?.title || '');
    setOccasion(wishlist?.occasion || 'Christmas');
    setDescription(wishlist?.description || '');
    setIsArchived(Boolean(wishlist?.is_archived));
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      occasion,
      description: description.trim() || null,
      is_archived: isArchived,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Wishlist Settings">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Wishlist Title" htmlFor="edit-title">
          <input
            id="edit-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input font-semibold"
          />
        </Field>

        <Field label="Occasion" htmlFor="edit-occasion">
          <select
            id="edit-occasion"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            className="input font-semibold"
          >
            <option value="Christmas">🎄 Christmas</option>
            <option value="Birthday">🎂 Birthday</option>
            <option value="General">🎁 General Ideas</option>
            <option value="Baby">🍼 Baby</option>
            <option value="Wedding">💍 Wedding</option>
          </select>
        </Field>

        <Field label="Description / Notes (Optional)" htmlFor="edit-desc">
          <textarea
            id="edit-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input text-sm"
          />
        </Field>

        <div className="flex items-center justify-between p-3 bg-sunk rounded-xl">
          <div>
            <p className="font-bold text-xs text-ink">Archive Wishlist</p>
            <p className="text-[11px] text-muted">Hide from your active lists while preserving items</p>
          </div>
          <input
            type="checkbox"
            checked={isArchived}
            onChange={(e) => setIsArchived(e.target.checked)}
            className="w-4 h-4 rounded text-tomato-600 focus:ring-tomato-500"
          />
        </div>

        <div className="pt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onDelete}
            className="btn-soft text-xs text-tomato-600 hover:bg-tomato-50 border border-tomato-200"
          >
            Delete List
          </button>
          <button type="submit" className="btn-primary text-xs py-2.5 px-5 font-bold">
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
