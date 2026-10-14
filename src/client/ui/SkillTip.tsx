// Skill names with an explanation on hover / focus / tap, through the one shared Tooltip (spec 50 s4). The content comes
// from skillInfo.ts; this file only lays it out.
import type { ReactElement, ReactNode } from 'react'
import type { SkillInfo } from './skillInfo'
import { Tip, type TipPlacement } from './Tooltip'

/** The popup body: labelled facts, then what it does. */
export function SkillBody({ info }: { info: SkillInfo }): ReactElement {
  return (
    <div className="skill-tip" data-testid="skill-tip" data-kind={info.kind}>
      {info.lines.length > 0 && (
        <dl className="skill-lines">
          {info.lines.map((l, i) => <div key={i}><dt>{l.label}</dt><dd>{l.text}</dd></div>)}
        </dl>
      )}
      <p className="skill-text">{info.text}</p>
    </div>
  )
}

/** Wrap any focusable element so hovering or focusing it explains the skill. */
export function SkillTip({ info, placement = 'top', children }: { info: SkillInfo | null; placement?: TipPlacement; children: ReactElement }): ReactElement {
  if (!info) return children
  return <Tip title={info.name} body={<SkillBody info={info} />} placement={placement} wide>{children}</Tip>
}

/** A skill name as inline text: dotted underline, help cursor, keyboard focusable. */
export function SkillName({ info, testid, className, children }: { info: SkillInfo; testid?: string; className?: string; children?: ReactNode }): ReactElement {
  return (
    <SkillTip info={info}>
      <span className={`skill-name${className ? ` ${className}` : ''}`} tabIndex={0} data-testid={testid}>{children ?? info.name}</span>
    </SkillTip>
  )
}
