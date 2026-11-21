import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ItemFormModal from '../components/list/ItemFormModal';
import ListDetailPage from '../pages/ListDetailPage';
import * as api from '../api';

vi.mock('../api');

function fillItemForm({
  url = '',
  title = '',
  price = '',
  priority = '1',
  imageUrl = '',
  description = '',
}) {
  fireEvent.change(screen.getByLabelText(/Product \/ Store Web Link/i), { target: { value: url } });
  fireEvent.change(screen.getByLabelText(/Item Title/i), { target: { value: title } });
  fireEvent.change(screen.getByLabelText(/Estimated Price/i), { target: { value: price } });
  fireEvent.change(screen.getByLabelText(/Priority/i), { target: { value: priority } });
  fireEvent.change(screen.getByLabelText(/Image URL/i), { target: { value: imageUrl } });
  fireEvent.change(screen.getByLabelText(/Notes \/ Size \/ Color Preferences/i), {
    target: { value: description },
  });
}

function expectBlankForm() {
  expect(screen.getByLabelText(/Product \/ Store Web Link/i)).toHaveValue('');
  expect(screen.getByLabelText(/Item Title/i)).toHaveValue('');
  expect(screen.getByLabelText(/Estimated Price/i)).toHaveValue(null);
  expect(screen.getByLabelText(/Priority/i)).toHaveValue('1');
  expect(screen.getByLabelText(/Image URL/i)).toHaveValue('');
  expect(screen.getByLabelText(/Notes \/ Size \/ Color Preferences/i)).toHaveValue('');
  expect(screen.queryByText(/Autofilled product/i)).not.toBeInTheDocument();
}

describe('ItemFormModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('opens with blank fields when adding a second item after saving the first', () => {
    const onSaveItem = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(true);
      const [editingItem, setEditingItem] = useState(null);

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setOpen(true);
            }}
          >
            Open Add Dialog
          </button>
          <ItemFormModal
            open={open}
            onClose={() => setOpen(false)}
            editingItem={editingItem}
            onSaveItem={(payload) => {
              onSaveItem(payload);
              setOpen(false);
              setEditingItem(null);
            }}
          />
        </div>
      );
    }

    render(<Harness />);

    fillItemForm({
      url: 'https://example.com/socks',
      title: 'Wool Socks',
      price: '18.50',
      priority: '3',
      imageUrl: 'https://example.com/socks.jpg',
      description: 'Size M, forest green',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

    expect(onSaveItem).toHaveBeenCalledWith({
      title: 'Wool Socks',
      url: 'https://example.com/socks',
      price: 18.5,
      description: 'Size M, forest green',
      image_url: 'https://example.com/socks.jpg',
      priority: 3,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Add Dialog' }));

    expect(screen.getByRole('heading', { name: 'Add Gift Idea' })).toBeInTheDocument();
    expectBlankForm();
  });

  it('opens with blank fields after closing an unsubmitted add dialog', () => {
    function Harness() {
      const [open, setOpen] = useState(true);

      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open Add Dialog
          </button>
          <ItemFormModal
            open={open}
            onClose={() => setOpen(false)}
            editingItem={null}
            onSaveItem={vi.fn()}
          />
        </div>
      );
    }

    render(<Harness />);

    fillItemForm({
      url: 'https://example.com/mug',
      title: 'Ceramic Mug',
      price: '24',
      priority: '2',
      imageUrl: 'https://example.com/mug.jpg',
      description: 'Speckled glaze',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Add Dialog' }));

    expectBlankForm();
  });

  it('discards unsaved edits when closed and reopened for the same item', () => {
    const savedItem = {
      id: 42,
      title: 'Board Game',
      url: 'https://example.com/game',
      price: 35,
      description: 'Original edition',
      image_url: 'https://example.com/game.jpg',
      priority: 2,
    };

    function Harness() {
      const [open, setOpen] = useState(true);

      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open Edit Dialog
          </button>
          <ItemFormModal
            open={open}
            onClose={() => setOpen(false)}
            editingItem={savedItem}
            onSaveItem={vi.fn()}
          />
        </div>
      );
    }

    render(<Harness />);

    const titleInput = screen.getByLabelText(/Item Title/i);
    expect(titleInput).toHaveValue('Board Game');

    fireEvent.change(titleInput, { target: { value: 'Temporary Unsaved Title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Edit Dialog' }));

    expect(screen.getByLabelText(/Item Title/i)).toHaveValue('Board Game');
    expect(screen.getByLabelText(/Priority/i)).toHaveValue('2');
  });

  it('clears autofill state and ignores stale in-flight scrape results after reopening blank', async () => {
    let resolveScrape;
    const deferredScrape = new Promise((resolve) => {
      resolveScrape = resolve;
    });
    vi.spyOn(api, 'scrapeUrl').mockReturnValueOnce(deferredScrape);

    function Harness() {
      const [open, setOpen] = useState(true);

      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open Add Dialog
          </button>
          <ItemFormModal
            open={open}
            onClose={() => setOpen(false)}
            editingItem={null}
            onSaveItem={vi.fn()}
          />
        </div>
      );
    }

    render(<Harness />);

    fireEvent.change(screen.getByLabelText(/Product \/ Store Web Link/i), {
      target: { value: 'https://example.com/slow-product' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Autofill' }));

    expect(screen.getByText(/Fetching product title, photo & price/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Add Dialog' }));

    expectBlankForm();

    resolveScrape({
      title: 'Stale Scraped Product',
      price: 99.99,
      image_url: 'https://example.com/stale.jpg',
      description: 'Should not appear',
      clean_url: 'https://example.com/clean-stale',
    });

    await waitFor(() => {
      expectBlankForm();
    });
  });

  it('clears previous autofill banner after saving and opening a new item dialog', async () => {
    vi.spyOn(api, 'scrapeUrl').mockResolvedValueOnce({
      title: 'Espresso Kettle',
      price: 75,
      image_url: 'https://example.com/kettle.jpg',
      description: 'Matte black',
      clean_url: 'https://example.com/kettle',
    });

    function Harness() {
      const [open, setOpen] = useState(true);

      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open Add Dialog
          </button>
          <ItemFormModal
            open={open}
            onClose={() => setOpen(false)}
            editingItem={null}
            onSaveItem={() => setOpen(false)}
          />
        </div>
      );
    }

    render(<Harness />);

    fireEvent.change(screen.getByLabelText(/Product \/ Store Web Link/i), {
      target: { value: 'https://example.com/kettle?ref=123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Autofill' }));

    await waitFor(() => {
      expect(screen.getByText(/Autofilled product title, price, photo!/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Add Dialog' }));

    expectBlankForm();
  });
});

describe('ListDetailPage adding sequential items', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('presents a blank dialog when clicking Add Gift right after adding an item', async () => {
    vi.spyOn(api, 'getWishlist').mockResolvedValue({
      id: 7,
      title: 'Holiday List',
      occasion: 'Christmas',
      is_owner: true,
      owner_name: 'Alex',
      items: [],
    });

    vi.spyOn(api, 'addItem')
      .mockResolvedValueOnce({
        id: 101,
        wishlist_id: 7,
        title: 'Wool Scarf',
        url: 'https://example.com/scarf',
        price: 42,
        description: 'Navy blue',
        image_url: 'https://example.com/scarf.jpg',
        priority: 3,
      })
      .mockResolvedValueOnce({
        id: 102,
        wishlist_id: 7,
        title: 'Reading Lamp',
        url: null,
        price: null,
        description: null,
        image_url: null,
        priority: 1,
      });

    render(<ListDetailPage wishlistId={7} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Holiday List' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Add First Gift/i }));

    fillItemForm({
      url: 'https://example.com/scarf',
      title: 'Wool Scarf',
      price: '42',
      priority: '3',
      imageUrl: 'https://example.com/scarf.jpg',
      description: 'Navy blue',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

    await waitFor(() => {
      expect(screen.getByText('Wool Scarf')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Add Gift/i }));

    expect(screen.getByRole('heading', { name: 'Add Gift Idea' })).toBeInTheDocument();
    expectBlankForm();

    fireEvent.change(screen.getByLabelText(/Item Title/i), {
      target: { value: 'Reading Lamp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

    await waitFor(() => {
      expect(screen.getByText('Reading Lamp')).toBeInTheDocument();
    });

    expect(api.addItem).toHaveBeenNthCalledWith(2, 7, {
      title: 'Reading Lamp',
      url: null,
      price: null,
      description: null,
      image_url: null,
      priority: 1,
    });
  });
});
