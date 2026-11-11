/** What every gate does after it decides: record the result on the initiative, the order list and the ledger. */
import { now, newId, clip } from './paths.js'

export function finishGate(co, out, cycleId) {
  const P = co.profile
  co.update(s => {
    const i = s.initiatives.find(x => x.id === out.initiativeId)
    if (out.order) s.orders.push(out.order)
    if (i) {
      i.gate = { ts: now(), cycle: cycleId, name: out.name, passed: out.passed, reasons: out.reasons, pImprove: out.pImprove ?? null }
      if (out.passed) { i.stage = P.gatedStage; i.confidence = out.pImprove ?? i.confidence; i.confidenceBasis = P.text.gateConfidenceBasis }
      i.history.push({ ts: now(), cycle: cycleId, stage: i.stage, note: out.passed ? `gate passed: ${out.order.book}` : `gate failed: ${clip(out.reasons.join('; '), 300)}` })
    }
  })
  if (out.order) co.ledger({ kind: 'order', usd: 0, note: `${P.text.orderNoun} ${out.order.book}`, cycle: cycleId })
  return out
}

export const orderId = () => newId('o')
