import React, { useState, useEffect } from 'react';
import {
  Plus, LayoutGrid, List as ListIcon, Share2, ArrowLeft,
  Pencil, CheckSquare, ArrowUp, ArrowDown
} from 'lucide-react';
import {
  getWishlist, updateWishlist, deleteWishlist, addItem, updateItem, deleteItem,
  claimItem, releaseClaim, reorderItems
} from '../api';
import { Spinner, ErrorBanner } from '../components/ui';
import ItemCard from '../components/ItemCard';
import ItemRow from '../components/ItemRow';
import ShareModal from '../components/ShareModal';
import ItemFormModal from '../components/list/ItemFormModal';
import SelectionToolbar from '../components/list/SelectionToolbar';
import ReturnPromptModal from '../components/list/ReturnPromptModal';
import EditListModal from '../components/list/EditListModal';
import { navigate } from '../lib/router';

export default function ListDetailPage({ wishlistId }) {
  const [wishlist, setWishlist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'compact'

  // Multi-item selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  // Modals
  const [editListOpen, setEditListOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Link Return Prompt ("Did you buy this?")
  const [activeOutboundItem, setActiveOutboundItem] = useState(null);
  const [didYouBuyPromptOpen, setDidYouBuyPromptOpen] = useState(false);

  // Share Modal
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePreSelectedIds, setSharePreSelectedIds] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getWishlist(wishlistId);
        if (active) {
          setWishlist(data);
          setViewMode(data.view_mode || 'grid');
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
  }, [wishlistId]);

  // Window Focus Event Listener for Link Return Prompt
  useEffect(() => {
    const handleFocus = () => {
      if (activeOutboundItem) {
        setDidYouBuyPromptOpen(true);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [activeOutboundItem]);

  const handleSaveListMeta = async (updatedData) => {
    try {
      const updated = await updateWishlist(wishlistId, updatedData);
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

  const handleSaveItem = async (payload) => {
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
      setEditingItem(null);
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

  const handleMoveItem = async (itemId, direction) => {
    const items = [...wishlist.items];
    const index = items.findIndex((i) => i.id === itemId);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const [moved] = items.splice(index, 1);
    items.splice(targetIndex, 0, moved);

    // Optimistic UI update
    setWishlist({ ...wishlist, items });

    try {
      await reorderItems(wishlistId, items.map((i) => i.id));
    } catch (err) {
      setError(err);
    }
  };

  const handleItemsReservedFromModal = (updatedItemIds) => {
    if (!updatedItemIds || updatedItemIds.length === 0) return;
    const reservedSet = new Set(updatedItemIds);
    setWishlist((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        reservedSet.has(item.id)
          ? { ...item, is_claimed: true, claim_status: 'reserved' }
          : item
      ),
    }));
  };

  const toggleSelect = (id) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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
              title="Compact Detail View"
              className={`btn-icon w-8 h-8 ${
                viewMode === 'compact'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Multi-Select Toggle */}
          {wishlist.items?.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectionMode(!selectionMode);
                setSelectedItemIds([]);
              }}
              className={`btn-soft text-xs py-2 px-3 flex items-center gap-1.5 font-bold ${
                selectionMode ? 'bg-tomato-100 dark:bg-tomato-950/40 text-tomato-700' : ''
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>{selectionMode ? 'Done Selecting' : 'Select Items'}</span>
            </button>
          )}

          {/* Primary Share Modal Trigger */}
          <button
            type="button"
            onClick={() => {
              setSharePreSelectedIds([]);
              setShareOpen(true);
            }}
            className="btn-primary text-xs py-2 px-3.5 shadow-pop flex items-center gap-1.5 font-extrabold"
          >
            <Share2 className="w-4 h-4" />
            <span>Share List</span>
          </button>
        </div>
      </div>

      <ErrorBanner error={error} />

      {/* Header Card */}
      <div className="card card-pad relative overflow-hidden bg-gradient-to-br from-surface via-surface to-sunk/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-4xl sm:text-5xl shrink-0 p-3 bg-sunk rounded-3xl border border-line">
              {wishlist.icon || '🎁'}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display font-black text-2xl sm:text-3xl text-ink">
                  {wishlist.title}
                </h1>
                <span className="chip chip-sunny text-xs font-bold">
                  {wishlist.occasion || 'Christmas'}
                </span>
                {wishlist.is_archived && (
                  <span className="chip text-xs font-bold bg-sunk text-muted">
                    Archived
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-1 font-semibold">
                Wishlist for <strong className="text-ink">{ownerDisplayName}</strong>
                {wishlist.items?.length > 0 ? ` • ${wishlist.items.length} gift ideas` : ''}
              </p>
              {wishlist.description && (
                <p className="text-xs text-muted/90 mt-2 max-w-xl leading-relaxed">
                  {wishlist.description}
                </p>
              )}
            </div>
          </div>

          {isOwner && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditListOpen(true)}
                className="btn-soft text-xs py-2 px-3 font-bold flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit List</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setItemModalOpen(true);
                }}
                className="btn-primary text-xs py-2 px-3.5 font-extrabold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Gift</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Items List / Grid */}
      {wishlist.items?.length === 0 ? (
        <div className="card p-12 text-center space-y-4">
          <div className="text-5xl">✨</div>
          <h3 className="font-display font-extrabold text-2xl text-ink">This wishlist is empty</h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            {isOwner
              ? 'Add your first gift idea by pasting a link from Amazon, Target, or any store!'
              : `${ownerDisplayName} hasn't added any items yet. Check back soon!`}
          </p>
          {isOwner && (
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setItemModalOpen(true);
              }}
              className="btn-primary mx-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Gift</span>
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {wishlist.items.map((item, idx) => (
            <div key={item.id} className="relative group/reorder">
              <ItemCard
                item={item}
                isOwner={isOwner}
                onEdit={() => {
                  setEditingItem(item);
                  setItemModalOpen(true);
                }}
                onDelete={() => handleDeleteItem(item.id)}
                onClaim={(status) => handleClaim(item.id, status)}
                onRelease={() => handleRelease(item.id)}
                onExternalLinkClick={(clickedItem) => setActiveOutboundItem(clickedItem)}
                selectionMode={selectionMode}
                isSelected={selectedItemIds.includes(item.id)}
                onToggleSelect={toggleSelect}
              />
              {isOwner && !selectionMode && (
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/reorder:opacity-100 transition bg-surface/90 backdrop-blur rounded-lg shadow-soft p-0.5 z-10">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMoveItem(item.id, 'up')}
                    className="p-1 hover:bg-sunk rounded text-muted hover:text-ink disabled:opacity-30"
                    title="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === wishlist.items.length - 1}
                    onClick={() => handleMoveItem(item.id, 'down')}
                    className="p-1 hover:bg-sunk rounded text-muted hover:text-ink disabled:opacity-30"
                    title="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {wishlist.items.map((item, idx) => (
            <div key={item.id} className="relative group/reorder">
              <ItemRow
                item={item}
                isOwner={isOwner}
                onEdit={() => {
                  setEditingItem(item);
                  setItemModalOpen(true);
                }}
                onDelete={() => handleDeleteItem(item.id)}
                onClaim={(status) => handleClaim(item.id, status)}
                onRelease={() => handleRelease(item.id)}
                onExternalLinkClick={(clickedItem) => setActiveOutboundItem(clickedItem)}
                selectionMode={selectionMode}
                isSelected={selectedItemIds.includes(item.id)}
                onToggleSelect={toggleSelect}
              />
              {isOwner && !selectionMode && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/reorder:opacity-100 transition bg-surface/90 backdrop-blur rounded-lg shadow-soft p-0.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMoveItem(item.id, 'up')}
                    className="p-1 hover:bg-sunk rounded text-muted hover:text-ink disabled:opacity-30"
                    title="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === wishlist.items.length - 1}
                    onClick={() => handleMoveItem(item.id, 'down')}
                    className="p-1 hover:bg-sunk rounded text-muted hover:text-ink disabled:opacity-30"
                    title="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Floating Selection Action Toolbar */}
      {selectionMode && (
        <SelectionToolbar
          selectedCount={selectedItemIds.length}
          totalCount={wishlist.items?.length || 0}
          onSelectAll={() => setSelectedItemIds(wishlist.items.map((i) => i.id))}
          onClear={() => setSelectedItemIds([])}
          onShareSelected={() => {
            setSharePreSelectedIds(selectedItemIds);
            setShareOpen(true);
          }}
          onExit={() => {
            setSelectionMode(false);
            setSelectedItemIds([]);
          }}
        />
      )}

      {/* Modals */}
      <ItemFormModal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        editingItem={editingItem}
        onSaveItem={handleSaveItem}
      />

      <EditListModal
        open={editListOpen}
        onClose={() => setEditListOpen(false)}
        wishlist={wishlist}
        onSave={handleSaveListMeta}
        onDelete={handleDeleteList}
      />

      <ReturnPromptModal
        open={didYouBuyPromptOpen}
        onClose={() => {
          setDidYouBuyPromptOpen(false);
          setActiveOutboundItem(null);
        }}
        item={activeOutboundItem}
        onClaim={handleClaim}
      />

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        wishlist={wishlist}
        preSelectedIds={sharePreSelectedIds}
        onItemsReserved={handleItemsReservedFromModal}
      />
    </div>
  );
}
