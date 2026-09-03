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
/**
 * Note there is no "Default Browser" entry here any more. It used to target
 * `about:blank`, which could never work — `about:` is an internal browser
 * scheme with no Windows protocol handler, so the OS answered with "You'll
 * need a new app to open this about link" instead of launching anything.
 * Browsers are now detected for real and listed separately by the form
 * (`electron/win-browsers.ts`), which also lets the user pick *which* one.
 */
export const APP_LAUNCH_PRESETS: readonly AppLaunchPreset[] = [
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
