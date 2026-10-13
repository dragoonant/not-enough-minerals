// Modals (briefing, settings, game over) render in their own top-level layer, above the HUD and the decision prompt, so a
// decision can never be answered while the player is still reading the mission. Server rendering (tests) stays inline.
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function ModalLayer({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return <>{children}</>
  return createPortal(<div className="hud-root modal-layer" data-testid="modal-layer">{children}</div>, document.body)
}
