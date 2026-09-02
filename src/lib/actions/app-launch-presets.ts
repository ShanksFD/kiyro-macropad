import type { Action } from './types';

export interface AppLaunchPreset {
  id: string;
  label: string;
  action: Extract<Action, { type: 'application' }>;
}

/**
 * Built-in quick-picks for the "Application" action form
 * (`src/features/editor/action-forms.tsx`) — one click fills in a working
 * `label`/`target`/`kind`, still fully editable afterwards. **To add
 * another app, add another entry here** — nothing else needs to change,
 * this list is the only thing the picker renders.
 *
 * `kind: 'uri'` entries go through `shell.openExternal` (a URL or a
 * registered custom protocol — the app doesn't need to be installed at any
 * particular path, just registered with Windows); `kind: 'path'` needs an
 * exact file path, which is why the form's "Browse…" button (a native file
 * picker, see `use-kiyro-bridge`'s `window.browseForApplication`) is the
 * reliable way to add one precisely rather than guessing an install
 * location — every machine's is different.
 */
export const APP_LAUNCH_PRESETS: readonly AppLaunchPreset[] = [
  {
    id: 'default-browser',
    label: 'Default Browser',
    action: { type: 'application', label: 'Default Browser', target: 'about:blank', kind: 'uri' },
  },
  {
    id: 'discord',
    label: 'Discord',
    action: { type: 'application', label: 'Discord', target: 'discord://', kind: 'uri' },
  },
  {
    id: 'vscode',
    label: 'VS Code',
    action: { type: 'application', label: 'VS Code', target: 'vscode://', kind: 'uri' },
  },
  {
    id: 'claude',
    label: 'Claude',
    action: { type: 'application', label: 'Claude', target: 'https://claude.ai', kind: 'uri' },
  },
];
