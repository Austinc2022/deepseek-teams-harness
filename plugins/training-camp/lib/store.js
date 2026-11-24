/**
 * Training camp storage. Everything about one camp lives in forge/camps/<id>/:
 *
 *   camp.json                 goal, settings, the workflow, per-role progress, spend, log
 *   workflow.v<n>.json        every version of the workflow (proposals, your changes, your edits)
 *   datasets/<role>.train.jsonl, datasets/<role>.dev.jsonl
 *   sealed/<role>.holdout.jsonl   the verification set; trainees, the coach and the examiner of the
 *                                 training sets never read it
 *   candidates/<role>/<id>.json   every agent configuration that was tried
 *   trials.jsonl              one line per scored trial (the cache that makes a camp resumable)
 *   work/                     the folder each trial ran in
 *   backup/<ts>/              what publishing replaced, for rollback
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const now = () => new Date().toISOString()
export const newId = (p = '') => p + crypto.randomBytes(4).toString('hex')
export const hash = (v, n = 10) => crypto.createHash('sha1').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, n)
export const clip = (s, n = 6000) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}\n...[${s.length - n} more characters]` : s }
export const round = (n, d = 3) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d)
export const slug = (s, max = 40) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || 'camp'
export const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)

export const CAMP_ID = /^c[a-f0-9]{8}$/
const KEY = /^[a-z_][a-z0-9_-]{0,63}$/

export const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return fallback } }
export const writeJson = (f, v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  const tmp = `${f}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2))
  fs.renameSync(tmp, f)
}
export const readJsonl = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch { return [] } }
export const writeJsonl = (f, rows) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')) }

export class Store {
  constructor(home) {
    this.home = home
    this.root = path.join(home, 'camps')
    fs.mkdirSync(this.root, { recursive: true })
  }

  dir(id, ...rest) {
    if (!CAMP_ID.test(id)) throw new Error(`bad camp id "${id}"`)
    return path.join(this.root, id, ...rest)
  }
  exists(id) { return CAMP_ID.test(id) && fs.existsSync(this.dir(id, 'camp.json')) }
  list() {
    return fs.readdirSync(this.root).filter(n => this.exists(n)).map(n => this.read(n)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }
  read(id) {
    const c = readJson(this.dir(id, 'camp.json'))
    if (!c) throw new Error(`unknown camp ${id}`)
    return c
  }
  write(camp) { camp.updatedAt = now(); writeJson(this.dir(camp.id, 'camp.json'), camp); return camp }
  /** Read, change and write in one synchronous step, so concurrent trials in one process never lose an update. */
  update(id, fn) { const c = this.read(id); fn(c); return this.write(c) }
  log(id, msg) { this.update(id, c => { c.log.push({ ts: now(), msg: String(msg) }); if (c.log.length > 400) c.log.splice(0, c.log.length - 400) }) }
  remove(id) { fs.rmSync(this.dir(id), { recursive: true, force: true }) }

  // ---- datasets: train and dev are readable by the coach; holdout is sealed
  #setFile(id, key, split) {
    if (!KEY.test(key)) throw new Error(`bad dataset key "${key}"`)
    return split === 'holdout' ? this.dir(id, 'sealed', `${key}.holdout.jsonl`) : this.dir(id, 'datasets', `${key}.${split}.jsonl`)
  }
  tasks(id, key, split) { return readJsonl(this.#setFile(id, key, split)) }
  saveTasks(id, key, split, rows) { writeJsonl(this.#setFile(id, key, split), rows) }
  dropTasks(id, key) { for (const s of ['train', 'dev', 'holdout']) fs.rmSync(this.#setFile(id, key, s), { force: true }) }

  // ---- candidates
  candidate(id, key, cid) {
    const c = readJson(this.dir(id, 'candidates', key, `${cid}.json`))
    if (!c) throw new Error(`camp ${id}: no candidate ${key}/${cid}`)
    return c
  }
  saveCandidate(id, key, cand) { writeJson(this.dir(id, 'candidates', key, `${cand.id}.json`), cand); return cand }
  dropCandidates(id, key) { fs.rmSync(this.dir(id, 'candidates', key), { recursive: true, force: true }) }

  // ---- trials
  trials(id) { return readJsonl(this.dir(id, 'trials.jsonl')) }
  appendTrial(id, row) { fs.appendFileSync(this.dir(id, 'trials.jsonl'), `${JSON.stringify(row)}\n`) }
  dropTrials(id, key) { writeJsonl(this.dir(id, 'trials.jsonl'), this.trials(id).filter(t => t.role !== key)) }
}
