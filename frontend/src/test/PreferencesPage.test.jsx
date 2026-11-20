import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PreferencesPage from '../pages/PreferencesPage';
import * as api from '../api';

vi.mock('../api');

const mockFamilyPeople = [
  {
    person_type: 'user',
    person_id: 1,
    name: 'Kelly',
    username: 'kelly',
    is_self: true,
    is_editable: true,
    preferences: {
      categories: {
        coffee_tea_hot_chocolate: 'Medium roast coffee',
        beauty_healthcare: '',
        sweet_treats: 'Dark chocolate',
        alcohol: '',
        snacks_condiments: '',
        candles_scents_diffusers: '',
      },
      notes: 'No nuts please',
      conflicts: [],
      updated_at: '2026-11-19T20:00:00Z',
      filled_count: 2,
      has_preferences: true,
    },
  },
  {
    person_type: 'managed_profile',
    person_id: 10,
    name: 'Maya',
    manager_name: 'Kelly',
    avatar_emoji: '🌟',
    is_self: false,
    is_editable: true,
    preferences: {
      categories: {
        coffee_tea_hot_chocolate: 'Peppermint hot chocolate',
        beauty_healthcare: '',
        sweet_treats: '',
        alcohol: '',
        snacks_condiments: '',
        candles_scents_diffusers: '',
      },
      notes: null,
      updated_at: null,
      filled_count: 1,
      has_preferences: true,
    },
  },
  {
    person_type: 'user',
    person_id: 2,
    name: 'Dave',
    username: 'dave',
    is_self: false,
    is_editable: false,
    preferences: {
      categories: {
        coffee_tea_hot_chocolate: '',
        beauty_healthcare: '',
        sweet_treats: 'Caramel truffles',
        alcohol: 'Bourbon',
        snacks_condiments: 'Smoked almonds',
        candles_scents_diffusers: 'Cedarwood',
      },
      notes: 'Loves spicy snacks',
      updated_at: '2026-11-19T19:00:00Z',
      filled_count: 4,
      has_preferences: true,
    },
  },
];

describe('PreferencesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(api, 'getFamilyPreferences').mockResolvedValue(mockFamilyPeople);
  });

  it('renders all 6 gift preference categories, saves own preferences, and switches to child profile', async () => {
    const updateMySpy = vi.spyOn(api, 'updateMyPreferences').mockResolvedValue({
      ...mockFamilyPeople[0],
      preferences: {
        ...mockFamilyPeople[0].preferences,
        categories: {
          ...mockFamilyPeople[0].preferences.categories,
          candles_scents_diffusers: 'Balsam fir & vanilla',
        },
        filled_count: 3,
      },
    });

    const updateProfileSpy = vi.spyOn(api, 'updateProfilePreferences').mockResolvedValue({
      ...mockFamilyPeople[1],
      preferences: {
        ...mockFamilyPeople[1].preferences,
        categories: {
          ...mockFamilyPeople[1].preferences.categories,
          sweet_treats: 'Gummy bears',
        },
        filled_count: 2,
      },
    });

    render(<PreferencesPage />);

    // Wait for page load and verify all 6 category labels exist
    await waitFor(() => {
      expect(screen.getByLabelText(/Coffee, Tea, Hot chocolate/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Beauty, Healthcare/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sweet Treats/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Alcohol/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Snacks, Condiments/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Candles, Scents, Diffusers/i)).toBeInTheDocument();

    // Verify family member Dave's preferences are displayed
    expect(screen.getByText(/Dave's Gift Preferences/i)).toBeInTheDocument();
    expect(screen.getByText('Bourbon')).toBeInTheDocument();
    expect(screen.getByText('Smoked almonds')).toBeInTheDocument();

    // Update Candles, Scents, Diffusers and save for Kelly
    const candlesInput = screen.getByLabelText(/Candles, Scents, Diffusers/i);
    fireEvent.change(candlesInput, { target: { value: 'Balsam fir & vanilla' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Preferences/i }));

    await waitFor(() => {
      expect(updateMySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          categories: expect.objectContaining({
            coffee_tea_hot_chocolate: 'Medium roast coffee',
            candles_scents_diffusers: 'Balsam fir & vanilla',
          }),
          notes: 'No nuts please',
        })
      );
    });

    // Switch to child profile Maya and save
    fireEvent.click(screen.getByRole('button', { name: /🌟.*Maya/i }));
    expect(screen.getByLabelText(/Coffee, Tea, Hot chocolate/i)).toHaveValue('Peppermint hot chocolate');

    fireEvent.change(screen.getByLabelText(/Sweet Treats/i), { target: { value: 'Gummy bears' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Preferences/i }));

    await waitFor(() => {
      expect(updateProfileSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          categories: expect.objectContaining({
            coffee_tea_hot_chocolate: 'Peppermint hot chocolate',
            sweet_treats: 'Gummy bears',
          }),
        })
      );
    });
  });

  it('allows adding a non-user family member and saving gift conflicts', async () => {
    const withGrandma = [
      ...mockFamilyPeople,
      {
        person_type: 'managed_profile',
        person_id: 22,
        name: 'Grandma',
        manager_name: 'Kelly',
        avatar_emoji: '👵',
        is_self: false,
        is_editable: true,
        preferences: {
          categories: {
            coffee_tea_hot_chocolate: '',
            beauty_healthcare: '',
            sweet_treats: '',
            alcohol: '',
            snacks_condiments: '',
            candles_scents_diffusers: '',
          },
          notes: null,
          conflicts: [],
          updated_at: null,
          filled_count: 0,
          has_preferences: false,
        },
      },
    ];

    vi.spyOn(api, 'getFamilyPreferences')
      .mockResolvedValueOnce(mockFamilyPeople)
      .mockResolvedValueOnce(withGrandma);
    vi.spyOn(api, 'createManagedProfile').mockResolvedValue({
      id: 22,
      name: 'Grandma',
      avatar_emoji: '👵',
    });
    const updateProfileSpy = vi.spyOn(api, 'updateProfilePreferences').mockResolvedValue({
      ...withGrandma[3],
      preferences: {
        ...withGrandma[3].preferences,
        conflicts: ['Dave'],
      },
    });

    render(<PreferencesPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Coffee, Tea, Hot chocolate/i)).toBeInTheDocument();
    });

    // Click Add Person and add Grandma (non-user)
    fireEvent.click(screen.getAllByRole('button', { name: /Add Person/i })[0]);
    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'Grandma' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Family Member/i }));

    await waitFor(() => {
      expect(screen.getByText(/Grandma's Preference Ideas/i)).toBeInTheDocument();
    });

    // Toggle conflict with Dave and save
    fireEvent.click(screen.getByRole('button', { name: /Add gift conflict with Dave/i }));
    expect(screen.getByText(/Grandma -> Dave/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save Preferences/i }));

    await waitFor(() => {
      expect(updateProfileSpy).toHaveBeenCalledWith(
        22,
        expect.objectContaining({
          conflicts: ['Dave'],
        })
      );
    });
  });
});
