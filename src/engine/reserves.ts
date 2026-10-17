// Checklist: DEP (DEP-001..010), RES, XPORT, ZOI, SUP-020/030 (arrival gate), CA-013 (end-of-round drops). Owner M.
// reserves.ts: Reserves is the one container (spec 00 s4). arrive(unit, entry) runs supply.canArrive, the Zone of
// Influence ban and movement.reposition(kind deploy), then fires onArrive {entry}. Delayed arrivals are rows in
// state.arrivals resolved at Scoring step 4, First Player Marker holder first. Namespace 'deploy'
// (a deploy.go; k deploy.entry, deploy.path).
import type { EditionBundle, Id } from '../data/types'
import { allAbilities, deploymentDef, segmentToWorld, tokenDef, unitDef } from './edition'
import * as effects from './effects'
import { isRejection, reject, TodoError } from './errors'
import { baseRadius, dist, edgeDistance } from './geometry'
import { runHook, type HookCtx } from './hooks'
import { inEnemyZoneOf } from './measure'
import { closedEdges } from './code-hooks'
import { firePending, moveReach, reposition, type PendingHook, type RepositionResult, type RepositionSpec } from './movement'
import { option, pushEvents, raiseDecision, updateModel, updateUnit, type ActionDone, type ModuleDef, type StepResult } from './registry'
import { canArrive, supplyFor } from './supply'
import { leadingModel, unitDefOf, unitModels } from './squads'
import { levelOfBase } from './terrain'
import type { ArrivalEntry, ArrivalRow, Colour, GameState, Rejection, SeatId, UnitId, Vec2 } from './types'

const outward: Record<'N' | 'S' | 'E' | 'W', Vec2> = { N: { x: 0, z: -1 }, S: { x: 0, z: 1 }, W: { x: -1, z: 0 }, E: { x: 1, z: 0 } }

/** Is any part of a base at `pos` inside an enemy Zone of Influence of `seat`'s opponent (ZOI-002/003)? */
export function inEnemyZone(state: GameState, bundle: EditionBundle, seat: SeatId, pos: Vec2, baseMm: number): boolean {
  return inEnemyZoneOf(state, bundle, seat, pos, baseMm)
}

/** The altEntry effect (`kind: 'unitBase'`) of a unit, if its card has one: Pylon, Omega Worm. */
function altEntryOf(state: GameState, bundle: EditionBundle, unitId: UnitId): { cap: number | null; tags: string[] } | null {
  const u = state.units[unitId]
  const def = u ? unitDef(bundle, u.profileId) : undefined
  if (!u || !def) return null
  for (const a of allAbilities(def, u.upgrades.map((x) => x.id))) {
    for (const n of a.effects) {
      if (n.op === 'altEntry' && n['kind'] === 'unitBase') {
        const f = n['filter'] as { tags?: string[] } | undefined
        return { cap: typeof n['supplyCapPerRound'] === 'number' ? (n['supplyCapPerRound'] as number) : null, tags: f?.tags ?? [] }
      }
    }
  }
  return null
}

/** Live altEntry effects of one kind on a unit (Warp In, Barracks (Proxy): nonEntryEdge; Void Seeker: deployNow). */
function liveAlt(state: GameState, bundle: EditionBundle, unitId: UnitId, kind: string): { minEnemyDist: number | null }[] {
  return effects.effectOps(state, bundle, unitId, 'altEntry').filter((l) => l.rec.kind === kind)
    .map((l) => ({ minEnemyDist: typeof l.rec.minEnemyDist === 'number' ? l.rec.minEnemyDist : null }))
}
/** Table edges (N, S, E, W) an enemy of `seat` has closed to its Deploys (Comsat Station). */
const edgeClosedTo = (state: GameState, seat: SeatId, letter: string): boolean => closedEdges(state).some((c) => c.edge === letter && c.owner !== seat)

/** Where the Leading Model's base starts: touching the entry (just outside the edge line, or against the friendly base). */
function startPoint(state: GameState, bundle: EditionBundle, seat: SeatId, entry: ArrivalEntry, toward: Vec2, r: number): Vec2 | Rejection {
  const colour = state.seats[seat]?.colour
  switch (entry.kind) {
    case 'edge':
    case 'place': {
      if (entry.kind === 'place' && entry.ref) {
        const near = unitModels(state, entry.ref).filter((m) => !m.offTable).sort((a, b) => dist(a.pos, toward) - dist(b.pos, toward))[0]
        return near ? { ...near.pos } : reject('E_BAD_TARGET', 'The unit to place from is not on the table.')
      }
      const dep = state.deploymentId ? deploymentDef(bundle, state.deploymentId) : undefined
      if (!colour || !dep) return reject('E_NOT_LEGAL', 'There is no Deployment Card with Entry Edges.')
      const segs = dep.entryEdges[colour]
      // no segment named (a PLACE that starts at the Entry Edge): the segment closest to where the unit is headed
      const named = typeof entry.segment === 'number' ? [segs[entry.segment]] : segs
      if (!named.length || named.some((x) => !x)) return reject('E_BAD_PARAM', 'That Entry Edge segment does not exist.')
      const picks = named.filter((x) => !edgeClosedTo(state, seat, x!.edge))
      if (!picks.length) return reject('E_NOT_LEGAL', 'That table edge is closed to your Deploys this Round.')
      let best: Vec2 | null = null
      for (const seg of picks) {
        const [a, b] = segmentToWorld(seg!, dep.size)
        const p = onSegment(a, b, outward[seg!.edge], toward, r)
        if (!best || dist(p, toward) < dist(best, toward)) best = p
      }
      return best!
    }
    case 'nonEntryEdge': {
      const side = entry.segment
      if (side !== 'N' && side !== 'S' && side !== 'E' && side !== 'W') return reject('E_BAD_PARAM', 'A table-edge arrival names N, S, E or W.')
      if (edgeClosedTo(state, seat, side)) return reject('E_NOT_LEGAL', 'That table edge is closed to your Deploys this Round.')
      const { w, d } = state.scenario.table
      const pts: Record<'N' | 'S' | 'E' | 'W', [Vec2, Vec2]> = {
        N: [{ x: -w / 2, z: -d / 2 }, { x: w / 2, z: -d / 2 }], S: [{ x: -w / 2, z: d / 2 }, { x: w / 2, z: d / 2 }],
        W: [{ x: -w / 2, z: -d / 2 }, { x: -w / 2, z: d / 2 }], E: [{ x: w / 2, z: -d / 2 }, { x: w / 2, z: d / 2 }],
      }
      return onSegment(pts[side][0], pts[side][1], outward[side], toward, r)
    }
    case 'friendlyEdge': {
      const base = entry.ref ? unitModels(state, entry.ref).find((m) => !m.offTable) : undefined
      if (!base) return reject('E_BAD_TARGET', 'The friendly entry base is not on the table.')
      const d = dist(base.pos, toward) || 1
      const gap = baseRadius(base.base) + r
      return { x: base.pos.x + ((toward.x - base.pos.x) / d) * gap, z: base.pos.z + ((toward.z - base.pos.z) / d) * gap }
    }
    case 'indicator': {
      const tk = state.tokens.find((t) => t.id === entry.ref)
      if (!tk) return reject('E_BAD_TARGET', 'That indicator is not on the table.')
      return { ...toward }
    }
  }
}

/** The point on segment a-b nearest to `toward`, pushed `r` outward so a base of radius r touches the edge. */
function onSegment(a: Vec2, b: Vec2, out: Vec2, toward: Vec2, r: number): Vec2 {
  const ab = { x: b.x - a.x, z: b.z - a.z }
  const l2 = ab.x * ab.x + ab.z * ab.z
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((toward.x - a.x) * ab.x + (toward.z - a.z) * ab.z) / l2))
  return { x: a.x + ab.x * t + out.x * r, z: a.z + ab.z * t + out.z * r }
}

/** Bring a Reserves unit onto the table by `entry` (spec 16 s8). */
export function arrive(state: GameState, bundle: EditionBundle, unitId: UnitId, entry: ArrivalEntry,
  spec: Omit<RepositionSpec, 'kind'>): RepositionResult | Rejection {
  const unit = state.units[unitId]
  if (!unit) return reject('E_BAD_TARGET', `Unit ${unitId} is not in the game.`)
  if (unit.location !== 'reserves') return reject('E_NOT_LEGAL', 'Only a unit in Reserves can arrive.')
  const seat = unit.owner
  if (!canArrive(state, bundle, seat, unitId)) return reject('E_NO_SUPPLY', 'Its Supply does not fit in the Available Supply.')
  const leader = state.models[spec.leaderId]
  if (!leader || leader.unitId !== unitId || leader.life === 'dead') return reject('E_BAD_PARAM', 'The Leading Model must be a live model of the unit.')
  const first = spec.path[0]
  if (!first) return reject('E_BAD_PARAM', 'A path needs at least one point.')

  // a table edge that is not an Entry Edge needs a card's permission (Warp In, Barracks (Proxy); DEP-004)
  if (entry.kind === 'nonEntryEdge' && !liveAlt(state, bundle, unitId, 'nonEntryEdge').length) return reject('E_NOT_LEGAL', 'No card lets this unit arrive from a table edge that is not an Entry Edge.')
  let cap: { baseUnit: UnitId; cap: number; used: number } | null = null
  if (entry.kind === 'friendlyEdge') {
    const baseUnit = entry.ref ? state.units[entry.ref] : undefined
    const alt = entry.ref ? altEntryOf(state, bundle, entry.ref) : null
    if (!entry.ref || !baseUnit || baseUnit.owner !== seat || baseUnit.location !== 'table' || !alt) {
      return reject('E_NOT_LEGAL', 'That is not one of your units that works as an entry point.')
    }
    const tags = unitDefOf(state, bundle, unitId)?.combatTags ?? []
    if (alt.tags.some((t) => !tags.includes(t as never))) return reject('E_NOT_LEGAL', 'That entry point does not take this kind of unit.')
    if (alt.cap !== null) {
      const used = baseUnit.usage[`altEntry:round:${state.round}`] ?? 0
      const csv = supplyFor(state, bundle, unitId, 'pool')
      if (used + csv > alt.cap) return reject('E_NO_SUPPLY', `That entry point takes at most ${alt.cap} Supply per Round.`)
      cap = { baseUnit: entry.ref, cap: alt.cap, used }
    }
  }
  const from = startPoint(state, bundle, seat, entry, first, baseRadius(leader.base))
  if (isRejection(from)) return from
  if (entry.kind === 'indicator') {
    const tk = state.tokens.find((t) => t.id === entry.ref)!
    const def = tokenDef(bundle, null, tk.defId)
    if (edgeDistance(first, leader.base, tk.pos, def?.baseMm ?? 0) > 0.05) return reject('E_PLACEMENT', 'The Leading Model must stand in base contact with the indicator.')
  }
  const kind = entry.kind === 'place' ? 'place' : 'deploy'
  // a table-edge entry granted by a card keeps its own distance from enemies (Warp In, Barracks (Proxy))
  const alt = entry.kind === 'nonEntryEdge' ? liveAlt(state, bundle, unitId, 'nonEntryEdge') : []
  const keepAway = Math.max(spec.minEnemyDist ?? -Infinity, ...alt.map((a) => a.minEnemyDist ?? -Infinity))
  const returnTo = spec.returnTo ?? 'deploy'
  const r = reposition(state, bundle, unitId, { ...spec, kind, from, banZone: true, returnTo, ...(Number.isFinite(keepAway) ? { minEnemyDist: keepAway } : {}) })
  if (isRejection(r)) return r
  if (entry.kind === 'friendlyEdge' && entry.ref) {
    // a unit deploys only onto the same elevation as the base it deploys through (ELEV-006)
    const baseM = unitModels(state, entry.ref)[0]
    const lv = baseM ? levelOfBase(r.state, baseM.pos, baseRadius(baseM.base)) : 0
    const bad = unitModels(r.state, unitId).find((m) => levelOfBase(r.state, m.pos, baseRadius(m.base)) !== lv)
    if (bad) return reject('E_PLACEMENT', `Model ${bad.id} would stand on a different level from the entry base.`)
  }
  let s = r.state
  if (cap) s = updateUnit(s, cap.baseUnit, { usage: { ...s.units[cap.baseUnit]!.usage, [`altEntry:round:${s.round}`]: cap.used + supplyFor(s, bundle, unitId, 'pool') } })
  // a deployNow permission is spent by the arrival
  s = effects.removeEffects(s, unitId, (e) => e.kind === 'mod' && (e.data as { op?: string; kind?: string } | undefined)?.op === 'altEntry' && (e.data as { kind?: string }).kind === 'deployNow')
  const arrivedCtx: HookCtx = { seat, unitId, entry, modelIds: unitModels(s, unitId).map((m) => m.id), phase: s.roundPhase ?? undefined, cause: 'arrived', kind: kind, returnTo }
  // a Reaction window opened by the reposition's own end hooks: the Arrived hook waits behind it (the caller's resume() fires it)
  if (r.raised) return { ...r, state: s, pending: [...(r.pending ?? []), { point: 'onArrive', ctx: arrivedCtx }] }
  const h = runHook(s, bundle, 'onArrive', arrivedCtx)
  return { ...r, state: h.state, ...(h.raised ? { raised: true } : {}) }
}

/** Return a unit to Reserves (XPORT-001): models off the table, effects keep their clocks, no Supply loss (R15-1). */
export function returnToReserves(state: GameState, bundle: EditionBundle, unitId: UnitId, source: Id): GameState {
  const u = state.units[unitId]
  if (!u) return state
  let s = state
  for (const m of unitModels(s, unitId)) s = updateModel(s, m.id, { offTable: true })
  // tokens it placed go, except STAY IN PLAY ones (RES-003)
  const keep = s.tokens.filter((t) => {
    if (t.sourceId !== unitId) return true
    const owner = unitDef(bundle, u.profileId) ?? null
    return tokenDef(bundle, owner, t.defId)?.stayInPlay === true || effects.tokenGrants(s, bundle, t, 'STAY_IN_PLAY')
  })
  s = { ...s, tokens: keep }
  // SIEGE MODE is lost (RES-002); the rest of the Effect list keeps counting down
  s = effects.removeEffects(s, unitId, (e) => e.kind === 'status' && e.status === 'SIEGE_MODE')
  s = updateUnit(s, unitId, { location: 'reserves' })
  return pushEvents(s, [{ type: 'returnedToReserves', unitId, source }])
}

/** Queue a delayed arrival (Faction Indicator drop). */
export function queueArrival(state: GameState, row: Omit<ArrivalRow, 'id'>): GameState {
  const id = `arrival:${row.round}:${state.arrivals.length + 1}`
  return { ...state, arrivals: [...state.arrivals, { ...row, id }] }
}

const droppable = (state: GameState, bundle: EditionBundle, seat: SeatId): UnitId[] =>
  Object.values(state.units).filter((u) => u.owner === seat && u.location === 'reserves' && canArrive(state, bundle, seat, u.id)
    && (unitDefOf(state, bundle, u.id)?.combatTags.includes('ground') ?? false)).map((u) => u.id)

/** Scoring step 4: resolve state.arrivals, holder of the First Player Marker first. Each row raises `deploy.drop` (the
 *  owner nominates a Ground unit from Reserves, or none) and then `deploy.path`. A row nobody can use is wasted. When the
 *  queue is empty it returns `done` with type 'deploy.arrivals' so scoring can go on to step 5. */
export function resolveArrivals(state: GameState, bundle: EditionBundle): StepResult {
  let s = state
  const order = (seat: SeatId): number => (seat === s.firstPlayer ? 0 : 1)
  for (;;) {
    const row = [...s.arrivals].sort((a, b) => order(a.seat) - order(b.seat))[0]
    if (!row) return { state: s, done: { modelId: '', type: 'deploy.arrivals', triggers: [] } }
    const pool = row.unitId ? [row.unitId] : droppable(s, bundle, row.seat)
    const left = (st: GameState): GameState => ({ ...st, arrivals: st.arrivals.filter((a) => a.id !== row.id) })
    if (!pool.length) { s = pushEvents(left(s), [{ type: 'dropWasted', rowId: row.id }]); continue }
    return {
      state: raiseDecision(s, {
        seat: row.seat, kind: 'deploy.drop', canPass: true, context: { rowId: row.id, source: row.source },
        options: [
          ...pool.map((id) => option(`drop:${id}`, `Drop ${id}`, 'deploy.drop', { rowId: row.id, unitId: id }, row.seat)),
          option('skip', 'Do not drop a unit', 'deploy.skip', { rowId: row.id }, row.seat),
        ],
      }),
    }
  }
}

// ---------------------------------------------------------------- the deploy module (menu entries and decisions)
function entryOptions(state: GameState, bundle: EditionBundle, unitId: UnitId) {
  const u = state.units[unitId]!
  const colour: Colour | null | undefined = state.seats[u.owner]?.colour
  const dep = state.deploymentId ? deploymentDef(bundle, state.deploymentId) : undefined
  const out = [] as ReturnType<typeof option>[]
  if (colour && dep) {
    dep.entryEdges[colour].forEach((seg, i) => {
      if (edgeClosedTo(state, u.owner, seg.edge)) return
      out.push(option(`edge:${i}`, `Entry Edge ${i + 1}`, 'deploy.entry', { unitId, entry: { kind: 'edge', segment: i } }, u.owner))
    })
    // a card (Warp In, Barracks (Proxy)) lets a Ground unit come in from any other table edge, clear of enemies
    if (liveAlt(state, bundle, unitId, 'nonEntryEdge').length) {
      const own = new Set(dep.entryEdges[colour].map((x) => x.edge))
      for (const side of ['N', 'S', 'E', 'W'] as const) {
        if (own.has(side) || edgeClosedTo(state, u.owner, side)) continue
        out.push(option(`side:${side}`, `Table edge ${side}`, 'deploy.entry', { unitId, entry: { kind: 'nonEntryEdge', segment: side } }, u.owner))
      }
    }
  }
  for (const b of Object.values(state.units)) {
    if (b.owner === u.owner && b.location === 'table' && altEntryOf(state, bundle, b.id)) {
      out.push(option(`friendly:${b.id}`, `Through ${b.id}`, 'deploy.entry', { unitId, entry: { kind: 'friendlyEdge', ref: b.id } }, u.owner))
    }
  }
  return out
}

/** Leading Model destinations to try for an entry: points along the Entry Edge segment (or table edge) headed inward,
 *  rings round a friendly entry base, base contact round an indicator. Each is checked with the real arrive(). */
function entryAims(state: GameState, bundle: EditionBundle, unitId: UnitId, entry: ArrivalEntry, move: number, leaderR: number): Vec2[] {
  const u = state.units[unitId]!
  const out: Vec2[] = []
  const along = (a: Vec2, b: Vec2, side: 'N' | 'S' | 'E' | 'W') => {
    const inward = { x: -outward[side].x, z: -outward[side].z }
    for (const f of [1, 0.6, 0.3]) for (const t of [0.5, 0.25, 0.75, 0.1, 0.9]) {
      const aim = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
      out.push({ x: aim.x + inward.x * move * f, z: aim.z + inward.z * move * f })
    }
  }
  const ring = (c: Vec2, radii: number[]) => {
    for (const rr of radii) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 2 * Math.PI
      out.push({ x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr })
    }
  }
  if (entry.kind === 'edge' || (entry.kind === 'place' && !entry.ref)) {
    const dep = state.deploymentId ? deploymentDef(bundle, state.deploymentId) : undefined
    const colour = state.seats[u.owner]?.colour
    if (!dep || !colour) return out
    dep.entryEdges[colour].forEach((seg, i) => {
      if (typeof entry.segment === 'number' && entry.segment !== i) return
      const [a, b] = segmentToWorld(seg, dep.size)
      along(a, b, seg.edge)
    })
  } else if (entry.kind === 'nonEntryEdge') {
    const side = entry.segment
    if (side !== 'N' && side !== 'S' && side !== 'E' && side !== 'W') return out
    const { w, d } = state.scenario.table
    const pts: Record<'N' | 'S' | 'E' | 'W', [Vec2, Vec2]> = {
      N: [{ x: -w / 2, z: -d / 2 }, { x: w / 2, z: -d / 2 }], S: [{ x: -w / 2, z: d / 2 }, { x: w / 2, z: d / 2 }],
      W: [{ x: -w / 2, z: -d / 2 }, { x: -w / 2, z: d / 2 }], E: [{ x: w / 2, z: -d / 2 }, { x: w / 2, z: d / 2 }],
    }
    along(pts[side][0], pts[side][1], side)
  } else if (entry.kind === 'friendlyEdge' || entry.kind === 'place') {
    const base = entry.ref ? unitModels(state, entry.ref).find((m) => !m.offTable) : undefined
    if (base) { const g = baseRadius(base.base) + leaderR; ring(base.pos, [g + move, g + move * 0.6, g + move * 0.3]) }
  } else if (entry.kind === 'indicator') {
    const tk = state.tokens.find((t) => t.id === entry.ref)
    if (tk) ring(tk.pos, [baseRadius(tokenDef(bundle, null, tk.defId)?.baseMm ?? 0) + leaderR + 0.02])
  }
  return out
}

/** Up to `n` complete deploy answers (Leading Model and a one-point path) that arrive() accepts for this entry. The
 *  deploy.path decision offers them ready-made so every legal option validates as given (spec 00 s3.1). */
export function deployAnswers(state: GameState, bundle: EditionBundle, unitId: UnitId, entry: ArrivalEntry, n = 6): { leaderId: string; path: Vec2[] }[] {
  const leader = leadingModel(state, unitId)
  const reach = moveReach(state, bundle, unitId)
  if (!leader || !reach || !state.units[unitId]) return []
  const out: { leaderId: string; path: Vec2[] }[] = []
  for (const dest of entryAims(state, bundle, unitId, entry, reach.move, baseRadius(leader.base))) {
    const r = arrive(state, bundle, unitId, entry, { leaderId: leader.id, path: [dest], maxDist: reach.move })
    if (!isRejection(r)) { out.push({ leaderId: leader.id, path: [dest] }); if (out.length >= n) break }
  }
  return out
}

/** Is there a way in? Any entry with at least one deploy answer. */
function canDeployNow(state: GameState, bundle: EditionBundle, unitId: UnitId): boolean {
  return entryOptions(state, bundle, unitId).some((o) => deployAnswers(state, bundle, unitId, o.action['entry'] as ArrivalEntry, 1).length > 0)
}

const isVec = (v: unknown): v is Vec2 => !!v && typeof (v as Vec2).x === 'number' && typeof (v as Vec2).z === 'number'

/** Raise deploy.path with ready answers; for a drop row with no way in, the only option is to skip the row. */
function pathDecision(state: GameState, bundle: EditionBundle, unitId: UnitId, entry: ArrivalEntry, extra: Record<string, unknown> = {}): GameState {
  const u = state.units[unitId]!
  const answers = deployAnswers(state, bundle, unitId, entry)
  const fields = { unitId, entry, ...extra }
  return raiseDecision(state, {
    seat: u.owner, kind: 'deploy.path', canPass: false, context: fields,
    options: [
      ...(answers.length ? [option('path', 'Choose where the Leading Model goes', 'deploy.path', fields, u.owner)] : []),
      ...answers.map((a, i) => option(`path:${i}`, `Enter to (${a.path[0]!.x.toFixed(1)}, ${a.path[0]!.z.toFixed(1)})`, 'deploy.path', { ...fields, leaderId: a.leaderId, path: a.path }, u.owner)),
      ...(!answers.length && typeof extra['rowId'] === 'string' ? [option('skip', 'No room: do not drop', 'deploy.skip', { rowId: extra['rowId'] }, u.owner)] : []),
    ],
  })
}

/** The entry decision for a unit that deploys now (a Deploy action, or Personal Transport's "redeploys at once"). Only entries
 *  with a way in are offered, so the next decision is never a dead end. */
export function raiseEntry(state: GameState, bundle: EditionBundle, unitId: UnitId): StepResult {
  const u = state.units[unitId]
  if (!u) return reject('E_BAD_PARAM', 'The action needs a unitId.')
  const opts = entryOptions(state, bundle, unitId).filter((o) => deployAnswers(state, bundle, unitId, o.action['entry'] as ArrivalEntry, 1).length > 0)
  if (!opts.length) return reject('E_NOT_LEGAL', 'There is no entry point to deploy from.')
  return { state: raiseDecision(state, { seat: u.owner, kind: 'deploy.entry', canPass: false, context: { unitId }, options: opts }) }
}

/** Personal Transport: the unit is in Reserves with a live deployNow permission, so it redeploys at once (raises deploy.entry).
 *  Null when it has none or no way in. The ability interpreter calls it right after returnToReserves + altEntry. */
export function raiseDeployNow(state: GameState, bundle: EditionBundle, unitId: UnitId): GameState | null {
  const u = state.units[unitId]
  if (!u || u.location !== 'reserves' || !liveAlt(state, bundle, unitId, 'deployNow').length) return null
  const r = raiseEntry(state, bundle, unitId)
  return isRejection(r) ? null : r.state
}

type DeployStage = { type: 'deploy.stage'; stage: 'nominated' | 'arrived'; unitId: UnitId; entry?: ArrivalEntry; leaderId?: string; pending?: PendingHook[]; rowId?: string }
const lastStage = (state: GameState): DeployStage | undefined => {
  for (let i = state.events.length - 1; i >= 0; i--) if (state.events[i]!.type === 'deploy.stage') return state.events[i] as unknown as DeployStage
  return undefined
}

/** The nomination is over: a replaced entry (the Unit is on the table now) ends the Deploy; otherwise the normal entry follows.
 *  For an End-of-Round drop row (`rowId`) the row is spent by a replaced entry, and the row's own entry follows otherwise. */
function afterNomination(state: GameState, bundle: EditionBundle, unitId: UnitId, rowId?: string): StepResult {
  if (rowId !== undefined) {
    if (state.units[unitId]?.location === 'table') return resolveArrivals({ ...state, arrivals: state.arrivals.filter((a) => a.id !== rowId) }, bundle)
    const row = state.arrivals.find((a) => a.id === rowId)
    if (!row) return resolveArrivals(state, bundle)
    return { state: pathDecision(state, bundle, unitId, row.entry, { rowId }) }
  }
  if (state.units[unitId]?.location === 'table') {
    return { state, done: { modelId: leadingModel(state, unitId)?.id ?? '', unitId, type: 'deploy.go', triggers: [{ kind: 'arrived', sourceId: unitId }] } }
  }
  return raiseEntry(state, bundle, unitId)
}

const arrivalDone = (unitId: UnitId, leaderId: string, entry: ArrivalEntry): ActionDone =>
  ({ modelId: leaderId, unitId, type: 'deploy.go', triggers: [{ kind: 'arrived', sourceId: unitId }], ...(entry.kind === 'friendlyEdge' ? { endsActivation: true } : {}) })

/** An arrival's end is reached (hooks done): an End-of-Round row is spent and the next one follows; a Deploy action is done
 *  (through a friendly base it ends the activation at once, DEP-010). */
function finishArrival(state: GameState, bundle: EditionBundle, unitId: UnitId, leaderId: string, entry: ArrivalEntry, rowId: unknown): StepResult {
  if (typeof rowId === 'string') return resolveArrivals({ ...state, arrivals: state.arrivals.filter((a) => a.id !== rowId) }, bundle)
  return { state, done: arrivalDone(unitId, leaderId, entry) }
}

export const reserves: ModuleDef = {
  id: 'reserves',
  kinds: ['deploy'],
  options: (state, bundle, unitId) => {
    const u = state.units[unitId]
    // Personal Transport lets the active unit deploy at once, whatever the Phase and its activation say
    const now = !!u && state.activeUnit === unitId && u.location === 'reserves' && liveAlt(state, bundle, unitId, 'deployNow').length > 0
    if (!u || u.location !== 'reserves' || (!now && (state.roundPhase !== 'movement' || u.activation !== null))) return []
    try {
      if (!canArrive(state, bundle, u.owner, unitId) || !canDeployNow(state, bundle, unitId)) return []
    } catch (e) { if (e instanceof TodoError) return []; throw e }
    return [option('deploy', 'Deploy', 'deploy.go', { unitId }, u.owner)]
  },
  resolve(state, bundle, action): StepResult {
    const unitId = action['unitId'] as string | undefined
    switch (action.type) {
      case 'deploy.go': {
        if (typeof unitId !== 'string' || !state.units[unitId]) return reject('E_BAD_PARAM', 'The action needs a unitId.')
        // the Unit is nominated first: Burrow Ambush, Rapid Reinforcements and Phase Prism may replace the normal entry (their
        // PLACE drives arrive({kind:'place'}) from this hook)
        const nominee = state.units[unitId]!
        const h = runHook(state, bundle, 'onArrive', { seat: nominee.owner, unitId, cause: 'nominatedToDeploy', phase: state.roundPhase ?? undefined, returnTo: 'deploy' })
        if (h.raised) return { state: pushEvents(h.state, [{ type: 'deploy.stage', stage: 'nominated', unitId }]) }
        return afterNomination(h.state, bundle, unitId)
      }
      case 'deploy.entry': {
        if (typeof unitId !== 'string' || !state.units[unitId]) return reject('E_BAD_PARAM', 'The action needs a unitId.')
        return { state: pathDecision(state, bundle, unitId, action['entry'] as ArrivalEntry) }
      }
      case 'deploy.path': {
        const entry = action['entry'] as ArrivalEntry
        let leaderId = action['leaderId'], path = action['path']
        if (typeof unitId === 'string' && state.units[unitId] && leaderId === undefined && path === undefined && entry) {
          // the open template sent without a path takes the first ready answer
          const first = deployAnswers(state, bundle, unitId, entry, 1)[0]
          if (!first) return reject('E_NOT_LEGAL', 'There is no room to enter there.')
          leaderId = first.leaderId; path = first.path
        }
        if (typeof unitId !== 'string' || !state.units[unitId] || typeof leaderId !== 'string' || !Array.isArray(path) || !path.every(isVec)) {
          return reject('E_BAD_PARAM', 'A deploy answer needs unitId, leaderId and a list of points.')
        }
        const reach = moveReach(state, bundle, unitId)
        if (!reach) return reject('E_NOT_LEGAL', 'That unit cannot move.')
        const placement = action['placement']
        const r = arrive(state, bundle, unitId, entry, {
          leaderId, path: path as Vec2[], maxDist: reach.move,
          ...(placement && typeof placement === 'object' ? { placement: placement as Record<string, Vec2> } : {}),
        })
        if (isRejection(r)) return r
        const rowId = action['rowId']
        // a Reaction window opened at an end hook: stop here; resume() fires what is left and finishes
        if (r.raised) {
          const stage = { type: 'deploy.stage', stage: 'arrived', unitId, entry, leaderId, ...(r.pending ? { pending: r.pending } : {}), ...(typeof rowId === 'string' ? { rowId } : {}) }
          return { state: pushEvents(r.state, [stage]) }
        }
        return finishArrival(r.state, bundle, unitId, leaderId, entry, rowId)
      }
      case 'deploy.drop': {
        const rowId = action['rowId']
        const row = state.arrivals.find((a) => a.id === rowId)
        if (!row || typeof unitId !== 'string' || !state.units[unitId]) return reject('E_BAD_PARAM', 'That drop is not queued.')
        // the dropped Unit is nominated like any Deploy (Burrow Ambush, Rapid Reinforcements may replace the entry)
        const h = runHook(state, bundle, 'onArrive', { seat: state.units[unitId]!.owner, unitId, cause: 'nominatedToDeploy', phase: state.roundPhase ?? undefined, returnTo: 'deploy' })
        if (h.raised) return { state: pushEvents(h.state, [{ type: 'deploy.stage', stage: 'nominated', unitId, rowId: row.id }]) }
        return afterNomination(h.state, bundle, unitId, row.id)
      }
      case 'deploy.skip': {
        const s = { ...state, arrivals: state.arrivals.filter((a) => a.id !== action['rowId']) }
        return resolveArrivals(s, bundle)
      }
      default:
        return reject('E_UNKNOWN_KIND', `Reserves does not handle ${action.type}.`)
    }
  },
  /** Back from a Reaction window opened by the nomination (stage 'nominated') or at the end of an arrival (stage 'arrived'). */
  resume(state, bundle): StepResult {
    const st = lastStage(state)
    if (!st) return { state, done: { modelId: '', ...(state.activeUnit ? { unitId: state.activeUnit } : {}), type: 'deploy.resume', triggers: [] } }
    if (st.stage === 'nominated') return afterNomination(state, bundle, st.unitId, st.rowId)
    let s = state
    if (st.pending?.length) {
      const f = firePending(s, bundle, st.pending, 'deploy')
      if (f.raised) return { state: pushEvents(f.state, [{ ...st, pending: f.rest }]) }
      s = f.state
    }
    return finishArrival(s, bundle, st.unitId, st.leaderId ?? '', st.entry ?? { kind: 'edge' }, st.rowId)
  },
}

