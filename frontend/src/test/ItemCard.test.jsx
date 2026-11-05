import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ItemCard from '../components/ItemCard';

describe('ItemCard Component', () => {
  const baseItem = {
    id: 1,
    title: 'Wireless Headphones',
    price: 99.99,
    url: 'https://example.com/headphones',
    image_url: 'https://example.com/img.jpg',
    priority: 3,
    is_claimed: false,
    claims: [],
  };

  it('renders item title and formatted price', () => {
    render(<ItemCard item={baseItem} isOwner={true} />);
    expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
    expect(screen.getByText('$99.99')).toBeInTheDocument();
  });

  it('locks out store link when item is claimed by someone else', () => {
    const claimedItem = {
      ...baseItem,
      is_claimed: true,
      claim_status: 'reserved',
      claims: [{ id: 10, claimed_by_name: 'Aunt May', is_own_claim: false }],
    };

    render(<ItemCard item={claimedItem} isOwner={false} />);
    // Should display reserved badge with buyer name
    expect(screen.getByText(/Reserved by Aunt May/i)).toBeInTheDocument();
    // External store link must be locked out
    expect(screen.queryByText(/View Store/i)).not.toBeInTheDocument();
  });

  it('renders purchase reminder and bought button when reservation is 7+ days old', () => {
    const staleReservedItem = {
      ...baseItem,
      is_claimed: true,
      claim_status: 'reserved',
      claims: [
        {
          id: 11,
          claimed_by_name: 'You',
          is_own_claim: true,
          status: 'reserved',
          needs_purchase_reminder: true,
        },
      ],
    };

    render(<ItemCard item={staleReservedItem} isOwner={false} />);
    expect(screen.getByText(/Reserved 7\+ days ago/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bought it\?/i })).toBeInTheDocument();
  });
});
