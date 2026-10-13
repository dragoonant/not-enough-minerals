// errors.ts: Rejection helpers and TodoError, in a leaf module so services (dice, edition, effects...) can use them
// without importing registry.ts (which imports every rules module). registry.ts re-exports all of these.
import type { Rejection, RejectionCode } from './types'

export const isRejection = (r: unknown): r is Rejection =>
  typeof r === 'object' && r !== null && typeof (r as Rejection).code === 'string' && typeof (r as Rejection).message === 'string' && !('state' in r)

export const reject = (code: RejectionCode, message: string, detail?: Record<string, unknown>): Rejection =>
  detail ? { code, message, detail } : { code, message }

/** Thrown by unimplemented bodies. apply() turns it into an E_TODO rejection; anything else is a real bug. */
export class TodoError extends Error {
  constructor(what: string) { super(`TODO(M2): ${what}`); this.name = 'TodoError' }
}
export function todo(what: string): never { throw new TodoError(what) }
