/** What every gate does after it decides: record the result on the initiative, the order list and the ledger. */
import { now, newId, clip } from './paths.js'

/**
 * out.order.status 'awaiting-owner' means the gate passed but the profile holds the start for the owner
 * (charter.execution.ownerApproval): the initiative stays at the gate and one decision is opened.
 */
export function finishGate(co, out, cycleId) {
  const P = co.profile
  co.update(s => {
    const i = s.initiatives.find(x => x.id === out.initiativeId)
    const waiting = out.order?.status === 'awaiting-owner'
    if (out.order) s.orders.push(out.order)
    if (waiting) {
      const o = out.order
      co.addDecision(s, { from: s.ceo, cycle: cycleId, kind: 'execute', order: o.id, ownerOnly: true,
        question: `Start "${o.name ?? o.proposal}"? It passed the gate: ${P.text.scoreLabel} ${o.pImprove} against a required ${o.required}${o.audit ? ', and the independent audit found no fatal objection' : ''}. Starting means: ${P.text.orderNoun} ${o.book}.`,
        options: ['Start', 'Do not start'], recommendation: 'Start', why: o.hypothesis ?? '' })
    }
    if (i) {
      i.gate = { ts: now(), cycle: cycleId, name: out.name, passed: out.passed, reasons: out.reasons, pImprove: out.pImprove ?? null }
      if (out.passed) { i.stage = waiting ? 'gate' : P.gatedStage; i.awaitingOwner = waiting || undefined; i.confidence = out.pImprove ?? i.confidence; i.confidenceBasis = P.text.gateConfidenceBasis }
      i.history.push({ ts: now(), cycle: cycleId, stage: i.stage, note: out.passed ? (waiting ? `gate passed: waiting for the owner's approval to start ${out.order.book}` : `gate passed: ${out.order.book}`) : `gate failed: ${clip(out.reasons.join('; '), 300)}` })
    }
  })
  if (out.order) co.ledger({ kind: 'order', usd: 0, note: out.order.status === 'awaiting-owner' ? `verified, waiting for the owner: ${out.order.book}` : `${P.text.orderNoun} ${out.order.book}`, cycle: cycleId })
  return out
}

export const orderId = () => newId('o')
