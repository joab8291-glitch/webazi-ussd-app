/**
 * Webazi brand theme — light & dark
 */

import { Platform } from 'react-native';

const brandGreen = '#00A86B';
const brandDark = '#0B1F17';
const brandLight = '#F0FDF6';
const accent = '#FFB020';

export const Colors = {
  light: {
    text: '#0B1F17',
    textSecondary: '#5A6B63',
    background: '#F7FAF8',
    surface: '#FFFFFF',
    surfaceAlt: '#E8F5EE',
    tint: brandGreen,
    accent,
    icon: '#5A6B63',
    tabIconDefault: '#8A9A92',
    tabIconSelected: brandGreen,
    success: '#00A86B',
    warning: '#FFB020',
    error: '#E5484D',
    border: '#D8E5DE',
    muted: '#9AABA3',
  },
  dark: {
    text: '#E8F5EE',
    textSecondary: '#9AABA3',
    background: brandDark,
    surface: '#12261D',
    surfaceAlt: '#1A3228',
    tint: '#2DD4A0',
    accent,
    icon: '#9AABA3',
    tabIconDefault: '#6B7C74',
    tabIconSelected: '#2DD4A0',
    success: '#2DD4A0',
    warning: '#FFB020',
    error: '#FF6B6B',
    border: '#1F3A2E',
    muted: '#6B7C74',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
