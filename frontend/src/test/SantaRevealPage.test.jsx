import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SantaRevealPage from '../pages/SantaRevealPage';
import * as api from '../api';

vi.mock('../api');

describe('SantaRevealPage Component', () => {
  it('loads draw and reveals recipient match on button tap', async () => {
    vi.spyOn(api, 'revealSecretSanta').mockResolvedValue({
      title: 'Family Christmas 2026',
      giver_name: 'John',
      receiver_name: 'Sarah',
      budget_limit: 50.0,
      exchange_date: '2026-12-25',
      rules_notes: 'Homemade or funny gifts encouraged!',
    });

    render(<SantaRevealPage token="mock-envelope-token" />);

    // Wait for initial greeting
    await waitFor(() => {
      expect(screen.getByText(/Hello,/i)).toBeInTheDocument();
      expect(screen.getByText('John')).toBeInTheDocument();
    });

    // Before revealing, Sarah is hidden
    expect(screen.queryByText('Sarah')).not.toBeInTheDocument();

    // Click reveal
    const revealBtn = screen.getByRole('button', { name: /Reveal My Match/i });
    fireEvent.click(revealBtn);

    // After clicking reveal, receiver is displayed
    expect(screen.getByText('Sarah')).toBeInTheDocument();
  });

  it('reveals receiver gift preferences only after tapping reveal', async () => {
    vi.spyOn(api, 'revealSecretSanta').mockResolvedValue({
      title: 'Christmas Consumables Exchange',
      giver_name: 'Kelly',
      receiver_name: 'Dave',
      budget_limit: 100.0,
      exchange_date: 'Dec 25',
      rules_notes: 'Consumables only!',
      receiver_preferences: {
        categories: {
          coffee_tea_hot_chocolate: 'French roast',
          alcohol: 'Pinot Noir',
        },
        notes: 'No peanuts',
        filled_count: 2,
        has_preferences: true,
      },
    });

    render(<SantaRevealPage token="consumables-token" />);

    await waitFor(() => {
      expect(screen.getByText('Kelly')).toBeInTheDocument();
    });

    // Preferences must stay hidden before reveal
    expect(screen.queryByText('French roast')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Reveal My Match/i }));

    expect(screen.getByText('Dave')).toBeInTheDocument();
    expect(screen.getByText(/Dave's Gift Preferences/i)).toBeInTheDocument();
    expect(screen.getByText('French roast')).toBeInTheDocument();
    expect(screen.getByText('Pinot Noir')).toBeInTheDocument();
    expect(screen.getByText('No peanuts')).toBeInTheDocument();
  });
});
