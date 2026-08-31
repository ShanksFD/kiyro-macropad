/**
 * Application menu.
 *
 * The window is frameless (`titleBarStyle`, `electron/main.ts`) with its own
 * in-page title bar replacing View/Help — see
 * `src/components/layout/window-menu.tsx`, wired to the `window:*` IPC
 * handlers registered in `main.ts`. So there is no visible menu bar on
 * Windows/Linux at all (`Menu.setApplicationMenu(null)`).
 *
 * macOS is different: the system menu bar lives at the top of the screen,
 * entirely separate from the window's own title bar, and removing it
 * entirely would also drop the `role: 'editMenu'` accelerators
 * (Cmd+C/V/X/A) that Chromium's text inputs rely on the app menu to wire
 * up. `buildMacAppMenu` keeps just that minimum — no visible View/Help
 * there either, since the in-page menu covers those uniformly cross-platform.
 */

import { app, dialog, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

export function showAboutDialog(): void {
  void dialog.showMessageBox({
    type: 'info',
    title: 'About Kiyro',
    message: 'Kiyro',
    detail: `Version ${app.getVersion()}`,
  });
}

export function buildMacAppMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
  ];
  return Menu.buildFromTemplate(template);
}
