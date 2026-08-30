/**
 * System tray icon + menu.
 *
 * Icons are embedded PNGs rather than files on disk — this avoids adding an
 * asset-copy step to the `tsc`-only electron build (see `electron/tsconfig.json`,
 * which has no asset pipeline). Each connection state (connected/disconnected)
 * has two variants:
 *  - `..._WIN_...`: full-color, used on Windows/Linux.
 *  - `..._MAC_TEMPLATE_...`: a macOS "template image" — black shape + alpha
 *    only, no color — which macOS auto-tints for light/dark menu bars and
 *    click state. Marked as such via `setTemplateImage(true)` below; a color
 *    image there would render wrong.
 */

import { Menu, nativeImage, Tray } from 'electron';

const TRAY_ICON_WIN_CONNECTED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAACfUExURQAAAP9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP/9gP////4Vu70cAAAAzdFJOUwAABFd1c3ImCw0KwlUOl6UVwPxU/qcUqBfnOP1TCen7Y5PW6O1fCOatwcWSB1DDdnRDNU7qVAIAAAABYktHRDSpsen9AAAAB3RJTUUH6ggeFgQMjsyvxAAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wOC0zMFQyMTo1MzoyMSswMDowMGacfNMAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDgtMzBUMjE6NTM6MjErMDA6MDAXwcRvAAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA4LTMwVDIyOjA0OjEyKzAwOjAw0fIjOwAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAADXSURBVDjLvdPZFoIgFAVQURtEs8zmUiubR4v//7cUEK5IvtV5Es9eC0QwjD8EwYA3EpiW3aJpdxDvuw4QCLuEx0Os7/n9gRQIB7wfhoj2jj8i44kQVcB7AkQFiB4IBZQ9E3Uge0KmszqAPZkvFLBcRbCPPXWKZL1RenWKbaLpAYCRvR6AXgvSEPxeDdjtI1zk8AUcT+7ZzXO53rQgvtv86YF1IF9fCQIdKNbfBOj3NQDaNwC2PzUgDm3K9g89+dhlQBz77MW37p3RsW2ZSL045cWo3qQf5wNAG1MwQdeNPgAAAABJRU5ErkJggg==';

const TRAY_ICON_WIN_DISCONNECTED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAADZc7J/AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAD/h4/MvwAAAAd0SU1FB+oIHhYEDfnLn1IAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDgtMzBUMjI6MDI6MjMrMDA6MDDSXMZIAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA4LTMwVDIyOjAyOjIzKzAwOjAwowF+9AAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOC0zMFQyMjowNDoxMyswMDowMHeFKI8AAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAABT0lEQVRIx92UPUvDQBiAnyRFULE4CG6CQwd/hPgjXMRRh4AGEaT0N7SjH0N+guggqKM4KhRxd9RBGsGli5Y2cciHvdzl7jLqO9zHG57n3twdB38+HAgrP/rFKFRmARpZu8kK8VQ+4YaXEj6PyxBCQZEKZthnvbT8Wy7I8CZdmhzyISrcrI9L+IREwBfo4rPNMUviL7loo8B7+DjAFieiwq2FIysMFUi4oLARyHiqOGXZRqDGATZY1QscEmYr8YgDHvWCmEUNHnCRTxqVFRzR0uO+VuCxpsyXcJtj1OLVFahiQMBlOszvoV9D8EmHW+aKecxXnQreeWCXnWJbPZ5o820riNijRU/IxXi2mxgRcCVlJ2lnFgjXRg6TwICbBEZcL1Bcm2qBLBqUcEdNpsc44oxr4WF1eOZOWP2edv7QAi6vjH4FY87VBU4V36fP/4wf6GNaeZu7rQcAAAAASUVORK5CYII=';

const TRAY_ICON_MAC_TEMPLATE_CONNECTED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAADZc7J/AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAAAqo0jMgAAAAd0SU1FB+oIHhYEDI7Mr8QAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDgtMzBUMjE6NTM6MjErMDA6MDBmnHzTAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA4LTMwVDIxOjUzOjIxKzAwOjAwF8HEbwAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOC0zMFQyMjowNDoxMiswMDowMNHyIzsAAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAAAeUlEQVRIx+2SwQrAMAxC6/7/n91lMAaJGrpjvbRVfBkjax1tC8/JNnnFyr3iUawHpQAWtwGA/SsBUDkeQO06AE1uAH0dCSCoq0VaSX2ySGV9DthY5bI+A0CZk5/46aZfgHp+CkAfJQCo0AOgYwcwdQewdQ0I6ke/6Ab4NRErI68ybQAAAABJRU5ErkJggg==';

const TRAY_ICON_MAC_TEMPLATE_DISCONNECTED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAADZc7J/AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAAAqo0jMgAAAAd0SU1FB+oIHhYEDfnLn1IAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDgtMzBUMjI6MDI6MjMrMDA6MDDSXMZIAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA4LTMwVDIyOjAyOjIzKzAwOjAwowF+9AAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOC0zMFQyMjowNDoxMyswMDowMHeFKI8AAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAAAeUlEQVRIx+2SwQrAMAxC6/7/n91lMAaJGrpjvbRVfBkjax1tC8/JNnnFyr3iUawHpQAWtwGA/SsBUDkeQO06AE1uAH0dCSCoq0VaSX2ySGV9DthY5bI+A0CZk5/46aZfgHp+CkAfJQCo0AOgYwcwdQewdQ0I6ke/6Ab4NRErI68ybQAAAABJRU5ErkJggg==';

function trayIconFor(connected: boolean): Electron.NativeImage {
  const isMac = process.platform === 'darwin';
  const base64 = isMac
    ? connected
      ? TRAY_ICON_MAC_TEMPLATE_CONNECTED_PNG_BASE64
      : TRAY_ICON_MAC_TEMPLATE_DISCONNECTED_PNG_BASE64
    : connected
      ? TRAY_ICON_WIN_CONNECTED_PNG_BASE64
      : TRAY_ICON_WIN_DISCONNECTED_PNG_BASE64;
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${base64}`);
  if (isMac) icon.setTemplateImage(true);
  return icon;
}

export interface TrayCallbacks {
  onOpen: () => void;
  onQuit: () => void;
}

/**
 * Reflects the serial connection state in the tray icon itself, so the
 * status is visible without opening the window — call this from
 * `SerialBridge#onStateChange` (via `ExecutionPipeline#bridge`).
 */
export function setTrayConnected(tray: Tray, connected: boolean): void {
  tray.setImage(trayIconFor(connected));
  tray.setToolTip(connected ? 'Kiyro — connected' : 'Kiyro — disconnected');
}

export function createTray({ onOpen, onQuit }: TrayCallbacks): Tray {
  const tray = new Tray(trayIconFor(false));
  tray.setToolTip('Kiyro — disconnected');

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
