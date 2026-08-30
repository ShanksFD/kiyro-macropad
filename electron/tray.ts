/**
 * System tray icon + menu.
 *
 * The icon is a small embedded PNG (a solid circle) rather than a file on
 * disk: this app has no icon asset yet, and embedding one here avoids adding
 * an image-processing dependency just to ship a placeholder. Swap
 * `TRAY_ICON_PNG_BASE64` for a real brand icon whenever one exists — nothing
 * else here needs to change.
 */

import { Menu, nativeImage, Tray } from 'electron';

const TRAY_ICON_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAb0lEQVR4nO3UwQ0AIAgEQQu1BPu2DC1AJSIcaOQS3jsvUnptJddGnUsUijmNixHSsAiiHWchUPFthCsAHScRVvEl4m+AdXxABCAAAXAHuD+iAFgjpnErBBm/AoBEbMVRCFZcE3Ic1kCoxLkYSBS5DpnrfxJxRiofAAAAAElFTkSuQmCC';

export interface TrayCallbacks {
  onOpen: () => void;
  onQuit: () => void;
}

export function createTray({ onOpen, onQuit }: TrayCallbacks): Tray {
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_PNG_BASE64}`);
  const tray = new Tray(icon);
  tray.setToolTip('Kiyro — macro pad configurator');

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Kiyro', click: onOpen },
      { type: 'separator' },
      { label: 'Quit Kiyro', click: onQuit },
    ]),
  );

  // Windows/Linux convention: a single click on the tray icon itself also
  // restores the window, not just the menu's "Open Kiyro" entry.
  tray.on('click', onOpen);

  return tray;
}
