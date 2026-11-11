/**
 * Company setup: creates the active profile's organisation (CEO, department leads, HR, teams, the auditor and the
 * gate verifier), its departments and one super team per department. Safe to run again: existing agents, teams and
 * departments are left alone unless `force` is set. What the organisation is comes from the profile (profiles/).
 */
import fs from 'node:fs'
import { now } from './paths.js'
import { profile as P } from './profile.js'

/** The fixed part of every company analyst; hires get the same (see cycle.js). */
export const baseAgent = extra => P.baseAgent(extra)
export const HARD_RULES = P.hardRules
export const READ_TOOLS = ['Read', 'Grep', 'Glob']
export const WEB_TOOLS = ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch']
export const AUDITOR = P.auditorName

export function seed(co, { force = false } = {}) {
  const { registry } = co.forge
  const done = { profile: P.id, agents: [], teams: [], migrated: [], departments: [], superTeams: [], folders: [] }
  const exists = n => { try { registry.getAgent(n); return true } catch { return false } }
  const skillOk = k => fs.existsSync(`${registry.d.skills}/${k}/SKILL.md`)

  for (const d of P.ensureDirs) if (!fs.existsSync(d)) { fs.mkdirSync(d, { recursive: true }); done.folders.push(d) }

  // state left by another profile (or by the original crypto setup, which did not record one): archive it and start
  // fresh, so the old charter and departments do not leak into this company. Agent and team files are left alone.
  const prev = co.read()
  const foreign = prev.profile ? prev.profile !== P.id : prev.departments.some(d => !P.isOurs(d.lead))
  if (foreign && fs.existsSync(co.file)) {
    const keep = `${co.file.replace(/\.json$/, '')}.${prev.profile ?? 'previous'}.${Date.now()}.json`
    fs.renameSync(co.file, keep)
    done.archived = keep
  }

  for (const a of P.agents) {
    if (exists(a.name) && !force) continue
    registry.saveAgent({ ...a, skills: (a.skills ?? []).filter(skillOk) })
    done.agents.push(a.name)
  }
  if (P.migrate) P.migrate(co, done)

  for (const t of P.teams) {
    let have = false
    try { registry.getTeam(t.name); have = true } catch {}
    if (have && !force) continue
    const members = t.members.filter(exists)
    if (!members.length) continue
    registry.saveTeam({ ...t, members })
    done.teams.push(t.name)
  }

  const teamOk = n => { try { registry.getTeam(n); return true } catch { return false } }
  const charterText = s => `${s.charter.mission}\n${s.charter.scope}\n\nRules:\n${s.charter.rules.map(r => `- ${r}`).join('\n')}`

  // one super-team project, one super team per department (the lead is its supervisor)
  let projectId = co.read().superProject
  const projects = co.supers.listProjects().projects
  if (!projectId || !projects.some(p => p.id === projectId)) {
    const found = projects.find(p => p.name === P.superProject.name)
    projectId = found?.id ?? co.supers.createProject({ name: P.superProject.name, cwd: P.projectDir, color: P.superProject.color, description: charterText(co.read()) }).id
  }

  co.update(s => {
    s.profile = P.id
    s.superProject = projectId
    s.ceo = P.ceoName
    s.auditor = P.auditorName
    s.createdAt ??= now()
    for (const d of P.departments) {
      let dep = s.departments.find(x => x.id === d.id)
      if (!dep) { dep = { ...d, teams: d.teams.filter(teamOk), createdAt: now() }; s.departments.push(dep); done.departments.push(d.id) }
      let live = false
      if (dep.superTeamId) { try { co.supers.get(dep.superTeamId); live = true } catch {} }
      if (!live && dep.teams.length) {
        const st = co.supers.create({
          title: `${P.label} · ${dep.name}`, project: projectId, supervisor: dep.lead, mode: 'auto', maxRounds: 2, maxHops: 1, cwd: P.projectDir,
          teams: dep.teams.map(team => ({ team, mode: 'parallel', chat: 'copy' })),
          instructions: `You are the head of the ${dep.name} department. Department mission: ${dep.mission}\nThe request you receive is a brief from the CEO. Deliver exactly what it asks for, with the evidence. Keep assignments few and concrete.`,
        })
        dep.superTeamId = st.id
        done.superTeams.push(`${dep.id}: ${st.id}`)
      }
    }
  })
  return done
}

/** Keep a department's super team in line with its team list (after a hire created a new team). */
export function syncDepartment(co, dep) {
  if (!dep.superTeamId) return
  const st = co.supers.get(dep.superTeamId)
  const have = new Map(st.teams.map(t => [t.team, t]))
  co.supers.update(dep.superTeamId, { teams: dep.teams.map(team => have.get(team) ?? { team, mode: 'parallel', chat: 'copy' }) })
}
