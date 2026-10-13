// Interaction layer (owner I, spec 50 s5): decision classification for every kind, option grouping, path answers, labels,
// and a real game driven through the same helpers the controllers use (dry-run previews must agree with the engine).
import { afterEach, describe, expect, it } from 'vitest'
import { game } from '../../src/client/contract'
import { highlightsFor } from '../../src/client/interaction/highlights'
import {
  DECISION_KINDS, KIND_INFO, activationMenu, batchMenu, chargeOptionFor, chargePickable, classify, isPathKind, kindInfo,
  mentionedUnits, pathPayload, pathPlan, sideOptions, targetRefs, type Mode,
} from '../../src/client/interaction/kinds'
import { answerOption, optionForTarget } from '../../src/client/interaction/actions'
import { polylineLength } from '../../src/client/interaction/geometry'
import { previewPath } from '../../src/client/interaction/preview'
import { draft, cancelDraft, useDraft } from '../../src/client/interaction/store'
import { prettify } from '../../src/client/interaction/text'
import { dispatch, legalFor, newGame, resetGameStore, setController, useGameStore } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import type { DecisionOption, PendingDecision, Vec2 } from '../../src/engine/types'

afterEach(() => { resetGameStore(); draft.reset(); useDraft.setState({ decisionId: null }) })

const opt = (id: string, type: string, fields: Record<string, unknown> = {}): DecisionOption => ({ id, label: id, action: { ...fields, type, decisionId: 'd1', seat: 'A' } })
const pend = (kind: string, options: DecisionOption[], context: Record<string, unknown> = {}): PendingDecision => ({ id: 'd1', seat: 'A', kind, context, options, canPass: false })

describe('I-KIND every decision kind has a controller', () => {
  const EXPECT: Record<string, Mode> = {
    'setup.colour': 'list', 'setup.draftControl': 'list', 'setup.ban': 'list', 'setup.pick': 'list', 'setup.terrain': 'list', 'setup.firstPlayer': 'list',
    'turn.start': 'list', 'turn.first': 'list', 'turn.activate': 'activate', 'turn.order': 'list', 'turn.over': 'list', 'turn.choose': 'list',
    'move.path': 'path', 'move.place': 'path', 'deploy.entry': 'entry', 'deploy.drop': 'list', 'deploy.path': 'path',
    'shoot.batch': 'target', 'shoot.template': 'models', 'charge.targets': 'target', 'charge.impact': 'target', 'charge.path': 'path',
    'melee.closeRanks': 'list', 'melee.split': 'target', 'atk.reroll': 'list', 'atk.precision': 'list', 'atk.tough': 'list', 'atk.casualty': 'models',
    'ability.window': 'list', 'ability.target': 'list', 'ability.pay': 'list', 'ability.react': 'list', 'mission.choose': 'list', 'mission.claim': 'list', 'score.order': 'list',
  }
  it('INT-001 DECISION_KINDS lists every kind of spec 00 s3.2 and each has our-words copy', () => {
    for (const k of DECISION_KINDS) {
      expect(EXPECT[k], k).toBeDefined()
      expect(KIND_INFO[k]?.title.length, k).toBeGreaterThan(3)
      expect(KIND_INFO[k]?.hint.length, k).toBeGreaterThan(10)
    }
    expect(Object.keys(EXPECT).sort()).toEqual([...DECISION_KINDS].sort())
    expect(kindInfo('weird.kind').title).toContain('Weird')
  })

  it('INT-002 classify gives the expected answer mode for the shape of each kind', () => {
    for (const k of DECISION_KINDS) {
      let p: PendingDecision
      if (k === 'turn.activate') p = pend(k, [opt('u1:move', 'move.go', { unitId: 'u1' })])
      else if (isPathKind(k)) p = pend(k, [opt('path', k, { unitId: 'u1' })])
      else if (k === 'shoot.batch') p = pend(k, [opt('w>t', 'shoot.batch', { unitId: 'u1', weaponId: 'w', targetUnitId: 't' })])
      else if (k === 'charge.targets') p = pend(k, [opt('t:x', k, { unitId: 'u1', targetIds: ['x'] })])
      else if (k === 'charge.impact') p = pend(k, [opt('all:x', k, { unitId: 'u1', all: 'x' })])
      else if (k === 'melee.split') p = pend(k, [opt('s:x', k, { unitId: 'u1', surgeTarget: 'x' })])
      else if (k === 'shoot.template') p = pend(k, [opt('aim:m1', k, { modelId: 'm1' })])
      else if (k === 'atk.casualty') p = pend(k, [opt('remove:m1', k, { modelId: 'm1' })])
      else if (k === 'deploy.entry') p = pend(k, [opt('edge:0', k, { unitId: 'u1', entry: { kind: 'edge', segment: 0 } })])
      else p = pend(k, [opt('a', k, {}), opt('b', k, {})])
      expect(classify(p), k).toBe(EXPECT[k])
    }
  })

  it('INT-003 ability.target switches mode on its options (unit pick, spot pick, plain list)', () => {
    expect(classify(pend('ability.target', [opt('tgt:x', 'ability.target', { mode: 'unit', unitId: 'x' })]))).toBe('target')
    expect(classify(pend('ability.target', [opt('point', 'ability.target', { mode: 'point' }), opt('point:0', 'ability.target', { mode: 'point', point: { x: 1, z: 2 } })], { points: [{ x: 1, z: 2 }] }))).toBe('point')
    expect(classify(pend('ability.target', [opt('opt:a', 'ability.target', { mode: 'option', optionId: 'a' })]))).toBe('list')
    // an unknown kind whose options name a model is still answerable on the table
    expect(classify(pend('atk.future', [opt('m', 'atk.future', { modelId: 'm1.0' })]))).toBe('models')
  })
})

describe('I-MENU turn.activate, shoot.batch and charge.targets option grouping', () => {
  it('INT-010 the activation menu groups verbs by squad and keeps Pass apart', () => {
    const p = pend('turn.activate', [
      opt('A1:move', 'move.go', { unitId: 'A1' }), opt('A1:hold', 'turn.hold', { unitId: 'A1' }), opt('A2:shoot', 'shoot.go', { unitId: 'A2' }), opt('pass', 'turn.pass'),
    ])
    const m = activationMenu(p)
    expect(m.units.map((u) => u.unitId)).toEqual(['A1', 'A2'])
    expect(m.units[0]!.options.map((o) => o.id)).toEqual(['A1:move', 'A1:hold'])
    expect(m.pass?.id).toBe('pass')
    expect(sideOptions(p).map((o) => o.id)).toEqual(['pass'])
    expect(highlightsFor(p, { menuUnit: 'A2', weaponId: null, armed: null, picked: [], hoverOption: null }).units).toEqual({ A1: 'ready', A2: 'selected' })
  })

  it('INT-011 shoot.batch rows are one per weapon; the table highlights the active weapon targets and a click picks that weapon', () => {
    const p = pend('shoot.batch', [
      opt('g>t1', 'shoot.batch', { unitId: 'A1', weaponId: 'g', targetUnitId: 't1' }), opt('g>t2', 'shoot.batch', { unitId: 'A1', weaponId: 'g', targetUnitId: 't2' }),
      opt('f>t2', 'shoot.batch', { unitId: 'A1', weaponId: 'f', targetUnitId: 't2' }), opt('done', 'shoot.batch', { unitId: 'A1', done: true }),
    ])
    const m = batchMenu(p)
    expect(m.rows.map((r) => [r.weaponId, r.targets])).toEqual([['g', ['t1', 't2']], ['f', ['t2']]])
    expect(m.done?.id).toBe('done')
    expect(sideOptions(p).map((o) => o.id)).toEqual(['done'])
    expect(highlightsFor(p, { menuUnit: null, weaponId: 'f', armed: null, picked: [], hoverOption: null }).units).toEqual({ A1: 'selected', t2: 'target' })
    expect(optionForTarget(p, 't2', 'f')?.id).toBe('f>t2')
    expect(optionForTarget(p, 't1', 'f')?.id).toBe('g>t1') // the active weapon cannot reach it: fall back to one that can
    expect(optionForTarget(p, 'nobody', null)).toBeNull()
  })

  it('INT-012 charge.targets: the picked set must equal an offered option, in any order', () => {
    const p = pend('charge.targets', [
      opt('t:a', 'charge.targets', { unitId: 'u', targetIds: ['a'] }), opt('t:b', 'charge.targets', { unitId: 'u', targetIds: ['b'] }), opt('t:a+b', 'charge.targets', { unitId: 'u', targetIds: ['a', 'b'] }),
    ], { unitId: 'u', targets: ['a', 'b'] })
    expect(chargePickable(p)).toEqual(['a', 'b'])
    expect(chargeOptionFor(p, ['b', 'a'])?.id).toBe('t:a+b')
    expect(chargeOptionFor(p, [])).toBeNull()
    expect(chargeOptionFor(p, ['c'])).toBeNull()
    expect(targetRefs('charge.targets', p.options[2]!.action)).toEqual(['a', 'b'])
    expect(mentionedUnits(p.options[2]!.action).sort()).toEqual(['a', 'b', 'u'])
  })
})

describe('I-PATH path answers', () => {
  it('INT-020 move.path: the open template plus a dragged path becomes a complete answer, ready routes and Hold stay as buttons', () => {
    const p = pend('move.path', [
      opt('path', 'move.path', { unitId: 'u', kind: 'move' }), opt('path:0', 'move.path', { unitId: 'u', kind: 'move', leaderId: 'u.0', path: [{ x: 1, z: 1 }] }), opt('hold', 'move.hold', { unitId: 'u' }),
    ], { unitId: 'u', kind: 'move', maxDist: 6, leaderId: 'u.0' })
    const plan = pathPlan(p)!
    expect(plan.unitId).toBe('u')
    expect(plan.suggested?.id).toBe('path:0')
    expect(plan.extras.map((o) => o.id)).toEqual(['hold'])
    expect(pathPayload(plan, 'u.1', [{ x: 2, z: 3 }, { x: 4, z: 3 }])).toEqual({ unitId: 'u', kind: 'move', type: 'move.path', leaderId: 'u.1', path: [{ x: 2, z: 3 }, { x: 4, z: 3 }] })
  })

  it('INT-021 charge.path has no template: the auto option supplies the fields, and move.place writes one dest', () => {
    const c = pend('charge.path', [opt('auto', 'charge.path', { unitId: 'u', auto: true }), opt('plan:1', 'charge.path', { unitId: 'u', leaderId: 'u.0', path: [{ x: 0, z: 0 }] })], { unitId: 'u', targets: ['e'], distance: 7 })
    const cp = pathPlan(c)!
    expect(cp.suggested?.id).toBe('auto')
    expect(pathPayload(cp, 'u.2', [{ x: 5, z: 5 }])).toEqual({ unitId: 'u', type: 'charge.path', leaderId: 'u.2', path: [{ x: 5, z: 5 }] })
    const pl = pend('move.place', [opt('place', 'move.place', { unitId: 'u', x: 4, source: 'card' })], { unitId: 'u', x: 4, source: 'card' })
    expect(pathPayload(pathPlan(pl)!, 'u.0', [{ x: 1, z: 1 }, { x: 2, z: 2 }])).toEqual({ unitId: 'u', x: 4, source: 'card', type: 'move.place', leaderId: 'u.0', dest: { x: 2, z: 2 } })
  })

  it('INT-022 the ruler reads the drawn length', () => {
    expect(polylineLength({ x: 0, z: 0 }, [{ x: 3, z: 4 }, { x: 3, z: 8 }])).toBeCloseTo(9, 6)
    expect(polylineLength({ x: 1, z: 1 }, [])).toBe(0)
  })

  it('INT-023 Esc peels the draft innermost first', () => {
    draft.sync('d1')
    draft.openMenu('A1')
    draft.arm({ unitId: 'e', weaponId: 'w' })
    draft.pickUp('A1.0')
    draft.addWaypoint({ x: 1, z: 1 })
    expect(cancelDraft()).toBe(true) // the path
    expect(useDraft.getState().waypoints).toEqual([])
    expect(cancelDraft()).toBe(true) // the armed target
    expect(useDraft.getState().armed).toBeNull()
    expect(cancelDraft()).toBe(true) // the menu
    expect(useDraft.getState().menuUnit).toBeNull()
    expect(cancelDraft()).toBe(false)
    draft.sync('d2') // a new decision wipes it
    expect(useDraft.getState().decisionId).toBe('d2')
  })
})

describe('I-TEXT labels', () => {
  it('INT-030 engine labels lose their raw ids', () => {
    useSettingsStore.getState().set({ speed: 0 }, false)
    expect(newGame({ seed: 'txt' })).toBeNull()
    const s = useGameStore.getState().state!
    const u = Object.values(s.units)[0]!
    const out = prettify(s, `Fire at ${u.id} now`)
    expect(out).not.toBe(`Fire at ${u.id} now`)
    expect(out).toContain(`(${u.id})`)
    expect(prettify(s, `Remove ${u.modelIds[0]}`)).not.toContain(u.modelIds[0]!)
  })
})

// ------------------------------------------------------------------ a real game through the controllers' own helpers
describe('I-FLOW a real game answered through the interaction helpers', () => {
  /** Answer the open decision the way the screen would: table picks and dragged paths, never an engine shortcut. */
  function answerLikeTheScreen(seen: Map<string, number>): boolean {
    const g = useGameStore.getState()
    const s = g.state!
    const p = s.pending
    seen.set(p.kind, (seen.get(p.kind) ?? 0) + 1)
    const mode = classify(p)
    let rej: unknown = 'unset'
    if (mode === 'activate') {
      const menu = activationMenu(p)
      const all = menu.units.flatMap((u) => u.options)
      const o = ['melee.go', 'shoot.go', 'charge.go', 'deploy.go', 'move.go', 'move.run'].map((t) => all.find((x) => x.action.type === t)).find(Boolean) ?? all[0] ?? menu.pass
      rej = o ? answerOption(o) : 'none'
    } else if (mode === 'path') {
      const plan = pathPlan(p)
      const ready = plan?.suggested
      if (plan && ready && Array.isArray(ready.action['path'])) {
        const way = ready.action['path'] as Vec2[]
        const leader = ready.action['leaderId'] as string
        const pv = previewPath(s, p, plan, leader, way)
        expect(pv, `${p.kind} preview`).not.toBeNull()
        expect(pv!.ok, `${p.kind} dry run of the engine's own ready answer: ${pv!.text}`).toBe(true)
        expect(Object.keys(pv!.placement ?? {}).length, 'the engine placed the squad').toBeGreaterThan(0)
        rej = game.answer(pathPayload(plan, leader, way))
      } else rej = ready ? game.choose(ready.id) : game.choose((plan?.extras[0] ?? p.options[0]!).id)
    } else if (mode === 'target' && p.kind === 'shoot.batch') {
      const m = batchMenu(p)
      const row = m.rows[0]
      const o = row ? optionForTarget(p, row.targets[0]!, row.weaponId) : m.done
      rej = o ? game.choose(o.id) : 'none'
    } else if (mode === 'target' && p.kind === 'charge.targets') {
      const only = chargeOptionFor(p, [chargePickable(p)[0]!])
      rej = only ? game.choose(only.id) : game.choose(p.options[0]!.id)
    } else {
      rej = game.choose((p.kind === 'ability.window' ? p.options.find((o) => o.action.type === 'ability.done') ?? p.options[0]! : p.options[0]!).id)
    }
    expect(rej, `${p.kind} answer`).toBeNull()
    return true
  }

  it('INT-040 whole seeded games are answerable from the controllers and every dry-run preview agrees with the engine', () => {
    useSettingsStore.getState().set({ speed: 0 }, false)
    const seen = new Map<string, number>()
    for (const seed of ['ix-flow', 'ix-b', 'ix-c']) {
      expect(newGame({ seed })).toBeNull()
      for (const seat of useGameStore.getState().seatOrder) setController(seat, 'human')
      for (let n = 0; n < 1500; n++) {
        const s = useGameStore.getState().state!
        if (s.phase === 'over') break
        expect(legalFor(s).length).toBeGreaterThan(0)
        answerLikeTheScreen(seen)
      }
    }
    for (const k of ['turn.activate', 'deploy.entry', 'deploy.path', 'move.path', 'shoot.batch', 'charge.targets']) expect(seen.get(k) ?? 0, k).toBeGreaterThan(0)
    for (const kind of seen.keys()) expect(KIND_INFO[kind], `kind ${kind} has copy`).toBeDefined()
  })

  it('INT-041 a hand-drawn path that is too long is rejected by the dry run with our-words text, a short legal one is accepted', () => {
    useSettingsStore.getState().set({ speed: 0 }, false)
    expect(newGame({ seed: 'ix-path' })).toBeNull()
    for (const seat of useGameStore.getState().seatOrder) setController(seat, 'human')
    const seen = new Map<string, number>()
    for (let i = 0; i < 400; i++) {
      const s = useGameStore.getState().state!
      if (s.pending.kind === 'move.path') break
      answerLikeTheScreen(seen)
    }
    const s = useGameStore.getState().state!
    const p = s.pending
    expect(p.kind).toBe('move.path')
    const plan = pathPlan(p)!
    const leader = (p.context['leaderId'] as string | null) ?? s.units[plan.unitId]!.modelIds[0]!
    const from = s.models[leader]!.pos
    const far = previewPath(s, p, plan, leader, [{ x: from.x, z: from.z + 40 }])!
    expect(far.ok).toBe(false)
    expect(far.text.length).toBeGreaterThan(5)
    expect(far.length).toBeGreaterThan(30)
    expect(far.limit).toBe(p.context['maxDist'])
    const ready = plan.suggested!
    const good = previewPath(s, p, plan, ready.action['leaderId'] as string, ready.action['path'] as Vec2[])!
    expect(good.ok).toBe(true)
    expect(Array.isArray(good.red)).toBe(true)
    // the dry run never commits
    expect(useGameStore.getState().state!.pending.id).toBe(p.id)
  })

  it('INT-042 turn.activate option ids repeat across squads, so answers go by action: the second squad really is the one activated', () => {
    useSettingsStore.getState().set({ speed: 0 }, false)
    expect(newGame({ seed: 'ix-dup' })).toBeNull()
    for (const seat of useGameStore.getState().seatOrder) setController(seat, 'human')
    for (let i = 0; i < 20 && useGameStore.getState().state!.pending.kind !== 'turn.activate'; i++) {
      const p = useGameStore.getState().state!.pending
      expect(game.choose(p.options[0]!.id)).toBeNull()
    }
    const p = useGameStore.getState().state!.pending
    expect(p.kind).toBe('turn.activate')
    const menu = activationMenu(p)
    expect(menu.units.length).toBeGreaterThan(1)
    const ids = p.options.map((o) => o.id)
    expect(new Set(ids).size, 'engine option ids are not unique here').toBeLessThan(ids.length)
    const second = menu.units[1]!
    expect(answerOption(second.options[0]!)).toBeNull()
    expect(useGameStore.getState().state!.events.some((e) => (e as { unitId?: string }).unitId === second.unitId)).toBe(true)
  })

  void dispatch
})

describe('I-FIX M3 fix round', () => {
  it('INT-050 a target click arms the shot regardless of hover, and the second click or Enter path fires it', async () => {
    const { clickUnit, fireArmed } = await import('../../src/client/interaction/actions')
    const p = pend('shoot.batch', [
      opt('g>t1', 'shoot.batch', { unitId: 'A1', weaponId: 'g', targetUnitId: 't1' }), opt('g>t2', 'shoot.batch', { unitId: 'A1', weaponId: 'g', targetUnitId: 't2' }),
      opt('done', 'shoot.batch', { unitId: 'A1', done: true }),
    ])
    draft.sync('d1')
    clickUnit(p, 't2')
    expect(useDraft.getState().armed).toEqual({ unitId: 't2', weaponId: 'g' })
    expect(fireArmed(p)).toBeNull() // no game running: returns null without throwing; armed stays until the engine answers
  })

  it('INT-051 the odds slot is always rendered at a fixed height (no hover layout loop)', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync('src/client/interaction/interaction.css', 'utf8')
    expect(css).toMatch(/\.ix-slot\s*\{[^}]*height:\s*\d+px/)
    const tsx = readFileSync('src/client/interaction/Prompt.tsx', 'utf8')
    expect(tsx.match(/className="ix-slot"/g)?.length).toBe(2)
  })

  it('INT-052 the panel docks away from what the player must click', async () => {
    const { dockSide, sideName } = await import('../../src/client/interaction/attention')
    expect(dockSide([{ x: -10, z: 0 }, { x: -6, z: 3 }])).toBe('right')
    expect(dockSide([{ x: 12, z: 0 }])).toBe('left')
    expect(sideName({ x: 0, z: -22 }, { w: 60, d: 44 })).toBe('top')
    expect(sideName({ x: -30, z: 0 }, { w: 60, d: 44 })).toBe('left')
  })

  it('INT-053 rejections carry numbers and names', async () => {
    const { explainRejection } = await import('../../src/client/interaction/text')
    expect(explainRejection(null, 'E_TOO_FAR', 'That is too far.', 'path 5.80" exceeds 2.4"', 'top edge')).toBe('Too far: 5.8" from the top edge, the most allowed is 2.4".')
    expect(explainRejection(null, 'E_TOO_FAR', 'That is too far.', 'path 9.00" exceeds 6"', null)).toContain('9" and the most allowed is 6"')
    expect(explainRejection(null, 'E_PATH_BLOCKED', 'The way is blocked.', 'blocked by T3', null)).toContain('blocked by T3')
  })
})
