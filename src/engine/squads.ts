// Checklist: COH (COH-001..008), part of MOVE (formation placer), DMG-010 (unit-level lookups). Owner M.
// squads.ts: UnitState helpers. unitModels() is the ONLY way to list a unit's models (spec 00 s4; Mallet state.ts shape);
// coherencyState() is the BFS from the Leading Model (Squadron: coherency op d/axis); placeFormation() is the one
// placer every reposition and arrival uses after the Leading Model is set. Service: no decisions.
import type { EditionBundle, Id, UnitDef } from '../data/types'
import { allAbilities, rule, tokenDef, unitDef } from './edition'
import * as effects from './effects'
import { modelsEngaged } from './engage'
import { baseOnTable, baseRadius, MM_PER_INCH, dist, edgeDistance, EPS, isOnTable, segPointDist } from './geometry'
import { endBlockers, inOpening, isSolid, scPieces, segmentCrosses, surfaceAt, type ScPiece } from './terrain'
import type { GameState, ModelId, ModelState, UnitId, UnitState, Vec2 } from './types'

// ---------------------------------------------------------------- unit and model lookups
/** The unit's models in muster order; live ones only unless includeDead. */
export function unitModels(state: GameState, unitId: UnitId, opts: { includeDead?: boolean } = {}): ModelState[] {
  const u = state.units[unitId]
  if (!u) return []
  const out: ModelState[] = []
  for (const id of u.modelIds) {
    const m = state.models[id]
    if (m && (opts.includeDead || m.life !== 'dead')) out.push(m)
  }
  return out
}

/** The unit a model belongs to. */
export function unitOf(state: GameState, modelId: ModelId): UnitState | undefined {
  const m = state.models[modelId]
  return m ? state.units[m.unitId] : undefined
}

/** The Leading Model, falling back to the first live model when the stored one is gone. */
export function leadingModel(state: GameState, unitId: UnitId): ModelState | null {
  const u = state.units[unitId]
  if (!u) return null
  const stored = u.leadingModelId ? state.models[u.leadingModelId] : undefined
  if (stored && stored.life !== 'dead') return stored
  return unitModels(state, unitId)[0] ?? null
}

/** Live model count (drives the Supply bracket). */
export function liveModelCount(state: GameState, unitId: UnitId): number {
  return unitModels(state, unitId).length
}

/** Live models standing on the table (not in Reserves, not off the board). */
export function tableModels(state: GameState, unitId: UnitId): ModelState[] {
  return unitModels(state, unitId).filter(isOnTable)
}

// ---------------------------------------------------------------- facts read through the effect layer
export const unitDefOf = (state: GameState, bundle: EditionBundle, unitId: UnitId): UnitDef | undefined => {
  const u = state.units[unitId]
  return u ? unitDef(bundle, u.profileId) : undefined
}
export const modelDefOf = (bundle: EditionBundle, m: Pick<ModelState, 'profileId'>): UnitDef | undefined => unitDef(bundle, m.profileId)

/** Flying unit (combat tag; spec 14 s11). A model with no data record is Ground. */
export function isFlyingUnit(state: GameState, bundle: EditionBundle, unitId: UnitId): boolean {
  return unitDefOf(state, bundle, unitId)?.combatTags.includes('flying') ?? false
}
export function isFlyingModel(bundle: EditionBundle, m: ModelState): boolean {
  return modelDefOf(bundle, m)?.combatTags.includes('flying') ?? false
}

/** Does the unit have the status (BURROWED, HIDDEN...)? */
export function statusOn(state: GameState, unitId: UnitId, status: string): boolean {
  return effects.hasStatus(state, unitId, status)
}

/** Is the keyword on the unit (printed `grantKeyword` passives or granted by an Effect)? */
export function hasKeyword(state: GameState, bundle: EditionBundle, unitId: UnitId, kw: string): boolean {
  return effects.keywordOf(state, bundle, unitId, kw) !== null
}

/** Size of a unit (BURROWED counts 0 for every purpose, SIZE-001; a printed "-" counts 0). */
export function unitSize(state: GameState, bundle: EditionBundle, unitId: UnitId): number {
  if (statusOn(state, unitId, 'BURROWED')) return 0
  return effects.statOf(state, bundle, unitId, 'size') ?? 0
}
/** Size of a model through its unit; null when the model has no unit or no unit record (a data error the caller reports). */
export function modelSize(state: GameState, bundle: EditionBundle, m: ModelState): number | null {
  return state.units[m.unitId] && modelDefOf(bundle, m) ? unitSize(state, bundle, m.unitId) : null
}

/** Speed of the unit, null when it has "-" (MOVE-001). Split Speed "4/7": the second value only when the unit is, or
 *  started as, a single model (spec 14 s8.1); effects.statOf folds the buffs on whichever value applies. */
export function unitSpeed(state: GameState, bundle: EditionBundle, unitId: UnitId): number | null {
  const def = unitDefOf(state, bundle, unitId)
  const sp = def?.stats.speed ?? null
  if (sp === null) return null
  const u = state.units[unitId]
  const single = Array.isArray(sp) && (liveModelCount(state, unitId) <= 1 || (u?.modelIds.length ?? 2) <= 1)
  return effects.statOf(state, bundle, unitId, 'speed', single ? { run: true } : {})
}

// ---------------------------------------------------------------- data ops of a unit (passives, bought upgrades, effects)
export type OpNode = Record<string, unknown>
/** Every effect node with this op that applies to the unit right now: its printed passive abilities and the abilities of
 *  bought upgrades, plus Effects of kind 'mod' that carry such a data record. Nodes with a `when` condition are skipped
 *  here (conditions belong to the ability interpreter, which stores the resulting Effect on the unit). */
export function dataOps(state: GameState, bundle: EditionBundle, unitId: UnitId, op: string): OpNode[] {
  const u = state.units[unitId]
  const def = u ? unitDef(bundle, u.profileId) : undefined
  const out: OpNode[] = []
  if (u && def) {
    for (const a of allAbilities(def, u.upgrades.map((x) => x.id))) {
      if (a.type !== 'passive') continue
      for (const n of a.effects) if (n.op === op && !n.when) out.push(n as OpNode)
    }
  }
  for (const e of u?.effects ?? []) {
    const d = e.data as OpNode | undefined
    if (e.kind === 'mod' && d && d['op'] === op) out.push(d)
  }
  return out
}

/** Coherency distance of the unit: rules.json coherency, or the larger `coherency` op value (Squadron 4", COH-002). */
export function coherencyDistance(state: GameState, bundle: EditionBundle, unitId: UnitId): number {
  let d = rule(bundle, 'coherency')
  for (const n of dataOps(state, bundle, unitId, 'coherency')) if (typeof n['d'] === 'number') d = Math.max(d, n['d'] as number)
  return d
}

/** The unit's move-through allowances (Raptor Strain, burrowed Roach): impassable terrain up to maxSize, other units. */
export function moveThrough(state: GameState, bundle: EditionBundle, unitId: UnitId): { terrainMax: number | null; noAccess: boolean; units: boolean } {
  let terrainMax: number | null = null, noAccess = false, units = false
  const u = state.units[unitId]
  const def = u ? unitDef(bundle, u.profileId) : undefined
  const nodes: OpNode[] = dataOps(state, bundle, unitId, 'moveThrough')
  // nodes gated by `when: {status: [...]}` (burrowed Roach moves through units) are read against the live statuses
  if (u && def) {
    for (const a of allAbilities(def, u.upgrades.map((x) => x.id))) {
      if (a.type !== 'passive') continue
      for (const n of a.effects) {
        if (n.op !== 'moveThrough' || !n.when) continue
        const need = (n.when.status ?? []) as string[]
        if (need.length && need.every((s) => statusOn(state, unitId, s))) nodes.push(n as OpNode)
      }
    }
  }
  for (const n of nodes) {
    if (n['what'] === 'units') units = true
    if (n['what'] === 'impassable') {
      const mx = typeof n['maxSize'] === 'number' ? (n['maxSize'] as number) : Infinity
      terrainMax = terrainMax === null ? mx : Math.max(terrainMax, mx)
      if (n['noAccessPoints'] === true) noAccess = true
    }
  }
  return { terrainMax, noAccess, units }
}

// ---------------------------------------------------------------- tokens that act as terrain on the table
export interface TokenBody { id: Id; pos: Vec2; r: number; blocksMax: number | null; removedBy: 'movement' | 'place' | 'any' | null; displacement: boolean }
/** Tokens with a physical base (Creep Tumor, Force Field...): Size 0 terrain you cannot end on, or a Force Field wall. */
export function tokenBodies(state: GameState, bundle: EditionBundle): TokenBody[] {
  const out: TokenBody[] = []
  for (const t of state.tokens) {
    const source = t.sourceId ? state.units[t.sourceId] : undefined
    const def = tokenDef(bundle, source ? unitDef(bundle, source.profileId) ?? null : null, t.defId)
    if (!def) continue
    if (def.size === null && !def.terrain && !def.blocks) continue
    // no printed base: the 32 mm marker disc is the engine default for a token that has a body (see issues)
    const mm = def.baseMm ?? rule(bundle, 'markerDiameterMm')
    out.push({
      id: t.id, pos: t.pos, r: baseRadius(mm), blocksMax: def.blocks ? def.blocks.maxSize : null,
      removedBy: def.removedBy ?? (def.blocks?.removedByLarger ? 'movement' : null), displacement: def.displacement === true || effects.tokenGrants(state, bundle, t, 'DISPLACEMENT'),
    })
  }
  return out
}

// ---------------------------------------------------------------- coherency links
/** Everything a link or placement test needs about the world around one unit, built once per call. */
export interface SquadCtx {
  state: GameState
  bundle: EditionBundle
  unitId: UnitId
  owner: string
  flying: boolean
  /** The unit has LARGE: 3" gaps, and it flattens small impassable pieces it crosses or ends on (KW-086). */
  large: boolean
  /** Models of other units on the table (any owner), as circles. */
  foreign: { id: ModelId; unitId: UnitId; owner: string; pos: Vec2; r: number; flying: boolean; base: number; displace: boolean }[]
  pieces: ScPiece[]
  tokens: TokenBody[]
  /** The unit may pass solid terrain of this Size or less (Raptor Strain). */
  throughTerrainMax: number | null
  er: number
}

export function squadCtx(state: GameState, bundle: EditionBundle, unitId: UnitId): SquadCtx {
  const unit = state.units[unitId]
  const foreign: SquadCtx['foreign'] = []
  const pushable = new Map<UnitId, boolean>()
  for (const m of Object.values(state.models)) {
    if (m.unitId === unitId || !isOnTable(m)) continue
    // a model whose Unit has DISPLACEMENT (granted by its own card, Gliding) may be overlapped and is pushed aside (KW-042)
    if (!pushable.has(m.unitId)) pushable.set(m.unitId, hasKeyword(state, bundle, m.unitId, 'DISPLACEMENT'))
    foreign.push({ id: m.id, unitId: m.unitId, owner: m.owner, pos: m.pos, r: baseRadius(m.base), flying: isFlyingModel(bundle, m), base: m.base, displace: pushable.get(m.unitId)! })
  }
  return {
    state, bundle, unitId, owner: unit?.owner ?? '', flying: isFlyingUnit(state, bundle, unitId), large: hasKeyword(state, bundle, unitId, 'LARGE'), foreign,
    pieces: scPieces(state), tokens: tokenBodies(state, bundle), throughTerrainMax: moveThrough(state, bundle, unitId).terrainMax,
    er: rule(bundle, 'engagementRange'),
  }
}

const probes = new WeakMap<SquadCtx, { state: GameState; probe: ModelState } | null>()

/** Would a model of this unit standing at `pos` (radius `r`) be Engaged with the enemy model `enemyId`? Uses the full
 *  Engagement gates (engage.modelsEngaged) through one reusable probe model, so links agree with real Engagement. */
function probeEngaged(ctx: SquadCtx, pos: Vec2, r: number, enemyId: ModelId): boolean {
  let hit = probes.get(ctx)
  if (hit === undefined) {
    const tmpl = Object.values(ctx.state.models).find((m) => m.unitId === ctx.unitId)
    if (!tmpl) hit = null
    else {
      const probe: ModelState = { ...tmpl, id: '__link_probe', life: 'active', offTable: false }
      hit = { probe, state: { ...ctx.state, models: { ...ctx.state.models, [probe.id]: probe } } }
    }
    probes.set(ctx, hit)
  }
  if (!hit) return false
  hit.probe.pos = pos
  hit.probe.base = r * 2 * MM_PER_INCH
  return modelsEngaged(hit.state, ctx.bundle, hit.probe.id, enemyId)
}

/** Valid Coherency Link between two proposed model positions (COH-005, COH-008): the straight line avoids other units'
 *  models (except enemies the unit is Engaged with), solid terrain the unit could not pass, and level changes happen
 *  only at ACCESS POINTS. Flying units' links ignore terrain and other units. */
export function linkValid(ctx: SquadCtx, aPos: Vec2, aR: number, bPos: Vec2, bR: number): boolean {
  if (ctx.flying) return true
  // other units' models (Ground and Flying ignore each other)
  for (const o of ctx.foreign) {
    if (o.flying) continue
    if (segPointDist(aPos, bPos, o.pos).d >= o.r - 1e-9) continue
    // R p.37 4.4: a link may pass only through enemy models this unit is (or, ending its Charge, will be) actually Engaged
    // with. "Within 1"" is not enough: a Size 2+ wall or another elevation blocks Engagement, so it blocks the link too.
    if (o.owner !== ctx.owner && (probeEngaged(ctx, aPos, aR, o.id) || probeEngaged(ctx, bPos, bR, o.id))) continue
    return false
  }
  const sa = surfaceAt(ctx.state, aPos), sb = surfaceAt(ctx.state, bPos)
  const stand = (p: ScPiece, s: ScPiece | null): boolean => !!s && (s === p || s.below.includes(p.t.id))
  for (const p of ctx.pieces) {
    if (p.grass || !(isSolid(p) || p.walkable)) continue
    if (!segmentCrosses(p, aPos, bPos)) continue
    if (ctx.throughTerrainMax !== null && p.size <= ctx.throughTerrainMax) continue
    if (stand(p, sa) || stand(p, sb)) continue
    // an agreed opening lets the link through
    if (inOpening(p, { x: (aPos.x + bPos.x) / 2, z: (aPos.z + bPos.z) / 2 }, 0)) continue
    return false
  }
  if (sa !== sb) {
    // a level change inside a link needs an ACCESS POINT of the higher piece on (or within Engagement Range of) the line
    const up = !sa ? sb : !sb ? sa : sa.es >= sb.es ? sa : sb
    if (!up || (ctx.throughTerrainMax !== null && up.size <= ctx.throughTerrainMax)) return true
    return up.access.some((ap) => segPointDist(aPos, bPos, ap).d <= ctx.er + EPS)
  }
  return true
}

export interface CoherencyResult {
  inCoherency: boolean
  /** Models not Wholly Within the coherency distance of the Leading Model, or with no valid link. */
  outOfCoherency: ModelId[]
  /** Distance used (rules.json coherency, or the unit's coherency op). */
  distance: number
}

/** BFS over `nodes` from the Leading Model: Wholly Within the distance of it, and linked through same-unit models. */
function coherencyCore(state: GameState, bundle: EditionBundle, unitId: UnitId, lead: ModelState, nodes: { m: ModelState; pos: Vec2 }[]): CoherencyResult {
  const distance = coherencyDistance(state, bundle, unitId)
  const root = nodes.find((n) => n.m.id === lead.id)
  if (!root || nodes.length <= 1) return { inCoherency: true, outOfCoherency: [], distance }
  const ctx = squadCtx(state, bundle, unitId)
  const reached = new Set<ModelId>([lead.id])
  const queue = [root]
  while (queue.length) {
    const a = queue.shift()!
    for (const b of nodes) {
      if (reached.has(b.m.id)) continue
      if (linkValid(ctx, a.pos, baseRadius(a.m.base), b.pos, baseRadius(b.m.base))) { reached.add(b.m.id); queue.push(b) }
    }
  }
  const rl = baseRadius(lead.base)
  const out: ModelId[] = []
  for (const n of nodes) {
    if (n.m.id === lead.id) continue
    const within = dist(n.pos, root.pos) + baseRadius(n.m.base) - rl <= distance + 1e-6
    if (!within || !reached.has(n.m.id)) out.push(n.m.id)
  }
  return { inCoherency: out.length === 0, outOfCoherency: out, distance }
}

/** Coherency of the unit as it stands, or for a proposed placement (COH-002/005). A placement lists the models that
 *  stand on the table in the proposal (a unit arriving from Reserves has none on the table yet). */
export function coherencyState(state: GameState, bundle: EditionBundle, unitId: UnitId, placement?: Record<ModelId, Vec2>): CoherencyResult {
  const lead = leadingModel(state, unitId)
  const nodes = unitModels(state, unitId)
    .filter((m) => placement?.[m.id] || isOnTable(m))
    .map((m) => ({ m, pos: placement?.[m.id] ?? m.pos }))
  if (!lead) return { inCoherency: true, outOfCoherency: [], distance: coherencyDistance(state, bundle, unitId) }
  return coherencyCore(state, bundle, unitId, nodes.some((n) => n.m.id === lead.id) ? lead : nodes[0]?.m ?? lead, nodes)
}

// ---------------------------------------------------------------- legal end positions
export interface EndOpts {
  /** Units the models may stand in Engagement Range of (declared charge targets, units already Engaged). */
  targets?: UnitId[]
  /** No model may end within this many inches of any enemy model (minEnemyDist on PLACE and arrivals). */
  avoidEnemyWithin?: number
}
/** Why a base cannot stand at `pos` (null = legal): off the table, overlapping a base, a token or terrain, or too close to
 *  an enemy (MOVE-014, BASE-003, ENG-003). `placed` are the unit's own models already set (their bases count). */
export function endProblem(ctx: SquadCtx, modelBase: number, pos: Vec2, placed: { pos: Vec2; r: number }[], opts: EndOpts = {}): string | null {
  const r = baseRadius(modelBase)
  if (!baseOnTable(ctx.state, pos, r)) return 'off the table'
  for (const o of ctx.foreign) if (!o.displace && dist(pos, o.pos) < r + o.r - EPS) return `overlaps ${o.id}`
  for (const q of placed) if (dist(pos, q.pos) < r + q.r - EPS) return 'overlaps a model of its own unit'
  for (const t of ctx.tokens) if (!t.displacement && dist(pos, t.pos) < r + t.r - EPS) return `overlaps token ${t.id}`
  const blockers = endBlockers(ctx.state, pos, r, ctx.flying, ctx.large)
  if (blockers.length) return `overlaps terrain ${blockers[0]!.t.id}`
  const targets = new Set(opts.targets ?? [])
  for (const o of ctx.foreign) {
    if (o.owner === ctx.owner) continue
    const gap = Math.max(0, dist(pos, o.pos) - r - o.r)
    if (opts.avoidEnemyWithin !== undefined && gap <= opts.avoidEnemyWithin + 1e-6) return `within ${opts.avoidEnemyWithin}" of ${o.id}`
    if (targets.has(o.unitId)) continue
    // Ground movers keep out of enemy Ground units' Engagement Range; Flying ones keep 1" from enemy Flying (MOVE-021)
    if (o.flying === ctx.flying && gap <= ctx.er + 1e-6) return `inside Engagement Range of ${o.id}`
  }
  return null
}

// ---------------------------------------------------------------- the formation placer
export interface FormationOpts {
  leaderId: ModelId
  leaderPos: Vec2
  /** Placement priority list (CHG-005 charge; CC-010 close ranks; none = nearest legal ring spot). */
  prefer?: 'charge' | 'closeRanks' | 'none'
  /** Units the placement may touch / should close on (declared charge targets, engaged enemies). */
  targets?: UnitId[]
  /** No model may end within this many inches of an enemy model outside `targets` (Engagement Range, minEnemyDist). */
  avoidEnemyWithin?: number
  /** Optional per-model limits: each model must end within maxMove of its start (Move/Run). */
  maxMove?: number
  /** Models whose spots the player fixed already (checked, then kept as they are). */
  fixed?: Record<ModelId, Vec2>
  /** Where the Leading Model started, so the others keep their shape relative to it. Default: its stored position. */
  leaderFrom?: Vec2
}
export interface FormationResult { placement: Record<ModelId, Vec2>; inCoherency: boolean; casualties: ModelId[] }

/** Visit points on rings around `centre`, nearest ring first; `stop` is asked before each ring. Each ring starts at bearing
 *  `a0` (ties go to the first point visited), so no table axis is favoured: callers pass a bearing from the geometry at hand. */
function scanRings(centre: Vec2, from: number, to: number, step: number, fn: (p: Vec2) => void, stop: (rad: number) => boolean, a0 = 0): void {
  for (let rad = from; rad <= to + 1e-9; rad += step) {
    if (stop(rad)) return
    const n = Math.max(8, Math.ceil((2 * Math.PI * rad) / 0.3))
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * 2 * Math.PI
      fn({ x: centre.x + Math.cos(a) * rad, z: centre.z + Math.sin(a) * rad })
    }
  }
}

/** Bearing from a to b in radians; `none` when they coincide. */
export const bearing = (a: Vec2, b: Vec2, none: number): number => (Math.abs(b.x - a.x) + Math.abs(b.z - a.z) < 1e-9 ? none : Math.atan2(b.z - a.z, b.x - a.x))

/** Greedy ring search around the Leading Model (COH-003/004). Null when the Leading Model itself cannot stand there;
 *  models with no legal linked spot come back in `casualties`. */
export function placeFormation(state: GameState, bundle: EditionBundle, unitId: UnitId, opts: FormationOpts): FormationResult | null {
  const lead = state.models[opts.leaderId]
  if (!lead || lead.unitId !== unitId) return null
  const ctx = squadCtx(state, bundle, unitId)
  const endOpts: EndOpts = {
    ...(opts.targets ? { targets: opts.targets } : {}),
    ...(opts.avoidEnemyWithin !== undefined ? { avoidEnemyWithin: opts.avoidEnemyWithin } : {}),
  }
  const d = coherencyDistance(state, bundle, unitId)
  const rl = baseRadius(lead.base)
  if (endProblem(ctx, lead.base, opts.leaderPos, [], endOpts)) return null
  const placement: Record<ModelId, Vec2> = { [lead.id]: opts.leaderPos }
  const placed: { pos: Vec2; r: number }[] = [{ pos: opts.leaderPos, r: rl }]
  const casualties: ModelId[] = []
  const from = opts.leaderFrom ?? lead.pos
  const targetModels = (opts.targets ?? []).flatMap((u) => tableModels(state, u))
  const modelsOfUnit = unitModels(state, unitId)
  const centreA = bearing(opts.leaderPos, { x: 0, z: 0 }, 0)
  const prefers = !!opts.prefer && opts.prefer !== 'none' && targetModels.length > 0

  const linkedToPlaced = (m: ModelState, pos: Vec2): boolean => {
    const r = baseRadius(m.base)
    for (const q of modelsOfUnit) {
      const qp = placement[q.id]
      if (qp && linkValid(ctx, pos, r, qp, baseRadius(q.base))) return true
    }
    return false
  }
  const legal = (m: ModelState, pos: Vec2): boolean => {
    if (opts.maxMove !== undefined && !m.offTable && dist(pos, m.pos) > opts.maxMove + 1e-6) return false
    return endProblem(ctx, m.base, pos, placed, endOpts) === null
  }
  const targetGap = (m: ModelState, pos: Vec2): number => {
    let g = Infinity
    for (const t of targetModels) g = Math.min(g, edgeDistance(pos, m.base, t.pos, t.base))
    return g
  }
  /** Charge: A base contact with a target, B inside Engagement Range of one, C as close as possible (CHG-004).
   *  Close Ranks: enemy contact, else contact with a friend that is itself in Engagement Range (CC-010). */
  const tier = (m: ModelState, pos: Vec2): number => {
    const g = targetGap(m, pos)
    if (g <= 0.02) return 0
    if (opts.prefer === 'charge') return g <= ctx.er + 1e-6 ? 1 : 2
    for (const q of modelsOfUnit) {
      const qp = placement[q.id]
      if (!qp || q.id === m.id) continue
      if (edgeDistance(pos, m.base, qp, q.base) <= 0.02 && targetGap(q, qp) <= ctx.er + 1e-6) return 1
    }
    return 2
  }

  for (const m of modelsOfUnit) {
    if (m.id === lead.id) continue
    const rm = baseRadius(m.base)
    const fixedPos = opts.fixed?.[m.id]
    if (fixedPos) {
      if (!legal(m, fixedPos)) { casualties.push(m.id); continue }
      placement[m.id] = fixedPos
      placed.push({ pos: fixedPos, r: rm })
      continue
    }
    const maxC = d - rm + rl // centre distance that keeps the base Wholly Within d of the Leading Model
    const within = (p: Vec2): boolean => dist(p, opts.leaderPos) <= maxC + 1e-6
    const desired: Vec2 = m.offTable ? opts.leaderPos : { x: opts.leaderPos.x + (m.pos.x - from.x), z: opts.leaderPos.z + (m.pos.z - from.z) }
    let best = null as Vec2 | null
    let bestKey: [number, number] = [Infinity, Infinity]
    const consider = (p: Vec2, requireWithin: boolean): void => {
      if (requireWithin && !within(p)) return
      if (!legal(m, p) || !linkedToPlaced(m, p)) return
      const key: [number, number] = prefers
        ? [tier(m, p), opts.prefer === 'charge' ? targetGap(m, p) : dist(p, opts.leaderPos)]
        : [0, dist(p, desired)]
      if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1] - 1e-9)) { best = p; bestKey = key }
    }
    // ring start bearings: the model's own offset from the Leading Model (else towards the table centre), so ties never
    // lean towards one table axis
    const offA = bearing(opts.leaderPos, desired, centreA)
    if (prefers) {
      scanRings(opts.leaderPos, rl + rm, maxC, 0.2, (p) => consider(p, true), () => false, bearing(opts.leaderPos, targetModels[0]!.pos, centreA))
      for (const t of targetModels) {
        const contact = baseRadius(t.base) + rm + 0.005
        scanRings(t.pos, contact, contact, 1, (p) => consider(p, true), () => false, bearing(t.pos, opts.leaderPos, centreA))
      }
    } else {
      consider(desired, true)
      if (!best) scanRings(desired, 0.2, d + 2, 0.2, (p) => consider(p, true), (rad) => best !== null && rad > bestKey[1] + 1e-9, offA)
    }
    if (!best) {
      // as close as possible to the Leading Model, still linked: the unit ends Out of Coherency (COH-003)
      let nearest = Infinity
      scanRings(opts.leaderPos, rl + rm, 14, 0.25, (p) => {
        const dd = dist(p, opts.leaderPos)
        if (dd < nearest && legal(m, p) && linkedToPlaced(m, p)) { best = p; nearest = dd }
      }, (rad) => best !== null && rad > nearest + 0.3, offA)
    }
    if (!best) { casualties.push(m.id); continue }
    placement[m.id] = best
    placed.push({ pos: best, r: rm })
  }
  const nodes = modelsOfUnit.filter((m) => placement[m.id]).map((m) => ({ m, pos: placement[m.id]! }))
  const probe = coherencyCore(state, bundle, unitId, lead, nodes)
  return { placement, inCoherency: probe.inCoherency, casualties }
}
