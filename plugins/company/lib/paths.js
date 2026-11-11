/** Folders and small helpers shared by the company modules. */
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(here, '../../..')
export const QUANT = path.join(ROOT, 'quant')
export const QUANT_REPORTS = path.resolve(ROOT, '..', 'quant_reports')

export const STAGES = ['idea', 'research', 'model', 'rehearsal', 'gate', 'paper', 'live-request', 'killed']
/** Stages an agent may set. "paper" comes only from the gate; "live-request" becomes real only through the owner. */
export const AGENT_STAGES = ['idea', 'research', 'model', 'rehearsal', 'gate', 'killed']

export const now = () => new Date().toISOString()
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const newId = (p = '') => p + crypto.randomBytes(5).toString('hex')
export const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d
export const str = (v, max = 4000) => String(v ?? '').slice(0, max)
export const clip = (s, n = 6000) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}\n...[truncated]` : s }
