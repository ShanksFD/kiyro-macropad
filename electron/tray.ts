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
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAD8UExURQAAABGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/xGW/w+V/xOX/y2i/zSm/zSl/zWm/ymh/xKW/xCW/x6c/77i/+v2/+j1/6bY/xWY/yCd/4zM/06x/w6V/9Lr/////7ff/x+c/6LW/97w/0yw/9Dq/7bf/93w/97x/0qv/7Te/yOe/6HW/+33/1m2/8Tl/6XX//7//+z3/2O6//r9//7+/+r2/2G5//X6/4TJ/zKl/zOl/yyi/+n1/5nS/+f0/73i/2C5//j8/wyU//f7/w2U/02x/2S6/0eu/+Dx/xqa/5g1vzYAAAATdFJOUwAAAipurtvz/jiZ4Pwai+s2xEKQtCyKAAAAAWJLR0QovbC1sgAAAAd0SU1FB+oJAg40Co1zD10AAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDktMDJUMTM6NDk6MDgrMDA6MDB4aB9bAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA5LTAyVDE0OjQwOjM4KzAwOjAwBtyNlgAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOS0wMlQxNDo1MjoxMCswMDowMOV46q4AAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAABbElEQVQ4y4WTZ0PCMBCGQ/dilFBACUPQUkdR3IqKAxH3+v//xUua1hTQvl9y7T1JLjcQosqBJFlRNd0wdE1VZIn+QYmo27RsB3M5tmVKAgFmvlDEKRUL+YQAo+TiBbklTsBS1vASaWVG0P1L/UCwM+B+F/8hN08BqcA+KkxzREECwGTxe9Vavb6y2gCTNEjyFjOHJItapNlqdzrttS4c1Vvf8GPCkpBsM6DXD0CbXVzZ2g52wpiwZaQ4ETCgwG6X+oNgL+TROApSsQh4zB8Ew31OqEgTgYPDI+YPjk84oCFdBE7Pzpl/dBFHqSNDBC6vuD95qJEGIo2vfb+SAPoCcHN7N5nce/EV2jwwfRjOZuPHJuFBqnPA6Cl8hqXfI/yZqUTR+F7CV1gHEQCJSqWaxv/2LpwAqRaLNd37INj//IKytaIYoFhiuWtVKDf5nlDLi8u92DDkt3VYw2S2XFbTZrZ99uBkj1728P47/j/dEFOmQ1A9tgAAAABJRU5ErkJggg==';

const TRAY_ICON_WIN_DISCONNECTED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAADZc7J/AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAD/h4/MvwAAAAd0SU1FB+oJAg40Co1zD10AAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDktMDJUMTQ6MDM6MDUrMDA6MDDDN5uIAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA5LTAyVDE0OjQwOjQ2KzAwOjAwXCb/0gAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOS0wMlQxNDo1MjoxMCswMDowMOV46q4AAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAACPklEQVRIx62VS4saQRSFv6rpxIzmBRmIEXcZJkKYLI0wkEgQXM0vcKMr15r8Dt0FXMVNfkGyiCCDCTSE3pqFCyUkqLgwizx8EKY1i35Vt68RcmpTfbvOqTq3bnEFLmrORJIgQ5pTokSACSPatGjSYWEtKbosEaBLkhTIEucAP0z6NHiDYYkU/QI2PUaJPEdsxpg6VYaehFDoSSqcsRs6ZQxHQrj0F9Q4vgIdoEuRC0tCuLu/vTLdkshZp5C298pedDimQswRkJQ870tlbMUZJaQlkCTvRAW3uGuPyK5T5EmChqTgXdw1nnGPJSD5zicWwJIbPGHAwCsaC0cUMDQSZNXoIYf2LGRbCvGUBA/5yDAokSUhyRBXY37nS0KkSAC3eU4smJc4GUl6pWjX0LElHvglDkhrnG6jJ106wHXbloJTjegmgRApTpTvOTrfglmIaptv675Pe45Ob3VRRGMjpDKfufTACdCYcJMduOQLY+4gMJn40zjRGO16BTN6POIxIPhBk7/qz5GkvZ0+R+crEcKElSJz0Za0MLfTu3jlFSgkk5akSV+NiQC9Bwg3Gkhhn6akQ8PveMaUKVN+uXTTjsyY+QUadEQNUrxz3qMg4la2yR/3qsL23r5bGHPOZw0wqPPK8fh7jZ1Lfq6zWMewqmVBFd1b4A1VaiWmU2XhlNuQMl32QZey1R2k3WEMintIdCk6nUG6TeqCnGdkK3RyTlfASvl7zgEGfGDJCeEt5DGveUnHof+/5qpI7Nne/wFeULL2gp0D0gAAAABJRU5ErkJggg==';

const TRAY_ICON_MAC_TEMPLATE_CONNECTED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAADZc7J/AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAAAqo0jMgAAAAd0SU1FB+oJAg45E1y22dAAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDktMDJUMTQ6NTc6MTkrMDA6MDCwgf1aAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA5LTAyVDE0OjU3OjE5KzAwOjAwwdxF5gAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOS0wMlQxNDo1NzoxOSswMDowMJbJZDkAAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAAB50lEQVRIx6XVvU9TYRQG8N+9kkiUUaC0q18hLGpCuhJMmPwYHJiN0Q3j4K57J12s/4CJC4MTCQmJIcY/gIGkmDSRwIAEMaSSQPs6tFzvbS8F0vNuz73Pc857znnPifRa7Lb7ZkyZcAUN29asWLau5QyLlVXVHQtd51hdVVncj15UsdNDTZ8dFcXT6NNW+5JPzqrpPPqs2rnoQVAz2+v9/PS2xHT27ucLPnuRJBexyoXpQVA5qUg5lfmmn2o2bKjZ1jqjIuW2/2oK3DenoKRk3NOkG35742uORFXMpHoK2nMnycxDRx3RF7iVk6e6SRYyXbfnbiLw2FGHHpErcWyBxQyUFnik6U9Ch5u+dUksxqb6vIt9r30UEmTXbtc/UxycGsGMZynvjPrUk4UDXaVKC1zOvLw8etDqJ5C2cZ9ze6E1pOGqs2zES/f8EAwrZuJq6HpEeREUvHJDUUnBnP3soxqy5npf76PeK/jgL5joGmprsRXNvvR3nghJNaLM16aV2LLNDBi66PMICRoy/25aHrJuyfNU84wpuIRgxFvznYKWNESaxjIpXLIeoeyLax2oZcuhCMGwUifkQ1tCB/tfhV8e+N72OuBAGXikMfBQZeCx3o5ioMXSzsVAq61dkQsu1yhX5ALr/R+r7CHn7K8P1gAAAABJRU5ErkJggg==';

const TRAY_ICON_MAC_TEMPLATE_DISCONNECTED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAADZc7J/AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAAAqo0jMgAAAAd0SU1FB+oJAg45E1y22dAAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDktMDJUMTQ6NTc6MTkrMDA6MDCwgf1aAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA5LTAyVDE0OjU3OjE5KzAwOjAwwdxF5gAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOS0wMlQxNDo1NzoxOSswMDowMJbJZDkAAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAAB6klEQVRIx6XVP2tTYRQG8N+9Fiza0bZpsmkFKV1UKFlLhU7+GRw6i+hWcXAV3DPpYvwCgksHp0IlIB38AB0KqRCwtEOFNlJioU1eh6TXe5M0bcl5t+fe5znnPee850R6LXbHA/NmTbmGhl0bKtZsajnHYkVlNSdC1zlRU1YUD6Lnlez1UNNnT0n+LPqc9YHk07Nurh99QfVC9CCoWuj1fnF6W2Iue/eLBZ+9SJKLWOnS9CAonVakmMp80y9VW7ZU7WqdU5Fi2385BdYtyikomPQs6YYDb33rI1EWM6OWgvbdTTLzyHFH9CVuqfQI1MywnOm6ffcSgSeOO/QITPdInFhmJQOlBR5r+pPQ4abvXRIrsdkB76LujU9CgtQddP0zy+GZEcx7nvLOuM89WTjUVaq0wNXMy+tHD1qDBNI26UvfXmiNaLjuPBvzyn0/BaPymbgauh5RvwhyXrstryBnUT37qEZsmB7ofdwHOR/9BVNdQ20jVtEcSH/vqZBUI8p8barE1mxnwNBFX0JI0JD5d9vaiE2rXqSaZ0LOFQRj3lnqFLSgIdI0kUnhqs0IRV/d6EAtO45ECEYVOiEf2RE62P8q/PbQj7bXIQfK0CONoYcqQ4/1dhRDLZZ2LoZabe2KXHK5Rn1FLrHe/wEjgiHOrjX3QwAAAABJRU5ErkJggg==';

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
