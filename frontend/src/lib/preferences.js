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

export function buildExclusionsFromPeople(people, selectedNames) {
  const exclusions = {};
  if (!Array.isArray(people) || !Array.isArray(selectedNames) || selectedNames.length === 0) {
    return exclusions;
  }

  const canonicalByLower = new Map();
  selectedNames.forEach((raw) => {
    const trimmed = String(raw || '').trim();
    if (trimmed) canonicalByLower.set(trimmed.toLowerCase(), trimmed);
  });

  people.forEach((person) => {
    const giverCanonical = canonicalByLower.get(String(person?.name || '').trim().toLowerCase());
    if (!giverCanonical) return;
    const conflicts = person?.preferences?.conflicts || [];
    conflicts.forEach((targetRaw) => {
      const targetCanonical = canonicalByLower.get(String(targetRaw || '').trim().toLowerCase());
      if (!targetCanonical || targetCanonical.toLowerCase() === giverCanonical.toLowerCase()) return;
      if (!exclusions[giverCanonical]) exclusions[giverCanonical] = [];
      if (!exclusions[giverCanonical].includes(targetCanonical)) {
        exclusions[giverCanonical].push(targetCanonical);
      }
    });
  });

  return exclusions;
}

export function findDrawConflictWarnings(draw, people) {
  const violated = [];
  const missingRules = [];
  if (!draw || !Array.isArray(people) || people.length === 0) {
    return { violated, missingRules };
  }

  const participants =
    draw.participants && draw.participants.length > 0
      ? draw.participants
      : (draw.pairs || []).map((p) => p.giver_name);
  const savedExclusions = buildExclusionsFromPeople(people, participants);
  const drawExclusions = draw.exclusions || {};

  const hasDrawExclusion = (giver, target) => {
    const targetLower = target.toLowerCase();
    for (const [k, vals] of Object.entries(drawExclusions)) {
      if (k.toLowerCase() === giver.toLowerCase() && Array.isArray(vals)) {
        if (vals.some((v) => String(v).toLowerCase() === targetLower)) return true;
      }
    }
    return false;
  };

  Object.entries(savedExclusions).forEach(([giver, targets]) => {
    targets.forEach((target) => {
      if (!hasDrawExclusion(giver, target)) {
        missingRules.push(`${giver} -> ${target}`);
      }
    });
  });

  (draw.pairs || []).forEach((pair) => {
    const giverLower = String(pair.giver_name || '').trim().toLowerCase();
    const recvLower = String(pair.receiver_name || '').trim().toLowerCase();
    for (const [giver, targets] of Object.entries(savedExclusions)) {
      if (
        giver.toLowerCase() === giverLower &&
        targets.some((t) => t.toLowerCase() === recvLower)
      ) {
        violated.push(`${pair.giver_name} -> ${pair.receiver_name}`);
      }
    }
  });

  return { violated, missingRules };
}

