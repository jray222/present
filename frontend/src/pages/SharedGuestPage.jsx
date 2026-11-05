import React, { useState, useEffect } from 'react';
import { Lock, ExternalLink, User } from 'lucide-react';
import { getSharedWishlist, claimItem, releaseClaim } from '../api';
import { Spinner, ErrorBanner } from '../components/ui';
import Modal, { Field } from '../components/Modal';
import ProductImage from '../components/ProductImage';

export default function SharedGuestPage({ token }) {
  const [wishlist, setWishlist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Guest Name stored in localStorage for effortless subsequent taps
  const [guestName, setGuestName] = useState(() => localStorage.getItem('present_guest_name') || '');
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { itemId, status }

  // Outbound link return prompt
  const [outboundItem, setOutboundItem] = useState(null);
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getSharedWishlist(token);
        if (active) {
          setWishlist(data);
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
  }, [token]);

  useEffect(() => {
    const handleFocus = () => {
      if (outboundItem) setPromptOpen(true);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [outboundItem]);

  const executeClaim = async (itemId, status, nameToUse) => {
    try {
      const updated = await claimItem(itemId, status, nameToUse);
      setWishlist({
        ...wishlist,
        items: wishlist.items.map((i) => (i.id === itemId ? updated : i)),
      });
    } catch (err) {
      setError(err);
    }
  };

  const handleClaimClick = (itemId, status) => {
    if (!guestName.trim()) {
      setPendingAction({ itemId, status });
      setNameModalOpen(true);
      return;
    }
    executeClaim(itemId, status, guestName.trim());
  };

  const handleSaveNameAndClaim = (e) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    localStorage.setItem('present_guest_name', guestName.trim());
    setNameModalOpen(false);
    if (pendingAction) {
      executeClaim(pendingAction.itemId, pendingAction.status, guestName.trim());
      setPendingAction(null);
    }
  };

  const handleRelease = async (itemId) => {
    try {
      const updated = await releaseClaim(itemId, guestName.trim());
      setWishlist({
        ...wishlist,
        items: wishlist.items.map((i) => (i.id === itemId ? updated : i)),
      });
    } catch (err) {
      setError(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <Spinner className="w-8 h-8 text-tomato-600" />
      </div>
    );
  }

  if (error || !wishlist) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="card card-pad max-w-md text-center space-y-3">
          <div className="text-4xl">🎁</div>
          <h2 className="text-xl font-bold">Wishlist Not Available</h2>
          <p className="text-sm text-muted">This sharing link has expired or is invalid.</p>
        </div>
      </div>
    );
  }

  const owner = wishlist.managed_profile_name || wishlist.owner_name;

  return (
    <div className="min-h-screen bg-cream py-6 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Friendly High-Contrast Guest Header */}
        <div className="card card-pad bg-surface border-line shadow-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🎁</span>
            <div>
              <span className="chip chip-sunny text-xs font-bold">{wishlist.occasion || 'Holiday'}</span>
              <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-ink">
                {owner}&apos;s Wishlist
              </h1>
              <p className="text-xs text-muted mt-0.5">
                Tap &quot;Reserve&quot; or &quot;I Bought This&quot; so other family members know it&apos;s taken!
              </p>
            </div>
          </div>

          {/* Guest Identity indicator */}
          <div className="flex items-center gap-2">
            {guestName ? (
              <span className="text-xs font-bold text-muted bg-sunk px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                <span>You: <strong>{guestName}</strong></span>
                <button
                  type="button"
                  onClick={() => setNameModalOpen(true)}
                  className="text-tomato-600 underline ml-1"
                >
                  Change
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setNameModalOpen(true)}
                className="btn-soft text-xs py-2 px-3 font-bold"
              >
                Set Your Name
              </button>
            )}
          </div>
        </div>

        <ErrorBanner error={error} />

        {/* Wishlist Items List (Large readable format for grandparents) */}
        <div className="space-y-4">
          {wishlist.items.map((item) => {
            const isClaimed = item.is_claimed;
            const isPurchased = item.claim_status === 'purchased';
            const myClaim = item.claims?.find(
              (c) => c.guest_buyer_name?.toLowerCase() === guestName.toLowerCase()
            );
            const otherClaim = item.claims?.find(
              (c) => c.guest_buyer_name?.toLowerCase() !== guestName.toLowerCase()
            );

            return (
              <div
                key={item.id}
                className={`card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                  isClaimed ? 'opacity-65 bg-sunk/50 border-line/50' : 'hover:shadow-lift'
                }`}
              >
                {/* Image + Info */}
                <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-sunk overflow-hidden shrink-0 flex items-center justify-center">
                    <ProductImage
                      src={item.image_url}
                      isClaimed={isClaimed}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        className={`font-display font-extrabold text-lg sm:text-xl ${
                          isClaimed ? 'line-through text-muted' : 'text-ink'
                        }`}
                      >
                        {item.title}
                      </h3>
                      {item.price && (
                        <span className="font-extrabold text-sm px-2.5 py-0.5 rounded-xl bg-sunk text-ink">
                          ${Number(item.price).toFixed(2)}
                        </span>
                      )}
                    </div>

                    {item.description && (
                      <p className="text-sm text-muted mt-1">{item.description}</p>
                    )}

                    {/* External Link or Lockout */}
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      {item.url && (
                        isClaimed ? (
                          <span className="text-muted/60 font-semibold flex items-center gap-1 cursor-not-allowed">
                            <Lock className="w-3.5 h-3.5" /> Link Locked (Already Taken)
                          </span>
                        ) : (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setOutboundItem(item)}
                            className="text-tomato-600 font-extrabold hover:underline flex items-center gap-1 text-sm"
                          >
                            <span>Open Store Page</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )
                      )}

                      {isClaimed && (
                        <span className="chip chip-pine text-xs font-bold">
                          {isPurchased ? '✓ Purchased' : '🔒 Reserved'} {otherClaim ? `by ${otherClaim.claimed_by_name}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Claim Buttons */}
                <div className="shrink-0 flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-0 border-line/60">
                  {myClaim ? (
                    <div className="flex items-center gap-2">
                      {myClaim.status === 'reserved' && (
                        <button
                          type="button"
                          onClick={() => handleClaimClick(item.id, 'purchased')}
                          className="btn-pine py-2.5 px-4 font-bold"
                        >
                          ✓ I Bought It
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRelease(item.id)}
                        className="btn-ghost py-2 px-3 text-xs hover:text-tomato-600"
                      >
                        Release Dibs
                      </button>
                    </div>
                  ) : !isClaimed ? (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleClaimClick(item.id, 'reserved')}
                        className="btn-soft flex-1 sm:flex-initial py-3 px-4 font-extrabold text-sm"
                      >
                        🎁 Reserve Dibs
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClaimClick(item.id, 'purchased')}
                        className="btn-primary flex-1 sm:flex-initial py-3 px-4 font-extrabold text-sm"
                      >
                        ✓ I Bought This
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted font-bold italic py-2">
                      Taken by family
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guest Name Modal */}
      <Modal open={nameModalOpen} onClose={() => setNameModalOpen(false)} title="What is your name?">
        <form onSubmit={handleSaveNameAndClaim} className="space-y-4">
          <p className="text-xs text-muted">
            We only use this to show family who reserved each gift (e.g. &quot;Reserved by Grandma Linda&quot;).
          </p>
          <Field label="Your Name or Nickname" htmlFor="guest-name">
            <input
              id="guest-name"
              type="text"
              required
              autoFocus
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Grandma Linda or Aunt Sarah"
              className="input text-lg font-bold"
            />
          </Field>
          <button type="submit" className="btn-primary w-full py-3 text-base">
            Continue & Save
          </button>
        </form>
      </Modal>

      {/* Return Prompt Modal ("Did you buy this?") */}
      <Modal
        open={promptOpen}
        onClose={() => {
          setPromptOpen(false);
          setOutboundItem(null);
        }}
        title="Welcome back!"
      >
        <div className="space-y-4 text-center py-2">
          <div className="text-4xl">🛍️</div>
          <p className="font-extrabold text-lg text-ink">
            Did you buy <span className="text-tomato-600">{outboundItem?.title}</span>?
          </p>
          <p className="text-sm text-muted">
            Marking it off guarantees nobody else in the family gets the same gift!
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (outboundItem) handleClaimClick(outboundItem.id, 'purchased');
                setPromptOpen(false);
                setOutboundItem(null);
              }}
              className="btn-pine py-3 font-extrabold"
            >
              ✓ Yes, I bought it!
            </button>
            <button
              type="button"
              onClick={() => {
                if (outboundItem) handleClaimClick(outboundItem.id, 'reserved');
                setPromptOpen(false);
                setOutboundItem(null);
              }}
              className="btn-soft py-3 font-bold"
            >
              🎁 Hold it (Reserve)
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setPromptOpen(false);
              setOutboundItem(null);
            }}
            className="text-xs text-muted hover:text-ink font-semibold mt-2"
          >
            No, just looking for now
          </button>
        </div>
      </Modal>
    </div>
  );
}
