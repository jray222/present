import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SharedGuestPage from '../pages/SharedGuestPage';
import * as api from '../api';

vi.mock('../api');

describe('SharedGuestPage (Grandparent Mode)', () => {
  it('renders wishlist title and unclaimed items for guests', async () => {
    vi.spyOn(api, 'getSharedWishlist').mockResolvedValue({
      id: 99,
      title: 'Holiday Registry',
      owner_name: 'Tommy',
      items: [
        {
          id: 101,
          title: 'Remote Control Car',
          price: 29.99,
          is_claimed: false,
          claims: [],
        },
      ],
    });

    render(<SharedGuestPage token="grandparent-token" />);

    await waitFor(() => {
      expect(screen.getByText(/Tommy's Wishlist/i)).toBeInTheDocument();
      expect(screen.getByText('Remote Control Car')).toBeInTheDocument();
    });

    // Tap "I Bought This" button should be available for grandparent
    expect(screen.getByRole('button', { name: /I Bought This/i })).toBeInTheDocument();
  });
});
