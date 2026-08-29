import type { Action } from '../actions/types';
import type { ControlId } from '../devices/types';

/**
 * Action execution.
 *
 * Kiyro's configuration layer decides *what* a control should do; this layer is
 * responsible for actually doing it. They are separate because, in a browser,
 * the second half is not possible: a web page cannot press keys, change the
 * system volume or scroll another application. Only an OS-level agent can.
 *
 * The seam exists so that agent can be added later without touching the editor.
 * Until then the only implementation reports itself unavailable — it never
 * pretends, and in particular it never dispatches synthetic `KeyboardEvent`s,
 * which would only affect Kiyro's own page and would be indistinguishable from
 * working until a user tried it in a real application.
 */

export type ExecutionUnavailableReason =
  /** Running in a browser tab, which cannot reach other applications. */
  | 'browser-sandbox'
  /** A host agent exists but is not currently reachable. */
  | 'agent-unreachable'
  /** The agent is reachable, but this particular action type has no execution path yet. */
  | 'action-not-supported';

export type ExecutionAvailability =
  { available: true } | { available: false; reason: ExecutionUnavailableReason; message: string };

export interface ExecutionRequest {
  controlId: ControlId;
  action: Action;
  /** Epoch milliseconds of the input event that triggered this. */
  at: number;
}

export type ExecutionOutcome =
  | { status: 'executed'; by: string }
  | { status: 'skipped'; reason: 'no-binding' }
  | { status: 'unavailable'; reason: ExecutionUnavailableReason; message: string };

export interface ActionExecutor {
  readonly id: string;
  availability(): ExecutionAvailability;
  execute(request: ExecutionRequest): ExecutionOutcome;
}

export const BROWSER_EXECUTION_MESSAGE =
  'Kiyro is running in a browser tab, which cannot send keystrokes, media keys or scrolling to other applications. Bindings are recorded and saved, but nothing is performed on your computer yet.';

/**
 * The only executor that ships today.
 *
 * It resolves every request as `unavailable` with a stable reason, so the UI can
 * say precisely what is and is not happening.
 */
export class BrowserSandboxExecutor implements ActionExecutor {
  readonly id = 'browser-sandbox';

  availability(): ExecutionAvailability {
    return {
      available: false,
      reason: 'browser-sandbox',
      message: BROWSER_EXECUTION_MESSAGE,
    };
  }

  execute(request: ExecutionRequest): ExecutionOutcome {
    if (request.action.type === 'none') return { status: 'skipped', reason: 'no-binding' };
    return {
      status: 'unavailable',
      reason: 'browser-sandbox',
      message: BROWSER_EXECUTION_MESSAGE,
    };
  }
}

/** Application-wide executor for events the browser itself receives over Web Serial. */
export const actionExecutor: ActionExecutor = new BrowserSandboxExecutor();

export function isExecutionAvailable(): boolean {
  return actionExecutor.availability().available;
}

/**
 * The real story about execution today.
 *
 * In the Electron app, Kiyro's own main process owns the serial connection
 * and performs bindings directly — no separate host process, no localhost
 * hop. `connected` here means "the Electron bridge is present" (effectively
 * always true once the app has booted); `deviceConnected` means a macro pad
 * is actually attached to it.
 *
 * UI components should call this rather than reading `actionExecutor`
 * directly, since only this reflects whether a device is actually attached.
 */
export function deriveExecutionAvailability(host: {
  connected: boolean;
  deviceConnected: boolean;
}): ExecutionAvailability {
  if (host.connected && host.deviceConnected) return { available: true };

  if (host.connected) {
    return {
      available: false,
      reason: 'agent-unreachable',
      message: 'Kiyro is running, but no macro pad is attached yet.',
    };
  }

  return {
    available: false,
    reason: 'agent-unreachable',
    message:
      'Kiyro’s execution engine is not reachable, so bindings are saved but not performed. This updates automatically once it is.',
  };
}
