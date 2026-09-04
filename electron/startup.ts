/**
 * "Start Kiyro when I sign in" — the login item, and the one place that
 * decides what Windows actually does at boot.
 *
 * WHY THE OS IS THE SOURCE OF TRUTH
 * ---------------------------------
 * This deliberately stores nothing in `preferences.json`. On Windows,
 * `setLoginItemSettings` writes a value under
 * `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, which is exactly what
 * Task Manager's "Startup apps" tab lists — so the user has a second switch
 * for this that Kiyro never sees being flipped. A mirrored preference would
 * drift out of sync the first time anyone used it, and the app would insist
 * it starts at login while Windows quietly refuses to launch it. Reading the
 * registry back on every query is the only way the toggle can tell the truth.
 *
 * Disabling in Task Manager does NOT delete the Run entry: Windows records
 * the veto separately, under
 * `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`.
 * That's why `openAtLogin` alone is not the answer to "will this actually
 * start?" — it stays `true` for an entry Task Manager has switched off.
 * `executableWillLaunchAtLogin` is the flag that accounts for the veto, and
 * the gap between the two is reported as `blockedBySystem` below so the UI
 * can say so rather than showing a toggle that lies.
 */

import { app } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { log } from './observability';

/**
 * Registry value name under `Run`. Pinned rather than left to default (the
 * AppUserModelId, `com.kiyro.macropad`) because this string is what the user
 * reads in Task Manager's Startup tab — "Kiyro" is recognisable there in a
 * way a reverse-DNS id is not.
 */
const LOGIN_ITEM_NAME = 'Kiyro';

/**
 * Tells the launched instance to stay in the tray instead of opening a
 * window — `main.ts`'s `START_HIDDEN`. Someone signing in does not want an
 * app window taking focus; the macro pad just needs to start working.
 */
const HIDDEN_ARG = '--hidden';

export interface StartupStatus {
  /** `false` in dev builds and on platforms without a login item — the UI hides the control entirely rather than offering a switch that does nothing. */
  supported: boolean;
  /** Whether Kiyro is registered to start at login at all. */
  enabled: boolean;
  /**
   * Windows only: registered, but switched off in Task Manager / Settings →
   * Startup apps. Kiyro will not actually launch. Deliberately surfaced
   * rather than silently corrected — the user's choice there outranks this
   * app's own toggle, and quietly re-enabling it would be a fight the user
   * didn't ask for.
   */
  blockedBySystem: boolean;
}

/**
 * A login item registered against `electron.exe` in a dev tree would survive
 * long after that checkout was gone, and would launch a stock Electron shell
 * pointing at nothing. Only a packaged build has a real, stable
 * `process.execPath` worth writing into the registry.
 */
function isSupported(): boolean {
  return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');
}

export function getStartupStatus(): StartupStatus {
  if (!isSupported()) return { supported: false, enabled: false, blockedBySystem: false };

  try {
    const settings = app.getLoginItemSettings();

    if (process.platform !== 'win32') {
      return { supported: true, enabled: settings.openAtLogin, blockedBySystem: false };
    }

    return {
      supported: true,
      enabled: settings.openAtLogin,
      blockedBySystem: settings.openAtLogin && !settings.executableWillLaunchAtLogin,
    };
  } catch (error) {
    // Reading the registry should not be able to take the app down with it.
    log.error('[kiyro] could not read login item settings:', error);
    return { supported: false, enabled: false, blockedBySystem: false };
  }
}

export function setStartupEnabled(enabled: boolean): StartupStatus {
  if (!isSupported()) return getStartupStatus();

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      name: LOGIN_ITEM_NAME,
      // Explicit rather than implicit: the default is the running binary
      // anyway, but writing it means the value in the registry is always a
      // path this build verified, which is what `reconcileStartupPath()`
      // below compares against after an update.
      path: process.execPath,
      args: [HIDDEN_ARG],
      // Clears a Task Manager veto when switching on. This is the one place
      // overriding it is right: someone opened Kiyro's settings and flipped
      // this switch themselves, which is as direct a statement of intent as
      // the Task Manager toggle was. It is also the only way out of the
      // `blockedBySystem` state from inside the app. `true` is the default
      // here, but it is spelled out because the *opposite* choice is what
      // `reconcileStartupPath()` needs, and the difference between those two
      // paths is the whole point.
      enabled: true,
    });
    log.info(`[kiyro] login item ${enabled ? 'registered' : 'removed'}`);
  } catch (error) {
    log.error('[kiyro] could not write login item settings:', error);
  }

  return getStartupStatus();
}

/**
 * Marks that the on-by-default decision below has already been made once, so
 * it is never made again. A file rather than a `preferences.json` field on
 * purpose: this is not a preference — it records a one-time event, and
 * mirroring the *state* into preferences is exactly what this module's doc
 * comment argues against.
 */
function defaultAppliedMarkerPath(): string {
  return path.join(app.getPath('userData'), 'startup-default-applied');
}

/**
 * Kiyro starts at login by default, because the macro pad does nothing at all
 * unless Kiyro is running — a pad that stops working after every reboot until
 * you remember to open an app is a broken pad, not a configured one.
 *
 * Applied exactly once, on the first launch of a fresh install, and recorded
 * so it can never re-apply. Without that marker this would fight the user:
 * they turn startup off, the next update relaunches the app, and the default
 * silently switches it back on — with no way to make it stick short of
 * Task Manager.
 *
 * The registry is still checked before writing, so an existing entry (from a
 * previous install, or from the installer itself if that ever registers one)
 * is left exactly as the user left it.
 */
export function applyFirstRunStartupDefault(): void {
  // MUST come before the marker is written, not after the way it used to.
  // `userData` is shared between a dev run and the installed build on
  // Windows: `package.json`'s `name` ("kiyro") names the dev directory and
  // `productName` ("Kiyro") the packaged one, and NTFS is case-insensitive,
  // so both are `%APPDATA%\Kiyro`. Writing the marker first meant any
  // `electron:dev` session — where `isSupported()` is false and nothing is
  // ever registered — silently burned the packaged app's one and only
  // chance to apply this default, and the installed build then started up
  // with no login item and no entry in Task Manager's Startup tab at all.
  if (!isSupported()) return;

  const marker = defaultAppliedMarkerPath();

  try {
    if (existsSync(marker)) return;
  } catch (error) {
    // Can't prove this is a first run — assume it isn't, since wrongly
    // re-enabling startup is the worse of the two failures.
    log.error('[kiyro] could not read the startup default marker:', error);
    return;
  }

  try {
    mkdirSync(path.dirname(marker), { recursive: true });
    writeFileSync(marker, new Date().toISOString(), 'utf-8');
  } catch (error) {
    // Applying the default without being able to record it would mean
    // re-applying it on every launch, overriding the user each time.
    log.error('[kiyro] could not record the startup default marker:', error);
    return;
  }

  try {
    if (app.getLoginItemSettings().openAtLogin) {
      log.info('[kiyro] first run: login item already registered, leaving it alone');
      return;
    }
  } catch (error) {
    log.error('[kiyro] could not read login item settings on first run:', error);
    return;
  }

  log.info('[kiyro] first run: enabling start-at-login by default');
  setStartupEnabled(true);
}

/**
 * Run once at startup: an update that installs into a different directory
 * leaves the `Run` entry pointing at the old executable, and the user finds
 * out at their next sign-in when nothing launches. Rewrites the entry only
 * when the recorded path has actually gone stale.
 *
 * The `enabled` flag is carried across deliberately. `setLoginItemSettings`
 * defaults it to `true`, so re-registering a path without passing the
 * current value through would silently undo a Task Manager veto — turning a
 * maintenance fix into Kiyro overriding a choice the user made outside it.
 */
export function reconcileStartupPath(): void {
  if (!isSupported() || process.platform !== 'win32') return;

  try {
    const settings = app.getLoginItemSettings();
    if (!settings.openAtLogin) return;

    const entry = settings.launchItems?.find((item) => item.name === LOGIN_ITEM_NAME);
    if (!entry) return;

    const pathIsCurrent = entry.path?.toLowerCase() === process.execPath.toLowerCase();
    const argsAreCurrent = entry.args?.includes(HIDDEN_ARG) === true;
    if (pathIsCurrent && argsAreCurrent) return;

    log.info(
      `[kiyro] login item points at a stale path (${entry.path}) — rewriting to ${process.execPath}`,
    );
    app.setLoginItemSettings({
      openAtLogin: true,
      name: LOGIN_ITEM_NAME,
      path: process.execPath,
      args: [HIDDEN_ARG],
      enabled: entry.enabled,
    });
  } catch (error) {
    log.error('[kiyro] could not reconcile login item path:', error);
  }
}
