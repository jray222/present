import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SecretSantaPage from '../pages/SecretSantaPage';
import * as api from '../api';

vi.mock('../api');

describe('SecretSantaPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays existing draw names and links and allows editing and re-running', async () => {
    const initialDraw = {
      id: 1,
      group_id: 1,
      title: 'Miller Family 2026',
      budget_limit: 50,
      exchange_date: 'Dec 25',
      is_active: true,
      pairs_count: 3,
      participants: ['Mom', 'Dad', 'Sarah'],
      exclusions: { Mom: ['Dad'], Dad: ['Mom'] },
      pairs: [
        {
          id: 101,
          giver_name: 'Mom',
          receiver_name: 'Sarah',
          view_token: 'tok-mom',
          view_url: 'https://wishlist.example.com/santa/view/tok-mom',
        },
        {
          id: 102,
          giver_name: 'Dad',
          receiver_name: 'Mom',
          view_token: 'tok-dad',
          view_url: 'https://wishlist.example.com/santa/view/tok-dad',
        },
        {
          id: 103,
          giver_name: 'Sarah',
          receiver_name: 'Dad',
          view_token: 'tok-sarah',
          view_url: 'https://wishlist.example.com/santa/view/tok-sarah',
        },
      ],
    };

    const updatedDraw = {
      ...initialDraw,
      title: 'Miller Family 2026 Updated',
      budget_limit: 75,
      participants: ['Mom', 'Dad', 'Sarah', 'John'],
      exclusions: { Mom: ['Dad'], Dad: ['Mom'] },
      pairs_count: 4,
      pairs: [
        {
          id: 201,
          giver_name: 'Mom',
          receiver_name: 'John',
          view_token: 'tok-mom-2',
          view_url: 'https://wishlist.example.com/santa/view/tok-mom-2',
        },
        {
          id: 202,
          giver_name: 'Dad',
          receiver_name: 'Sarah',
          view_token: 'tok-dad-2',
          view_url: 'https://wishlist.example.com/santa/view/tok-dad-2',
        },
        {
          id: 203,
          giver_name: 'Sarah',
          receiver_name: 'Mom',
          view_token: 'tok-sarah-2',
          view_url: 'https://wishlist.example.com/santa/view/tok-sarah-2',
        },
        {
          id: 204,
          giver_name: 'John',
          receiver_name: 'Dad',
          view_token: 'tok-john-2',
          view_url: 'https://wishlist.example.com/santa/view/tok-john-2',
        },
      ],
    };

    vi.spyOn(api, 'getSecretSantaDraws')
      .mockResolvedValueOnce([initialDraw])
      .mockResolvedValueOnce([updatedDraw]);

    vi.spyOn(api, 'updateSecretSantaDraw').mockResolvedValueOnce(updatedDraw);

    render(<SecretSantaPage />);

    // Wait for existing draw to render with names and links
    await waitFor(() => {
      expect(screen.getByText('Miller Family 2026')).toBeInTheDocument();
    });

    // Both giver names, matched receiver names, and links are visible
    expect(screen.getByText('https://wishlist.example.com/santa/view/tok-mom')).toBeInTheDocument();
    expect(screen.getByText(/🎁 Sarah/)).toBeInTheDocument();

    // Click Edit & Re-run
    const editBtn = screen.getByRole('button', { name: /Edit & Re-run/i });
    fireEvent.click(editBtn);

    // Verify modal opens with pre-populated values
    const titleInput = screen.getByLabelText(/Exchange Title/i);
    expect(titleInput).toHaveValue('Miller Family 2026');

    const participantsInput = screen.getByLabelText(/Participants/i);
    expect(participantsInput).toHaveValue('Mom\nDad\nSarah');

    const exclusionsInput = screen.getByLabelText(/Exclusions/i);
    expect(exclusionsInput).toHaveValue('Mom -> Dad\nDad -> Mom');

    // Update fields and submit to re-run
    fireEvent.change(titleInput, { target: { value: 'Miller Family 2026 Updated' } });
    fireEvent.change(participantsInput, { target: { value: 'Mom\nDad\nSarah\nJohn' } });

    const submitBtn = screen.getByRole('button', { name: /Save & Re-run Secret Santa Draw/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.updateSecretSantaDraw).toHaveBeenCalledWith(1, {
        title: 'Miller Family 2026 Updated',
        budget_limit: 50,
        exchange_date: 'Dec 25',
        participants: ['Mom', 'Dad', 'Sarah', 'John'],
        exclusions: { Mom: ['Dad'], Dad: ['Mom'] },
      });
    });

    // Results modal opens showing updated names with links
    await waitFor(() => {
      expect(screen.getAllByText('https://wishlist.example.com/santa/view/tok-mom-2').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/🎁 John/).length).toBeGreaterThan(0);
    });
  });
});
