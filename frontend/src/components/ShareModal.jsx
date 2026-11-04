import React, { useState, useEffect } from 'react';
import {
  Copy, Check, Download, Share2, MessageSquare, Image as ImageIcon,
  Send, Sparkles, CheckSquare, Square, Smartphone, AlertCircle
} from 'lucide-react';
import Modal from './Modal';
import { exportListAsImage } from '../lib/imageExport';
import { createShareToken, batchClaimItems } from '../api';

export default function ShareModal({
  open,
  onClose,
  wishlist,
  shareUrl: initialShareUrl,
  preSelectedIds = [],
  onItemsReserved = null,
}) {
  const [shareUrl, setShareUrl] = useState(initialShareUrl || '');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);
  const [loadingToken, setLoadingToken] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Multi-item selection mode: 'all' or 'selected'
  const [shareMode, setShareMode] = useState(preSelectedIds && preSelectedIds.length > 0 ? 'selected' : 'all');
  const [selectedIds, setSelectedIds] = useState(preSelectedIds || []);

  // "Mark as reserved?" prompt state
  const [pendingAction, setPendingAction] = useState(null); // callback to run after prompt
  const [reservePromptOpen, setReservePromptOpen] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [reservedSuccess, setReservedSuccess] = useState(false);

  // HTTPS note for iOS
  const [showHttpsNote, setShowHttpsNote] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const iosCheck = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const mobCheck = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setIsIOS(iosCheck);
      setIsMobile(mobCheck);
      if (navigator.share) {
        setCanNativeShare(true);
      }
    }
  }, []);

  useEffect(() => {
    if (open) {
      if (preSelectedIds && preSelectedIds.length > 0) {
        setSelectedIds(preSelectedIds);
        setShareMode('selected');
      } else {
        setShareMode('all');
      }
    }
  }, [open, preSelectedIds]);

  useEffect(() => {
    if (open && wishlist) {
      if (initialShareUrl) {
        setShareUrl(initialShareUrl);
      } else {
        (async () => {
          setLoadingToken(true);
          try {
            const res = await createShareToken(wishlist.id);
            let finalUrl = res.url;
            if (typeof window !== 'undefined' && res.token) {
              finalUrl = `${window.location.origin}/shared/${res.token}`;
            }
            setShareUrl(finalUrl);
          } catch (err) {
            console.error('Failed to create share token:', err);
            if (typeof window !== 'undefined') {
              setShareUrl(`${window.location.origin}/lists/${wishlist.id}`);
            }
          } finally {
            setLoadingToken(false);
          }
        })();
      }
    }
  }, [open, wishlist, initialShareUrl]);

  if (!wishlist) return null;

  // Selected items subset
  const allItems = wishlist.items || [];
  const activeItems = shareMode === 'selected'
    ? allItems.filter((item) => selectedIds.includes(item.id))
    : allItems;

  const toggleItemSelection = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const selectAll = () => setSelectedIds(allItems.map((i) => i.id));
  const deselectAll = () => setSelectedIds([]);

  // Format Text for SMS / Messaging
  const getFormattedText = (itemsToFormat = activeItems) => {
    const title = wishlist.title;
    const recipient = wishlist.managed_profile_name
      ? `${wishlist.managed_profile_name}'s Wishlist`
      : `${wishlist.owner_name}'s Wishlist`;

    const isSubset = shareMode === 'selected' && itemsToFormat.length < allItems.length;
    let text = `🎁 ${recipient} - ${title}${isSubset ? ` (${itemsToFormat.length} selected gifts)` : ''}\n\n`;

    if (itemsToFormat.length === 0) {
      text += `No items selected!\n`;
    } else {
      itemsToFormat.forEach((item, idx) => {
        const price = item.price ? ` ($${Number(item.price).toFixed(2)})` : '';
        const link = item.url ? ` - ${item.url}` : '';
        text += `${idx + 1}. ${item.title}${price}${link}\n`;
      });
    }

    if (shareUrl) {
      text += `\nView full list & reserve items here:\n${shareUrl}`;
    }
    return text;
  };

  // Helper: check if we should show "Mark as reserved?" prompt before sharing
  const triggerShareWithReservationCheck = (actionFn) => {
    // Check if any items being shared are not yet reserved
    const itemsToCheck = activeItems;
    const unreservedItems = itemsToCheck.filter((item) => !item.is_claimed && (!item.claims || item.claims.length === 0));

    // If sharing specific items and some are unreserved, suggest marking as reserved
    if (unreservedItems.length > 0 && (shareMode === 'selected' || itemsToCheck.length <= 3)) {
      setPendingAction(() => actionFn);
      setReservePromptOpen(true);
    } else {
      actionFn();
    }
  };

  // Confirm Reservation & Proceed
  const handleConfirmReservationAndShare = async () => {
    const itemsToReserve = activeItems.filter((item) => !item.is_claimed && (!item.claims || item.claims.length === 0));
    if (itemsToReserve.length > 0) {
      setReserving(true);
      try {
        const res = await batchClaimItems(itemsToReserve.map((i) => i.id), 'reserved');
        setReservedSuccess(true);
        if (onItemsReserved) {
          onItemsReserved(res.updated_items);
        }
      } catch (err) {
        console.warn('Failed to batch reserve items:', err);
      } finally {
        setReserving(false);
      }
    }
    setReservePromptOpen(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  // Skip Reservation & Proceed
  const handleSkipReservationAndShare = () => {
    setReservePromptOpen(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  // 1. iMessage / SMS Trigger
  const executeSmsShare = () => {
    const text = getFormattedText();
    const smsUrl = isIOS
      ? `sms:&body=${encodeURIComponent(text)}`
      : `sms:?body=${encodeURIComponent(text)}`;
    window.location.href = smsUrl;
  };

  // 2. WhatsApp Trigger
  const executeWhatsAppShare = () => {
    const text = getFormattedText();
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  // 3. Native iOS / Android Share Trigger
  const executeNativeShare = async () => {
    if (!navigator.share) {
      setShowHttpsNote(true);
      return;
    }
    const text = getFormattedText();
    const recipient = wishlist.managed_profile_name || wishlist.owner_name;
    try {
      await navigator.share({
        title: `${recipient}'s Wishlist - ${wishlist.title}`,
        text: text,
        url: shareUrl || window.location.href,
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error sharing:', err);
      }
    }
  };

  // 4. Copy Link
  const handleCopyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // 5. Copy Formatted Text
  const executeCopyText = async () => {
    const text = getFormattedText();
    await navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // 6. Download Graphic Card
  const executeDownloadImage = async () => {
    setExportingImage(true);
    try {
      await exportListAsImage(wishlist, shareMode === 'selected' ? activeItems : null);
    } catch (err) {
      console.error('Image export failed:', err);
    } finally {
      setExportingImage(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Share Wishlist">
        <div className="space-y-5">
          {/* Mode Switcher: Full Wishlist vs. Selected Items */}
          <div className="flex items-center gap-1 p-1 bg-sunk rounded-2xl border border-line">
            <button
              type="button"
              onClick={() => setShareMode('all')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-extrabold transition ${
                shareMode === 'all'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Full List ({allItems.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setShareMode('selected');
                if (selectedIds.length === 0 && allItems.length > 0) {
                  setSelectedIds([allItems[0].id]);
                }
              }}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                shareMode === 'selected'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <span>Selected Items</span>
              <span className="px-1.5 py-0.5 rounded-full bg-tomato-100 text-tomato-800 text-[10px]">
                {selectedIds.length}
              </span>
            </button>
          </div>

          {/* Item Checklist when "Selected Items" is active */}
          {shareMode === 'selected' && (
            <div className="card p-3 bg-surface border-line space-y-2 max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between text-xs pb-1 border-b border-line">
                <span className="font-bold text-muted">
                  Choose gifts to share ({selectedIds.length} selected):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-tomato-600 font-bold hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-muted">•</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-muted font-bold hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {allItems.map((item) => {
                const checked = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleItemSelection(item.id)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition ${
                      checked ? 'bg-tomato-50 dark:bg-tomato-950/30' : 'hover:bg-sunk/50'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-tomato-600 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-muted shrink-0" />
                    )}
                    <span className="text-xs font-bold text-ink truncate flex-1">
                      {item.title}
                    </span>
                    {item.price && (
                      <span className="text-xs font-mono font-bold text-pine-700 shrink-0">
                        ${Number(item.price).toFixed(2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Primary Mobile Sharing Actions */}
          <div className="space-y-2.5">
            <h4 className="font-display font-extrabold text-xs text-muted uppercase tracking-wider">
              {isIOS ? '📱 iOS & Mobile Sharing' : '📱 Share Options'}
            </h4>

            {/* iMessage / SMS Button (Always works on iOS & Mobile!) */}
            <button
              type="button"
              onClick={() => triggerShareWithReservationCheck(executeSmsShare)}
              className="btn-primary w-full py-3.5 text-sm shadow-pop flex items-center justify-center gap-2.5 font-extrabold bg-gradient-to-r from-emerald-600 to-pine-700 hover:from-emerald-500 hover:to-pine-600 text-white"
            >
              <MessageSquare className="w-5 h-5" />
              <span>Send via iMessage / SMS</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              {/* WhatsApp */}
              <button
                type="button"
                onClick={() => triggerShareWithReservationCheck(executeWhatsAppShare)}
                className="btn-soft py-2.5 text-xs font-bold flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4 text-emerald-600" />
                <span>WhatsApp</span>
              </button>

              {/* Native Sheet */}
              <button
                type="button"
                onClick={() => triggerShareWithReservationCheck(executeNativeShare)}
                className="btn-soft py-2.5 text-xs font-bold flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4 text-tomato-600" />
                <span>System Sheet</span>
              </button>
            </div>

            {/* HTTPS note for iOS if system sheet clicked without navigator.share */}
            {showHttpsNote && (
              <div className="banner-warn text-xs p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>iOS System Share Sheet Note</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Apple Safari restricts the native popup share sheet to secure <strong>HTTPS</strong> connections (or localhost).
                  Use the <strong>&quot;Send via iMessage / SMS&quot;</strong> button above to open Messages directly!
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowHttpsNote(false);
                    executeSmsShare();
                  }}
                  className="btn-primary text-xs py-1 px-2.5 w-full font-bold mt-1"
                >
                  Open iMessage Now →
                </button>
              </div>
            )}
          </div>

          {/* Grandparent Magic Link */}
          <div className="card p-4 bg-sunk/50 border-line space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">👵</span>
              <div>
                <h4 className="font-extrabold text-sm text-ink">Grandparent Magic Link</h4>
                <p className="text-xs text-muted">
                  Zero login required. Relatives can open this link to view items and tap &quot;I bought this&quot;.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                readOnly
                value={loadingToken ? 'Generating link...' : shareUrl}
                className="input text-xs font-mono py-2 bg-surface select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={loadingToken || !shareUrl}
                className="btn-primary text-xs py-2 px-3.5 shrink-0"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Non-App Relatives: Copy Text & Image Card */}
          <div className="space-y-3">
            <h4 className="font-display font-extrabold text-xs text-muted uppercase tracking-wider">
              For Relatives Who Don&apos;t Want An App
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Copy Formatted Text */}
              <button
                type="button"
                onClick={() => triggerShareWithReservationCheck(executeCopyText)}
                className="card p-3.5 text-left hover:border-tomato-400 hover:shadow-soft transition flex flex-col justify-between"
              >
                <div className="flex items-center gap-2 text-tomato-600 mb-1.5">
                  <Copy className="w-4 h-4" />
                  <span className="font-bold text-xs">Copy Formatted Text</span>
                </div>
                <p className="text-[11px] text-muted mb-2">
                  Copies a tidy bulleted list ready to paste into any email or chat.
                </p>
                <span className="btn-soft text-xs py-1.5 w-full flex items-center justify-center gap-1 font-bold">
                  {copiedText ? <Check className="w-3.5 h-3.5 text-pine-700" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedText ? 'Copied to Clipboard!' : 'Copy Text'}
                </span>
              </button>

              {/* Graphic Card Image */}
              <button
                type="button"
                onClick={() => triggerShareWithReservationCheck(executeDownloadImage)}
                disabled={exportingImage}
                className="card p-3.5 text-left hover:border-tomato-400 hover:shadow-soft transition flex flex-col justify-between"
              >
                <div className="flex items-center gap-2 text-pine-700 mb-1.5">
                  <ImageIcon className="w-4 h-4" />
                  <span className="font-bold text-xs">Download Gift Card</span>
                </div>
                <p className="text-[11px] text-muted mb-2">
                  High-res canvas picture with prices &amp; titles to print or text.
                </p>
                <span className="btn-soft text-xs py-1.5 w-full flex items-center justify-center gap-1 font-bold">
                  <Download className="w-3.5 h-3.5" />
                  {exportingImage ? 'Drawing image...' : 'Download Image'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* "Mark as reserved?" Modal Confirmation Prompt */}
      <Modal
        open={reservePromptOpen}
        onClose={handleSkipReservationAndShare}
        title="Mark as reserved?"
      >
        <div className="space-y-4 text-center">
          <div className="w-14 h-14 rounded-full bg-tomato-100 dark:bg-tomato-950/50 text-tomato-600 flex items-center justify-center mx-auto text-2xl">
            🎁
          </div>
          <div>
            <h3 className="font-display font-extrabold text-lg text-ink">
              Reserve these gifts?
            </h3>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              You are sharing{' '}
              <strong>
                {activeItems.length} gift{activeItems.length > 1 ? 's' : ''}
              </strong>{' '}
              with someone. Would you like to mark {activeItems.length > 1 ? 'them' : 'it'} as{' '}
              <strong className="text-tomato-600">reserved</strong> so nobody else buys duplicates?
            </p>
          </div>

          <div className="p-3 bg-sunk/50 rounded-2xl border border-line text-left max-h-36 overflow-y-auto space-y-1">
            {activeItems.map((item) => (
              <div key={item.id} className="text-xs font-bold text-ink flex items-center justify-between">
                <span className="truncate">• {item.title}</span>
                {item.price && <span className="font-mono text-muted ml-2">${Number(item.price).toFixed(2)}</span>}
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              disabled={reserving}
              onClick={handleConfirmReservationAndShare}
              className="btn-primary w-full py-3 text-sm font-extrabold shadow-soft"
            >
              {reserving ? 'Reserving...' : '✓ Yes, Mark as Reserved & Share'}
            </button>
            <button
              type="button"
              onClick={handleSkipReservationAndShare}
              className="btn-soft w-full py-2.5 text-xs font-bold"
            >
              No, Just Share
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
