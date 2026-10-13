// Public engine surface. Contract files (frozen after M1): types, decider, view, rng, pending.
// Foundations (frozen for the M2 rules owners): registry, apply, errors, dice, edition, query signatures.
export * from './types'
export * from './geometry'
export * from './measure'
export * from './los'
export * from './terrain'
export { seedRng, rollDie, rollD6, roll, deriveSeed, nextFloat, type DiceRolled, type RollSpec } from './rng'
export { createRandomDecider, createReplayDecider, type Decider, type DeciderKind } from './decider'
export { view } from './view'
export { raise, legalActions } from './pending'
export { createDemoGame, createGame, modelDefaults, gameDefaults, TABLES, type CreateGameOpts, type TableSize } from './setup'
export { apply, matchesOption, type ApplyResult } from './apply'
export {
  modules, moduleFor, namespaceOf, allOptions, controller, raiseDecision, option, reject, isRejection, todo, TodoError,
  pushEvents, updateModel, updateUnit, resumeIn, NAMESPACES, type ModuleDef, type Controller, type ModuleId, type StepResult,
  type ActionDone, type Trigger,
} from './registry'
// M2 shared services, as namespaces (dice.test, edition.rule, query.attackPreview...).
export * as dice from './dice'
export * as edition from './edition'
export * as query from './query'
