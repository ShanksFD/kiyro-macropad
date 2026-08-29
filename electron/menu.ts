/**
 * A trimmed application menu.
 *
 * Electron's built-in default menu (used whenever `setApplicationMenu` is
 * never called) adds File/Edit/Window entries meant for a document editor —
 * "New Window", "Undo/Redo/Cut/Copy/Paste" — none of which mean anything
 * here. This keeps only what's actually useful for a macro pad configurator:
 * reloading the page and reaching DevTools (View), and a minimal Help entry.
 */

import { app, dialog, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

const template: MenuItemConstructorOptions[] = [
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { type: 'separator' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'About Kiyro',
        click: () => {
          void dialog.showMessageBox({
            type: 'info',
            title: 'About Kiyro',
            message: 'Kiyro',
            detail: `Version ${app.getVersion()}`,
          });
        },
      },
    ],
  },
];

export function buildAppMenu(): Menu {
  return Menu.buildFromTemplate(template);
}
