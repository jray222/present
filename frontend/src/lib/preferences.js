export const GIFT_PREFERENCE_CATEGORIES = [
  {
    key: 'coffee_tea_hot_chocolate',
    label: 'Coffee, Tea, Hot chocolate',
    icon: '☕',
    placeholder: 'Favorite roasts, tea blends, hot cocoa flavors, decaf, creamers...',
  },
  {
    key: 'beauty_healthcare',
    label: 'Beauty, Healthcare',
    icon: '🧴',
    placeholder: 'Hand lotions, skincare, bath salts, lip balm, unscented, etc.',
  },
  {
    key: 'sweet_treats',
    label: 'Sweet Treats',
    icon: '🍫',
    placeholder: 'Dark or milk chocolate, cookies, candy, caramel, dietary notes...',
  },
  {
    key: 'alcohol',
    label: 'Alcohol',
    icon: '🍷',
    placeholder: "Favorite wine varietals, spirits, craft beer, mixers, or 'None'",
  },
  {
    key: 'snacks_condiments',
    label: 'Snacks, Condiments',
    icon: '🥨',
    placeholder: 'Chips, nuts, jerky, hot sauce, olive oil, jams, spices...',
  },
  {
    key: 'candles_scents_diffusers',
    label: 'Candles, Scents, Diffusers',
    icon: '🕯️',
    placeholder: "Pine, vanilla, citrus, cedarwood, essential oils, or 'Unscented'",
  },
];

export function hasAnyPreferences(preferences) {
  if (!preferences) return false;
  if (preferences.has_preferences) return true;
  const cats = preferences.categories || {};
  const hasCat = GIFT_PREFERENCE_CATEGORIES.some((c) => Boolean(cats[c.key]?.trim()));
  return hasCat || Boolean(preferences.notes?.trim());
}

export function countFilledCategories(preferences) {
  if (!preferences) return 0;
  const cats = preferences.categories || {};
  return GIFT_PREFERENCE_CATEGORIES.filter((c) => Boolean(cats[c.key]?.trim())).length;
}

export function formatPreferencesAsText(personName, preferences) {
  const cats = preferences?.categories || {};
  const lines = [`🎁 ${personName}'s Gift Preferences`, ''];

  let any = false;
  GIFT_PREFERENCE_CATEGORIES.forEach((cat) => {
    const val = cats[cat.key]?.trim();
    if (val) {
      any = true;
      lines.push(`${cat.icon} ${cat.label}: ${val}`);
    }
  });

  if (preferences?.notes?.trim()) {
    any = true;
    lines.push('');
    lines.push(`📝 Other Notes / Allergies: ${preferences.notes.trim()}`);
  }

  if (!any) {
    lines.push('(No gift preferences filled out yet)');
  }

  return lines.join('\n');
}
