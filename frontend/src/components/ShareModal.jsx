import React, { useState, useEffect } from 'react';
import {
  Copy, Check, Download, Share2, MessageSquare, Image as ImageIcon,
  Send, AlertCircle
} from 'lucide-react';
import Modal from './Modal';
import { exportListAsImage } from '../lib/imageExport';
import { createShareToken, batchClaimItems } from '../api';
import ShareItemSelector from './share/ShareItemSelector';
import ReserveSuggestionModal from './share/ReserveSuggestionModal';

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

  // Multi-item selection mode: 'all' or 'selected'
  const [prevPreSelected, setPrevPreSelected] = useState(preSelectedIds);
  const [shareMode, setShareMode] = useState(preSelectedIds && preSelectedIds.length > 0 ? 'selected' : 'all');
  const [selectedIds, setSelectedIds] = useState(preSelectedIds || []);

  if (preSelectedIds !== prevPreSelected) {
    setPrevPreSelected(preSelectedIds);
    if (preSelectedIds && preSelectedIds.length > 0) {
      setSelectedIds(preSelectedIds);
      setShareMode('selected');
    }
  }

  const [prevInitialUrl, setPrevInitialUrl] = useState(initialShareUrl);
  if (initialShareUrl !== prevInitialUrl) {
    setPrevInitialUrl(initialShareUrl);
    if (initialShareUrl) {
      setShareUrl(initialShareUrl);
    }
  }

  // "Mark as reserved?" prompt state
  const [pendingAction, setPendingAction] = useState(null);
  const [reservePromptOpen, setReservePromptOpen] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [showHttpsNote, setShowHttpsNote] = useState(false);

  // Synchronously compute platform flags
  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  useEffect(() => {
    if (!open || !wishlist || initialShareUrl) return;

    let active = true;
    (async () => {
      setLoadingToken(true);
      try {
        const res = await createShareToken(wishlist.id);
        let finalUrl = res.url;
        if (typeof window !== 'undefined' && res.token) {
          finalUrl = `${window.location.origin}/shared/${res.token}`;
        }
        if (active) setShareUrl(finalUrl);
      } catch (err) {
        console.error('Failed to create share token:', err);
        if (active && typeof window !== 'undefined') {
          setShareUrl(`${window.location.origin}/lists/${wishlist.id}`);
        }
      } finally {
        if (active) setLoadingToken(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, wishlist, initialShareUrl]);

  if (!wishlist) return null;

  const allItems = wishlist.items || [];
  const activeItems = shareMode === 'selected'
    ? allItems.filter((item) => selectedIds.includes(item.id))
    : allItems;

  const toggleItemSelection = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedIds(allItems.map((i) => i.id));
  const deselectAll = () => setSelectedIds([]);

  const getFormattedText = () => {
    const recipient = wishlist.managed_profile_name || wishlist.owner_name;
    const lines = [
      `🎁 ${recipient}'s Wishlist - ${wishlist.title}`,
      `Occasion: ${wishlist.occasion || 'Gifts'}`,
      '',
    ];

    if (activeItems.length === 0) {
      lines.push('(No items currently listed)');
    } else {
      activeItems.forEach((item) => {
        const priceStr = item.price ? ` ($${Number(item.price).toFixed(2)})` : '';
        const priorityStr = item.priority === 3 ? ' ⭐ Most Wanted' : '';
        lines.push(`• ${item.title}${priceStr}${priorityStr}`);
        if (item.url) lines.push(`  Link: ${item.url}`);
        if (item.description) lines.push(`  Note: ${item.description}`);
      });
    }

    if (shareUrl) {
      lines.push('');
      lines.push(`View or mark items off online:`);
      lines.push(shareUrl);
    }

    return lines.join('\n');
  };

  const triggerShareWithReservationCheck = (shareAction) => {
    if (wishlist.is_owner) {
      shareAction();
      return;
    }
    const unreserved = activeItems.filter((item) => !item.is_claimed);
    if (unreserved.length > 0) {
      setPendingAction(() => shareAction);
      setReservePromptOpen(true);
    } else {
      shareAction();
    }
  };

  const handleConfirmReservationAndShare = async () => {
    const unreservedIds = activeItems.filter((item) => !item.is_claimed).map((i) => i.id);
    setReserving(true);
    try {
      if (unreservedIds.length > 0) {
        await batchClaimItems(unreservedIds, 'reserved');
        if (onItemsReserved) onItemsReserved(unreservedIds);
      }
    } catch (err) {
      console.error('Failed to batch reserve items:', err);
    } finally {
      setReserving(false);
      setReservePromptOpen(false);
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    }
  };

  const handleSkipReservationAndShare = () => {
    setReservePromptOpen(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const executeSmsShare = () => {
    const text = getFormattedText();
    const encoded = encodeURIComponent(text);
    const smsUrl = isIOS ? `sms:&body=${encoded}` : `sms:?body=${encoded}`;
    window.location.href = smsUrl;
  };

  const executeWhatsAppShare = () => {
    const text = getFormattedText();
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

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
      if (err.name !== 'AbortError') console.error('Error sharing:', err);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const executeCopyText = async () => {
    const text = getFormattedText();
    await navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

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
          <ShareItemSelector
            shareMode={shareMode}
            setShareMode={setShareMode}
            allItems={allItems}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            selectAll={selectAll}
            deselectAll={deselectAll}
            toggleItemSelection={toggleItemSelection}
          />

          {/* Primary Mobile Sharing Actions */}
          <div className="space-y-2.5">
            <h4 className="font-display font-extrabold text-xs text-muted uppercase tracking-wider">
              {isIOS ? '📱 iOS & Mobile Sharing' : '📱 Share Options'}
            </h4>

            {/* iMessage / SMS Button */}
            <button
              type="button"
              onClick={() => triggerShareWithReservationCheck(executeSmsShare)}
              className="btn-primary w-full py-3.5 text-sm shadow-pop flex items-center justify-center gap-2.5 font-extrabold bg-gradient-to-r from-emerald-600 to-pine-700 hover:from-emerald-500 hover:to-pine-600 text-white"
            >
              <MessageSquare className="w-5 h-5" />
              <span>Send via iMessage / SMS</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => triggerShareWithReservationCheck(executeWhatsAppShare)}
                className="btn-soft py-2.5 text-xs font-bold flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4 text-emerald-600" />
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => triggerShareWithReservationCheck(executeNativeShare)}
                className="btn-soft py-2.5 text-xs font-bold flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4 text-tomato-600" />
                <span>System Sheet</span>
              </button>
            </div>

            {showHttpsNote && (
              <div className="banner-warn text-xs p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>iOS System Share Sheet Note</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Apple Safari restricts the native popup share sheet to secure <strong>HTTPS</strong> connections.
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

          {/* Relatives Without An App: Copy Text & Image Card */}
          <div className="space-y-3">
            <h4 className="font-display font-extrabold text-xs text-muted uppercase tracking-wider">
              For Relatives Who Don&apos;t Want An App
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      <ReserveSuggestionModal
        open={reservePromptOpen}
        onClose={handleSkipReservationAndShare}
        itemsToReserve={activeItems.filter((i) => !i.is_claimed)}
        onConfirmReserve={handleConfirmReservationAndShare}
        onSkipReserve={handleSkipReservationAndShare}
        reserving={reserving}
      />
    </>
  );
}
