/**
 * Detects the web browsers actually installed on this machine.
 *
 * Replaces the old "Default Browser" quick-pick, which was a `kind: 'uri'`
 * action targeting `about:blank`. That never worked and could not have:
 * `about:` is an internal browser scheme with no Windows protocol handler
 * registered against it, so `shell.openExternal('about:blank')` hands the OS
 * something it has no application for and Windows answers with "You'll need a
 * new app to open this about link". It also was not "launch a browser" in the
 * first place — at best it would have opened a blank tab in whatever was
 * already default, with no way to choose.
 *
 * Enumerating real installs instead gives the user an actual choice, and a
 * `kind: 'path'` action pointing at a real `.exe` — which launches the
 * browser normally (its own homepage/new tab), works whether or not it is the
 * default, and needs no protocol registration at all.
 *
 * `Clients\StartMenuInternet` is the registry location Windows itself has
 * used for "the browsers on this machine" since XP, and is what the Settings
 * app's own default-apps list reads. All three hives are checked because a
 * browser may be installed per-machine (HKLM), per-machine as 32-bit on a
 * 64-bit OS (WOW6432Node), or per-user (HKCU — how Chrome and Edge install by
 * default nowadays).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface InstalledBrowser {
  /** The registry subkey name, e.g. `chrome.exe` — stable enough to use as a React key. */
  id: string;
  /** Display name as Windows knows it, e.g. `Google Chrome`. */
  name: string;
  /** Absolute path to the executable. */
  path: string;
  /** True for the browser currently handling `https` links. */
  isDefault: boolean;
}

const ROOTS = [
  'HKLM\\SOFTWARE\\Clients\\StartMenuInternet',
  'HKLM\\SOFTWARE\\WOW6432Node\\Clients\\StartMenuInternet',
  'HKCU\\SOFTWARE\\Clients\\StartMenuInternet',
];

/** `reg query` exits non-zero for a key that simply isn't there, which is normal here, not an error. */
async function regQuery(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', ...args], {
      windowsHide: true,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Pulls the `(Default)` value out of `reg query … /ve` output. */
function defaultValue(stdout: string | null): string | null {
  if (!stdout) return null;
  const match = /^\s+\(Default\)\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)$/m.exec(stdout);
  return match?.[1]?.trim() || null;
}

/**
 * A registered `shell\open\command` is a full command line, not a bare path —
 * typically `"C:\…\chrome.exe" -- "%1"`. The quoted form is the common one and
 * is unambiguous; the unquoted fallback stops at `.exe` rather than at the
 * first space, since `C:\Program Files\…` would otherwise be truncated.
 */
function executableFromCommand(command: string | null): string | null {
  if (!command) return null;
  const trimmed = command.trim();

  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    return end > 1 ? trimmed.slice(1, end) : null;
  }

  const match = /^(.*?\.exe)/i.exec(trimmed);
  return match?.[1] ?? null;
}

async function commandForKey(key: string): Promise<string | null> {
  return executableFromCommand(defaultValue(await regQuery([`${key}\\shell\\open\\command`, '/ve'])));
}

/**
 * The default browser's executable, resolved through the user's `https`
 * association rather than by name — matching on ProgId strings
 * (`ChromeHTML`, `MSEdgeHTM`, `FirefoxURL-…`) would need a hardcoded table
 * that goes stale, whereas the ProgId's own registered command is exact.
 */
async function defaultBrowserExecutable(): Promise<string | null> {
  const userChoice = await regQuery([
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice',
    '/v',
    'ProgId',
  ]);
  if (!userChoice) return null;

  const progId = /^\s+ProgId\s+REG_SZ\s+(.*)$/m.exec(userChoice)?.[1]?.trim();
  if (!progId) return null;

  return commandForKey(`HKCR\\${progId}`);
}

/** Resolves to an empty list on anything but Windows, and on a machine where nothing is registered. */
export async function listInstalledBrowsers(): Promise<InstalledBrowser[]> {
  if (process.platform !== 'win32') return [];

  const defaultExe = (await defaultBrowserExecutable())?.toLowerCase() ?? null;

  // Keyed by executable path so the same browser registered in more than one
  // hive (very common — Chrome writes both HKLM and HKCU) appears once.
  const found = new Map<string, InstalledBrowser>();

  for (const root of ROOTS) {
    const listing = await regQuery([root]);
    if (!listing) continue;

    // `reg query` echoes the queried key itself as the first `HKEY_` line,
    // followed by its values, then its subkeys. The root line has to be
    // dropped by comparing against that *expanded* name (`HKEY_LOCAL_MACHINE\…`)
    // rather than the abbreviated one passed in (`HKLM\…`) — they differ in
    // length, so any "is it longer than the root?" test wrongly keeps it and
    // would list the container key as if it were a browser.
    const keyLines = listing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.toUpperCase().startsWith('HKEY_'));

    const expandedRoot = keyLines[0];
    if (!expandedRoot) continue;

    const subKeys = keyLines
      .slice(1)
      .filter((line) => line.toLowerCase().startsWith(`${expandedRoot.toLowerCase()}\\`));

    for (const key of subKeys) {
      const id = key.split('\\').pop() ?? key;
      const path = await commandForKey(key);
      if (!path) continue;

      const lower = path.toLowerCase();
      if (found.has(lower)) continue;

      found.set(lower, {
        id,
        name: defaultValue(await regQuery([key, '/ve'])) ?? id,
        path,
        isDefault: defaultExe === lower,
      });
    }
  }

  // Default first, then alphabetical — the one the user wants is almost
  // always the one they already chose as default.
  return [...found.values()].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
