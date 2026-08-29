import type { KiyroBridge } from '@/lib/electron/ipc-types';

declare global {
  interface Window {
    /** Present only inside the Electron renderer — see `electron/preload.ts`. */
    kiyro?: KiyroBridge;
  }
}

export {};
