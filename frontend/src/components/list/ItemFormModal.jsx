import React, { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import Modal, { Field } from '../Modal';
import { scrapeUrl } from '../../api';

export default function ItemFormModal({
  open,
  onClose,
  editingItem,
  onSaveItem,
}) {
  const [prevItem, setPrevItem] = useState(editingItem);
  const [title, setTitle] = useState(editingItem?.title || '');
  const [url, setUrl] = useState(editingItem?.url || '');
  const [price, setPrice] = useState(editingItem?.price ? editingItem.price.toString() : '');
  const [description, setDescription] = useState(editingItem?.description || '');
  const [imageUrl, setImageUrl] = useState(editingItem?.image_url || '');
  const [priority, setPriority] = useState(editingItem?.priority || 1);
  const [scraping, setScraping] = useState(false);
  const [scrapeSuccess, setScrapeSuccess] = useState(null);

  if (editingItem !== prevItem) {
    setPrevItem(editingItem);
    setTitle(editingItem?.title || '');
    setUrl(editingItem?.url || '');
    setPrice(editingItem?.price ? editingItem.price.toString() : '');
    setDescription(editingItem?.description || '');
    setImageUrl(editingItem?.image_url || '');
    setPriority(editingItem?.priority || 1);
    setScrapeSuccess(null);
  }

  const handleAutoScrape = async (targetUrl = url) => {
    const clean = targetUrl.trim();
    if (!clean || (!clean.startsWith('http://') && !clean.startsWith('https://'))) return;
    setScraping(true);
    setScrapeSuccess(null);
    try {
      const data = await scrapeUrl(clean);
      if (data.title && !title) setTitle(data.title);
      if (data.price !== null && data.price !== undefined) setPrice(data.price.toString());
      if (data.image_url) setImageUrl(data.image_url);
      if (data.description && !description) setDescription(data.description);
      if (data.clean_url) setUrl(data.clean_url);

      const itemsFound = [];
      if (data.title) itemsFound.push('title');
      if (data.price) itemsFound.push('price');
      if (data.image_url) itemsFound.push('photo');

      if (itemsFound.length > 0) {
        setScrapeSuccess(`Autofilled product ${itemsFound.join(', ')}!`);
      }
    } catch (err) {
      console.warn('Scrape failed:', err);
    } finally {
      setScraping(false);
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
      open={open}
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
                  setUrl(text);
                  handleAutoScrape(text);
                }
              }}
              onChange={(e) => {
                setUrl(e.target.value);
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
