import React, { useState, useEffect } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ShareModal from '../components/ShareModal';

describe('ShareModal Component', () => {
  const dummyWishlist = {
    id: 1,
    title: 'Christmas Wishlist',
    occasion: 'Christmas',
    items: [
      { id: 101, title: 'Lego Set', price: 49.99 },
      { id: 102, title: 'Book', price: 15.00 },
    ],
  };

  function ParentWithRerender() {
    const [_count, setCount] = useState(0);
    useEffect(() => {
      setCount(1);
    }, []);

    return (
      <ShareModal
        open={true}
        onClose={() => {}}
        wishlist={dummyWishlist}
        shareUrl="http://localhost:5732/shared/abc"
      />
    );
  }

  it('renders without infinite re-render loop when parent updates without preSelectedIds prop', () => {
    render(<ParentWithRerender />);
    expect(screen.getByRole('heading', { name: 'Share Wishlist' })).toBeInTheDocument();
  });
});
