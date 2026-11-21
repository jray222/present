import React, { useState, useRef, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
import Modal, { Field } from '../Modal';
import { scrapeUrl } from '../../api';

function getInitialFormState(item) {
  return {
    title: item?.title || '',
    url: item?.url || '',
    price: item?.price !== null && item?.price !== undefined ? item.price.toString() : '',
    description: item?.description || '',
    imageUrl: item?.image_url || '',
    priority: item?.priority || 1,
  };
}

export default function ItemFormModal({
  open,
  onClose,
  editingItem,
  onSaveItem,
}) {
  // Unmount the form content whenever the dialog closes so prior add/edit inputs
  // and async autofill state never bleed into the next opened dialog.
  if (!open) return null;

  return (
    <ItemFormModalContent
      key={editingItem ? `edit-${editingItem.id ?? 'item'}` : 'new'}
      onClose={onClose}
      editingItem={editingItem}
      onSaveItem={onSaveItem}
    />
  );
}

function ItemFormModalContent({
  onClose,
  editingItem,
  onSaveItem,
}) {
  const initial = getInitialFormState(editingItem);
  const [prevItem, setPrevItem] = useState(editingItem);
  const [title, setTitle] = useState(initial.title);
  const [url, setUrl] = useState(initial.url);
  const [price, setPrice] = useState(initial.price);
  const [description, setDescription] = useState(initial.description);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [priority, setPriority] = useState(initial.priority);
  const [scraping, setScraping] = useState(false);
  const [scrapeSuccess, setScrapeSuccess] = useState(null);

  const isMountedRef = useRef(true);
  const scrapeTimerRef = useRef(null);
  const scrapeRequestIdRef = useRef(0);
  const lastPastedUrlRef = useRef(null);

  const clearPendingScrapeTimer = () => {
    if (scrapeTimerRef.current) {
      clearTimeout(scrapeTimerRef.current);
      scrapeTimerRef.current = null;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      scrapeRequestIdRef.current += 1;
      clearPendingScrapeTimer();
    };
  }, [editingItem]);

  if (editingItem !== prevItem) {
    const next = getInitialFormState(editingItem);
    setPrevItem(editingItem);
    setTitle(next.title);
    setUrl(next.url);
    setPrice(next.price);
    setDescription(next.description);
    setImageUrl(next.imageUrl);
    setPriority(next.priority);
    setScraping(false);
    setScrapeSuccess(null);
  }

  const handleAutoScrape = async (targetUrl = url) => {
    const clean = targetUrl.trim();
    if (!clean || (!clean.startsWith('http://') && !clean.startsWith('https://'))) return;
    const requestId = ++scrapeRequestIdRef.current;
    setScraping(true);
    setScrapeSuccess(null);
    try {
      const data = await scrapeUrl(clean);
      if (!isMountedRef.current || requestId !== scrapeRequestIdRef.current) return;
      if (data.title) setTitle((prev) => prev || data.title);
      if (data.price !== null && data.price !== undefined) setPrice(data.price.toString());
      if (data.image_url) setImageUrl(data.image_url);
      if (data.description) setDescription((prev) => prev || data.description);
      if (data.clean_url) setUrl(data.clean_url);

      const itemsFound = [];
      if (data.title) itemsFound.push('title');
      if (data.price) itemsFound.push('price');
      if (data.image_url) itemsFound.push('photo');

      if (itemsFound.length > 0) {
        setScrapeSuccess(`Autofilled product ${itemsFound.join(', ')}!`);
      }
    } catch (err) {
      if (isMountedRef.current && requestId === scrapeRequestIdRef.current) {
        console.warn('Scrape failed:', err);
      }
    } finally {
      if (isMountedRef.current && requestId === scrapeRequestIdRef.current) {
        setScraping(false);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSaveItem({
      title: title.trim(),
      url: url.trim() || null,
      price: price ? parseFloat(price) : null,
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      priority: parseInt(priority, 10),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editingItem ? 'Edit Gift Idea' : 'Add Gift Idea'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Product / Store Web Link"
          htmlFor="item-url"
          hint="Paste Amazon, Target, Walmart or any store link to autofill details"
        >
          <div className="flex gap-2">
            <input
              id="item-url"
              type="url"
              value={url}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
                  clearPendingScrapeTimer();
                  lastPastedUrlRef.current = text;
                  setUrl(text);
                  handleAutoScrape(text);
                }
              }}
              onChange={(e) => {
                const nextUrl = e.target.value;
                setUrl(nextUrl);
                clearPendingScrapeTimer();
                if (lastPastedUrlRef.current && lastPastedUrlRef.current === nextUrl) {
                  lastPastedUrlRef.current = null;
                  return;
                }
                lastPastedUrlRef.current = null;
                if (nextUrl.startsWith('http://') || nextUrl.startsWith('https://')) {
                  scrapeTimerRef.current = setTimeout(() => {
                    scrapeTimerRef.current = null;
                    handleAutoScrape(nextUrl);
                  }, 250);
                }
              }}
              placeholder="https://amazon.com/dp/..."
              className="input text-xs font-mono"
            />
            <button
              type="button"
              onClick={() => handleAutoScrape()}
              disabled={scraping || !url.trim()}
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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="29.99"
              className="input"
            />
          </Field>

          <Field label="Priority" htmlFor="item-priority">
            <select
              id="item-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
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
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="input text-xs font-mono"
          />
        </Field>

        <Field label="Notes / Size / Color Preferences" htmlFor="item-desc">
          <textarea
            id="item-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Size Medium, prefers Navy Blue or Forest Green..."
            className="input text-sm"
          />
        </Field>

        <button type="submit" className="btn-primary w-full py-3 text-base font-extrabold">
          {editingItem ? 'Save Changes' : 'Add Item'}
        </button>
      </form>
    </Modal>
  );
}
