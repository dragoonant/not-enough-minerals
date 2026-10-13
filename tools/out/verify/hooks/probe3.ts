import { bundle, duelState } from '../../../../tests/engine/helpers'
import { dispatch } from '../../../../src/engine/abilities'
const b = bundle()
let s = duelState(b, { gap: 10 })
s = { ...s, cards: { ...s.cards, B: [{ id: 'malignant-creep', exhausted: false, usage: {} } as any] }, active: 'B', activeUnit: 'B-zerglings',
  tokens: [{ id: 'ct', defId: 'creep-tumor', owner: 'B', sourceId: null, pos: { x: 0, z: -6 }, elev: 0, round: 1 } as any] }
const r = dispatch(s, b, 'declareCharge', { seat: 'B', unitId: 'B-zerglings', ...(process.env.NOT ? {} : { targetUnitId: 'A-marines' }), phase: 'assault' })
for (const id of ['A-marines', 'B-zerglings']) console.log(id, JSON.stringify(r.state.units[id]!.effects.map((e) => [e.source, e.data])))
