import React, { useState, useEffect } from 'react';
import {
  Plus, LayoutGrid, List as ListIcon, Share2, Sparkles, ArrowLeft,
  ExternalLink, Check, ShoppingCart, HelpCircle, Loader2, Pencil, Trash2,
  CheckSquare, Square, CheckCheck, X
} from 'lucide-react';
import {
  getWishlist, updateWishlist, deleteWishlist, addItem, updateItem, deleteItem,
  claimItem, releaseClaim, scrapeUrl, createShareToken
} from '../api';
import { PageHeader, Spinner, ErrorBanner, SuccessBanner } from '../components/ui';
import Modal, { Field } from '../components/Modal';
import ItemCard from '../components/ItemCard';
import ItemRow from '../components/ItemRow';
import ShareModal from '../components/ShareModal';
import { navigate } from '../lib/router';
import { useAuth } from '../context/AuthContext';

export default function ListDetailPage({ wishlistId }) {
  const { user } = useAuth();
  const [wishlist, setWishlist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'compact'

  // Multi-item selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  // Edit List Modal
  const [editListOpen, setEditListOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editOccasion, setEditOccasion] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Add / Edit Item Modal
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemTitle, setItemTitle] = useState('');
  const [itemUrl, setItemUrl] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [itemPriority, setItemPriority] = useState(1);
  const [scraping, setScraping] = useState(false);
  const [scrapeSuccess, setScrapeSuccess] = useState(null);

  // Link Return Prompt ("Did you buy this?")
  const [activeOutboundItem, setActiveOutboundItem] = useState(null);
  const [didYouBuyPromptOpen, setDidYouBuyPromptOpen] = useState(false);

  // Share Modal
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [sharePreSelectedIds, setSharePreSelectedIds] = useState([]);

  const loadList = async () => {
    try {
      setLoading(true);
      const data = await getWishlist(wishlistId);
      setWishlist(data);
      if (data.view_mode) setViewMode(data.view_mode);
      setEditTitle(data.title);
      setEditOccasion(data.occasion || 'Christmas');
      setEditDescription(data.description || '');
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, [wishlistId]);

  // Window Focus listener for "Did you buy this?" prompt
  useEffect(() => {
    const handleWindowFocus = () => {
      if (activeOutboundItem) {
        setDidYouBuyPromptOpen(true);
      }
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [activeOutboundItem]);

  const handleExternalLinkClick = (item) => {
    setActiveOutboundItem(item);
  };

  // Selection helpers
  const handleToggleSelect = (id) => {
    if (selectedItemIds.includes(id)) {
      setSelectedItemIds(selectedItemIds.filter((x) => x !== id));
    } else {
      setSelectedItemIds([...selectedItemIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (wishlist?.items) {
      setSelectedItemIds(wishlist.items.map((i) => i.id));
    }
  };

  const handleDeselectAll = () => {
    setSelectedItemIds([]);
  };

  const openShareWithSelection = () => {
    setSharePreSelectedIds(selectedItemIds);
    setShareOpen(true);
  };

  const openShare = () => {
    setSharePreSelectedIds(selectedItemIds.length > 0 ? selectedItemIds : []);
    setShareOpen(true);
  };

  const handleAutoScrape = async (overrideUrl = null) => {
    const urlToScrape = (overrideUrl || itemUrl).trim();
    if (!urlToScrape || (!urlToScrape.startsWith('http://') && !urlToScrape.startsWith('https://'))) return;
    try {
      setScraping(true);
      setScrapeSuccess(null);
      const data = await scrapeUrl(urlToScrape);
      if (data.clean_url) setItemUrl(data.clean_url);
      if (data.title) setItemTitle(data.title);
      if (data.image_url) setItemImageUrl(data.image_url);
      if (data.price !== null && data.price !== undefined) setItemPrice(data.price.toString());
      if (data.description) setItemDescription(data.description);
      setScrapeSuccess(`Autofilled from ${data.vendor || 'store'}!`);
    } catch (err) {
      console.warn('Scraping error:', err);
    } finally {
      setScraping(false);
    }
  };

  const handleSaveEditList = async (e) => {
    e.preventDefault();
    if (!editTitle.trim()) return;
    try {
      const updated = await updateWishlist(wishlistId, {
        title: editTitle.trim(),
        occasion: editOccasion,
        description: editDescription.trim() || null,
      });
      setWishlist({ ...wishlist, ...updated });
      setEditListOpen(false);
    } catch (err) {
      setError(err);
    }
  };

  const handleDeleteList = async () => {
    if (!window.confirm(`Are you sure you want to delete "${wishlist.title}"?`)) return;
    try {
      await deleteWishlist(wishlistId);
      navigate('/lists');
    } catch (err) {
      setError(err);
    }
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!itemTitle.trim()) return;
    const payload = {
      title: itemTitle.trim(),
      url: itemUrl.trim() || null,
      price: itemPrice ? parseFloat(itemPrice) : null,
      description: itemDescription.trim() || null,
      image_url: itemImageUrl.trim() || null,
      priority: parseInt(itemPriority, 10),
    };

    try {
      if (editingItem) {
        const updated = await updateItem(editingItem.id, payload);
        setWishlist({
          ...wishlist,
          items: wishlist.items.map((i) => (i.id === updated.id ? updated : i)),
        });
      } else {
        const created = await addItem(wishlistId, payload);
        setWishlist({
          ...wishlist,
          items: [...wishlist.items, created],
        });
      }
      setItemModalOpen(false);
      resetItemForm();
    } catch (err) {
      setError(err);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Remove this gift idea from your wishlist?')) return;
    try {
      await deleteItem(itemId);
      setWishlist({
        ...wishlist,
        items: wishlist.items.filter((i) => i.id !== itemId),
      });
      setSelectedItemIds(selectedItemIds.filter((id) => id !== itemId));
    } catch (err) {
      setError(err);
    }
  };

  const handleClaim = async (itemId, status) => {
    try {
      const updated = await claimItem(itemId, status);
      setWishlist({
        ...wishlist,
        items: wishlist.items.map((i) => (i.id === updated.id ? updated : i)),
      });
    } catch (err) {
      setError(err);
    }
  };

  const handleRelease = async (itemId) => {
    try {
      const updated = await releaseClaim(itemId);
      setWishlist({
        ...wishlist,
        items: wishlist.items.map((i) => (i.id === updated.id ? updated : i)),
      });
    } catch (err) {
      setError(err);
    }
  };

  const handleItemsReservedFromModal = (updatedItems) => {
    if (!updatedItems || updatedItems.length === 0) return;
    const map = new Map(updatedItems.map((i) => [i.id, i]));
    setWishlist((prev) => ({
      ...prev,
      items: prev.items.map((item) => (map.has(item.id) ? map.get(item.id) : item)),
    }));
  };

  const resetItemForm = () => {
    setEditingItem(null);
    setItemTitle('');
    setItemUrl('');
    setItemPrice('');
    setItemDescription('');
    setItemImageUrl('');
    setItemPriority(1);
    setScrapeSuccess(null);
  };

  const startEdit = (item) => {
    setEditingItem(item);
    setItemTitle(item.title);
    setItemUrl(item.url || '');
    setItemPrice(item.price ? item.price.toString() : '');
    setItemDescription(item.description || '');
    setItemImageUrl(item.image_url || '');
    setItemPriority(item.priority || 1);
    setScrapeSuccess(null);
    setItemModalOpen(true);
  };

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner className="w-8 h-8 text-tomato-600" />
      </div>
    );
  }

  if (!wishlist) {
    return (
      <div className="card p-10 text-center space-y-4">
        <h2 className="text-xl font-bold">Wishlist not found</h2>
        <button type="button" onClick={() => navigate('/lists')} className="btn-primary">
          Back to Wishlists
        </button>
      </div>
    );
  }

  const isOwner = wishlist.is_owner;
  const ownerDisplayName = wishlist.managed_profile_name || wishlist.owner_name;

  return (
    <div className="space-y-6 pb-24">
      {/* Top Breadcrumb & Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => navigate('/lists')}
          className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 font-bold text-muted"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Wishlists</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="bg-sunk rounded-2xl p-1 flex items-center gap-0.5 border border-line/60">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Big Cards Grid View"
              className={`btn-icon w-8 h-8 ${
                viewMode === 'grid'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              title="Compact Detail List View"
              className={`btn-icon w-8 h-8 ${
                viewMode === 'compact'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Select Items Toggle Button */}
          {wishlist.items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const nextMode = !selectionMode;
                setSelectionMode(nextMode);
                if (!nextMode) setSelectedItemIds([]);
              }}
              className={`text-xs py-2 px-3 flex items-center gap-1.5 font-bold rounded-2xl transition ${
                selectionMode
                  ? 'bg-tomato-600 text-white shadow-soft'
                  : 'btn-soft'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{selectionMode ? 'Done Selecting' : 'Select Items'}</span>
              {selectedItemIds.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white text-tomato-700 text-[10px] font-black">
                  {selectedItemIds.length}
                </span>
              )}
            </button>
          )}

          {/* Share Button */}
          <button
            type="button"
            onClick={openShare}
            className="btn-soft text-xs py-2 px-3 flex items-center gap-1.5 font-bold"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>

          {isOwner && (
            <>
              <button
                type="button"
                onClick={() => setEditListOpen(true)}
                title="Edit wishlist name"
                className="btn-soft text-xs py-2 px-3 flex items-center gap-1.5 font-bold"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit List</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  resetItemForm();
                  setItemModalOpen(true);
                }}
                className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Gift</span>
              </button>
            </>
          )}
        </div>
      </div>

      <ErrorBanner error={error} />

      {/* List Header */}
      <div className="card card-pad bg-gradient-to-r from-surface to-sunk/40 border-line">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{wishlist.icon || '🎁'}</span>
              <span className="chip chip-sunny text-xs">{wishlist.occasion || 'Holiday'}</span>
              {wishlist.managed_profile_name && (
                <span className="chip chip-pine text-xs">Child: {wishlist.managed_profile_name}</span>
              )}
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-ink">
              {wishlist.title}
            </h1>
            <p className="text-sm text-muted mt-1">
              By <span className="font-bold text-ink">{ownerDisplayName}</span> • {wishlist.items.length} items
            </p>
            {wishlist.description && (
              <p className="text-sm text-ink/80 mt-2 max-w-xl">{wishlist.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Items Section */}
      {wishlist.items.length === 0 ? (
        <div className="card p-12 text-center space-y-3">
          <div className="text-4xl">✨</div>
          <h3 className="font-display font-extrabold text-xl">This wishlist is empty!</h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            {isOwner
              ? 'Add some ideas, paste a link from Amazon or Target, or write down things you love.'
              : 'The list owner hasn’t added any items yet.'}
          </p>
          {isOwner && (
            <button
              type="button"
              onClick={() => {
                resetItemForm();
                setItemModalOpen(true);
              }}
              className="btn-primary mx-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Item</span>
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {wishlist.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              isOwner={isOwner}
              onEdit={startEdit}
              onDelete={handleDeleteItem}
              onClaim={handleClaim}
              onRelease={handleRelease}
              onExternalLinkClick={handleExternalLinkClick}
              selectionMode={selectionMode}
              isSelected={selectedItemIds.includes(item.id)}
              onToggleSelect={handleToggleSelect}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {wishlist.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              isOwner={isOwner}
              onEdit={startEdit}
              onDelete={handleDeleteItem}
              onClaim={handleClaim}
              onRelease={handleRelease}
              onExternalLinkClick={handleExternalLinkClick}
              selectionMode={selectionMode}
              isSelected={selectedItemIds.includes(item.id)}
              onToggleSelect={handleToggleSelect}
            />
          ))}
        </div>
      )}

      {/* Floating Selection Dock */}
      {selectionMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-surface/95 backdrop-blur-md border border-line shadow-lift rounded-3xl p-3 sm:px-5 flex items-center gap-3 sm:gap-4 max-w-xl w-[92%] sm:w-auto">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-tomato-500 animate-pulse" />
            <span className="font-extrabold text-xs sm:text-sm text-ink whitespace-nowrap">
              {selectedItemIds.length} gift{selectedItemIds.length !== 1 ? 's' : ''} selected
            </span>
          </div>

          <div className="flex items-center gap-1.5 border-l border-line pl-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs font-bold text-tomato-600 hover:underline px-1 py-0.5"
            >
              Select All
            </button>
            <span className="text-muted text-xs">•</span>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="text-xs font-bold text-muted hover:text-ink px-1 py-0.5"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={selectedItemIds.length === 0}
              onClick={openShareWithSelection}
              className="btn-primary text-xs py-2 px-3.5 shadow-soft font-extrabold flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share Selected</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectionMode(false);
                setSelectedItemIds([]);
              }}
              className="btn-icon w-8 h-8 text-muted hover:text-ink hover:bg-sunk"
              title="Close selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal: Edit List */}
      <Modal open={editListOpen} onClose={() => setEditListOpen(false)} title="Edit Wishlist Details">
        <form onSubmit={handleSaveEditList} className="space-y-4">
          <Field label="Wishlist Title" htmlFor="edit-w-title">
            <input
              id="edit-w-title"
              type="text"
              required
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input font-semibold"
            />
          </Field>
          <Field label="Occasion" htmlFor="edit-w-occ">
            <select
              id="edit-w-occ"
              value={editOccasion}
              onChange={(e) => setEditOccasion(e.target.value)}
              className="input font-semibold"
            >
              <option value="Christmas">🎄 Christmas / Holiday</option>
              <option value="Birthday">🎂 Birthday</option>
              <option value="General">🎁 General Wishlist</option>
              <option value="Baby">👶 Baby / Kids</option>
              <option value="Wedding">💍 Wedding / Anniversary</option>
            </select>
          </Field>
          <Field label="Description / Notes" htmlFor="edit-w-desc">
            <textarea
              id="edit-w-desc"
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Size preferences, favorite colors, etc."
              className="input text-sm"
            />
          </Field>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 py-3">
              Save Changes
            </button>
            <button
              type="button"
              onClick={handleDeleteList}
              className="btn-danger py-3 px-4 font-bold"
            >
              Delete Wishlist
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add / Edit Item */}
      <Modal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title={editingItem ? 'Edit Gift Item' : 'Add to Wishlist'}
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <Field
            label="Paste a Store Link (Optional)"
            htmlFor="item-url"
            hint="Paste any Amazon, Target, or Walmart link to automatically fill details & photo!"
          >
            <div className="flex gap-2">
              <input
                id="item-url"
                type="url"
                value={itemUrl}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
                    setItemUrl(text);
                    handleAutoScrape(text);
                  }
                }}
                onChange={(e) => {
                  setItemUrl(e.target.value);
                  if (e.target.value.startsWith('http://') || e.target.value.startsWith('https://')) {
                    setTimeout(() => handleAutoScrape(e.target.value), 250);
                  }
                }}
                placeholder="https://amazon.com/dp/..."
                className="input text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => handleAutoScrape()}
                disabled={scraping || !itemUrl.trim()}
                className="btn-soft shrink-0 text-xs py-2 px-3 font-bold"
              >
                {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Autofill'}
              </button>
            </div>
            {scraping && (
              <p className="text-xs text-tomato-600 font-bold mt-1.5 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching product title, photo &amp; price...
              </p>
            )}
            {scrapeSuccess && (
              <p className="text-xs text-pine-700 font-bold mt-1 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> {scrapeSuccess}
              </p>
            )}
          </Field>

          <Field label="Item Title" htmlFor="item-title">
            <input
              id="item-title"
              type="text"
              required
              autoFocus
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              placeholder="e.g. Lego Space Shuttle or Warm Wool Scarf"
              className="input font-semibold"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimated Price ($)" htmlFor="item-price">
              <input
                id="item-price"
                type="number"
                step="0.01"
                min="0"
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
                placeholder="29.99"
                className="input"
              />
            </Field>

            <Field label="Priority" htmlFor="item-priority">
              <select
                id="item-priority"
                value={itemPriority}
                onChange={(e) => setItemPriority(e.target.value)}
                className="input font-semibold"
              >
                <option value={1}>Nice to have</option>
                <option value={2}>⭐ Loved item</option>
                <option value={3}>⭐⭐ Top Wish / Most Wanted</option>
              </select>
            </Field>
          </div>

          <Field label="Image URL (Optional)" htmlFor="item-img">
            <input
              id="item-img"
              type="url"
              value={itemImageUrl}
              onChange={(e) => setItemImageUrl(e.target.value)}
              placeholder="https://..."
              className="input text-xs font-mono"
            />
          </Field>

          <Field label="Notes / Size / Color Preferences" htmlFor="item-desc">
            <textarea
              id="item-desc"
              rows={3}
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              placeholder="Size Medium, prefers Navy Blue or Forest Green..."
              className="input text-sm"
            />
          </Field>

          <button type="submit" className="btn-primary w-full py-3 text-base">
            {editingItem ? 'Save Changes' : 'Add Item'}
          </button>
        </form>
      </Modal>

      {/* Return Prompt Modal ("Did you buy this?") */}
      <Modal
        open={didYouBuyPromptOpen}
        onClose={() => {
          setDidYouBuyPromptOpen(false);
          setActiveOutboundItem(null);
        }}
        title="Welcome back!"
      >
        <div className="space-y-4 text-center py-2">
          <div className="text-4xl">🛍️</div>
          <p className="font-extrabold text-lg text-ink">
            Did you buy <span className="text-tomato-600 font-black">{activeOutboundItem?.title}</span>?
          </p>
          <p className="text-sm text-muted max-w-sm mx-auto">
            Marking it off makes sure no one else in the family accidentally buys the same thing!
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (activeOutboundItem) handleClaim(activeOutboundItem.id, 'purchased');
                setDidYouBuyPromptOpen(false);
                setActiveOutboundItem(null);
              }}
              className="btn-pine py-3 font-extrabold"
            >
              ✓ Yes, I bought it!
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeOutboundItem) handleClaim(activeOutboundItem.id, 'reserved');
                setDidYouBuyPromptOpen(false);
                setActiveOutboundItem(null);
              }}
              className="btn-soft py-3 font-bold"
            >
              🎁 Hold it (Reserve)
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setDidYouBuyPromptOpen(false);
              setActiveOutboundItem(null);
            }}
            className="text-xs text-muted hover:text-ink font-semibold mt-2"
          >
            No, just looking for now
          </button>
        </div>
      </Modal>

      {/* Share Modal */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        wishlist={wishlist}
        shareUrl={shareUrl}
        preSelectedIds={sharePreSelectedIds}
        onItemsReserved={handleItemsReservedFromModal}
      />
    </div>
  );
}
