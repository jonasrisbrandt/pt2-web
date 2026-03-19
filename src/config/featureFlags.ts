const featureFlagDefaults = {
  sample_composer: false,
} as const;

export type FeatureFlagName = keyof typeof featureFlagDefaults;

const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes']);
const FALSE_VALUES = new Set(['0', 'false', 'off', 'no']);

const parseFeatureFlagOverrides = (): Partial<Record<FeatureFlagName, boolean>> => {
  if (typeof window === 'undefined') {
    return {};
  }

  const params = new URLSearchParams(window.location.search);
  const overrides: Partial<Record<FeatureFlagName, boolean>> = {};

  for (const key of Object.keys(featureFlagDefaults) as FeatureFlagName[]) {
    const raw = params.get(key) ?? params.get(`ff_${key}`) ?? params.get(`feature_${key}`);
    if (!raw) {
      continue;
    }

    const normalized = raw.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) {
      overrides[key] = true;
    } else if (FALSE_VALUES.has(normalized)) {
      overrides[key] = false;
    }
  }

  return overrides;
};

export const featureFlags: Readonly<Record<FeatureFlagName, boolean>> = {
  ...featureFlagDefaults,
  ...parseFeatureFlagOverrides(),
};
