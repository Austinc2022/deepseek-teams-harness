// Use case 3: find security bugs in newly released open-source software.
// Recon (or given targets) -> fetch source into an isolated workspace -> parallel sandboxed
// hunters per focus area -> triage/verify -> private advisory drafts.
// Output: forge/reports/security/<date>-<target>.md  (private drafts; never published)
//
//   forge run security-hunt                                   recon picks targets
//   forge run security-hunt 'targets=["https://github.com/owner/repo"]' maxTargets=1
//
// Rules (enforced in agent roles and the responsible-disclosure skill): local source and
// local builds only, inside the sandbox; no probing of live systems; private reporting.

export const meta = {
  name: 'security-hunt',
  description: 'Discover newly released OSS, audit it in sandboxed parallel hunters, triage findings, draft private advisories.',
  team: 'security-hunters',
  args: {
    targets: 'Optional list of GitHub repo URLs (optionally with @tag) to audit instead of recon',
    sinceDays: 'Recon window in days (default 3)',
    maxTargets: 'Max targets per run (default 2)',
    focus: 'Optional list of focus areas for hunters',
  },
}

import fs from 'node:fs'
import path from 'node:path'

const FOCUS = [
  'memory safety and integer/size arithmetic (native code, unsafe blocks, buffers, length parsing)',
  'injection and parsing (command/SQL/template injection, path traversal, deserialization, XML/regex, archive extraction)',
  'authentication, authorization and business logic (missing checks, IDOR, session/token handling, crypto misuse)',
  'supply chain and configuration (dependencies with known CVEs, CI workflow injection, secrets, unsafe defaults, SSRF)',
]

const TARGETS = {
  type: 'object',
  properties: {
    targets: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, repo_url: { type: 'string' }, version: { type: 'string' },
      ecosystem: { type: 'string' }, release_url: { type: 'string' }, why: { type: 'string' },
    }, required: ['name', 'repo_url', 'why'], additionalProperties: false } },
  },
  required: ['targets'],
  additionalProperties: false,
}

const FINDINGS = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' },
      cwe: { type: 'string' }, source_to_sink: { type: 'string' }, impact: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    }, required: ['title', 'file', 'source_to_sink', 'confidence'], additionalProperties: false } },
    notes: { type: 'string' },
  },
  required: ['findings'],
  additionalProperties: false,
}

const TRIAGE = {
  type: 'object',
  properties: {
    confirmed: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' }, cwe: { type: 'string' },
      cvss_vector: { type: 'string' }, cvss_score: { type: 'number' }, severity: { type: 'string' },
      evidence: { type: 'string' }, reproduction: { type: 'string' }, fix: { type: 'string' },
    }, required: ['title', 'file', 'severity', 'evidence'], additionalProperties: false } },
    rejected: { type: 'array', items: { type: 'string' } },
  },
  required: ['confirmed', 'rejected'],
  additionalProperties: false,
}

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)

export default async function ({ agent, parallel, pipeline, phase, log, save, args, run }) {
  const date = new Date().toISOString().slice(0, 10)
  const maxTargets = Number(args.maxTargets ?? 2)
  const focus = Array.isArray(args.focus) && args.focus.length ? args.focus : FOCUS
  const wsRoot = path.join(run.home, 'workspaces', 'security', run.id)
  fs.mkdirSync(wsRoot, { recursive: true })

  phase('Recon')
  let targets
  if (Array.isArray(args.targets) && args.targets.length) {
    targets = args.targets.map(t => ({ name: t.replace(/^https:\/\/github\.com\//, '').replace(/@.*$/, ''), repo_url: t.replace(/@.*$/, ''), version: t.includes('@') ? t.split('@').pop() : '', why: 'requested' }))
  } else {
    const r = await agent('release-recon', `Today is ${date}. Find up to ${maxTargets} open-source projects with a notable release in the last ${args.sinceDays ?? 3} days that deserve a security audit (public GitHub repo required). Prefer security-relevant surface and real user bases. Avoid targets in your journal.`, { schema: TARGETS, label: 'recon', cwd: wsRoot })
    targets = r?.targets ?? []
  }
  targets = targets.slice(0, maxTargets)
  log(`targets: ${targets.map(t => t.name).join(', ') || 'none'}`)
  if (!targets.length) return { date, targets: [], reports: [] }

  const results = await pipeline(targets,
    // fetch source into an isolated workspace (sandboxed agent; codeload tarball, no git needed)
    async t => {
      const ws = path.join(wsRoot, slug(t.name))
      fs.mkdirSync(ws, { recursive: true })
      phase(`Fetch ${t.name}`)
      const ok = await agent('vuln-hunter', `Download the source of ${t.repo_url}${t.version ? ` at tag/ref ${t.version}` : ' (latest release tag if there is one, otherwise default branch)'} into ./src in your working directory using curl from codeload.github.com (tar.gz) and extract it (do not run any of its code or install scripts). Also download the previous release tag into ./prev if one exists. Reply with the exact refs fetched and the top-level layout.`, { cwd: ws, label: `fetch:${slug(t.name)}`, model: 'sonnet', effort: 'low' })
      if (!ok) throw new Error(`fetch failed for ${t.name}`)
      return { ...t, ws, fetched: ok }
    },
    // parallel hunters, one per focus area
    async t => {
      phase(`Hunt ${t.name}`)
      const hunts = await parallel(focus.map((f, i) => () => agent('vuln-hunter',
        `Audit the project in ./src (previous release in ./prev, if present; prioritize code changed in the new release). Focus area: ${f}.\nProject: ${t.name} ${t.version ?? ''}. Fetch notes: ${t.fetched}\nReport candidates with concrete source-to-sink paths only.`,
        { cwd: t.ws, schema: FINDINGS, label: `hunt:${slug(t.name)}:${i + 1}` })))
      const candidates = hunts.filter(Boolean).flatMap(h => h.findings)
      log(`${t.name}: ${candidates.length} candidate findings`)
      return { ...t, candidates }
    },
    // triage / verification
    async t => {
      if (!t.candidates.length) return { ...t, triage: { confirmed: [], rejected: [] } }
      phase(`Triage ${t.name}`)
      const triage = await agent('vuln-triager',
        `Triage these candidate vulnerabilities for ${t.name} (source in ./src). Re-verify each code path; confirm with a minimal local test against a local build in this sandbox when feasible. Reject anything unproven.\n\n${JSON.stringify(t.candidates, null, 2)}`,
        { cwd: t.ws, schema: TRIAGE, label: `triage:${slug(t.name)}` })
      return { ...t, triage: triage ?? { confirmed: [], rejected: ['triage failed'] } }
    },
    // private advisory drafts
    async t => {
      const reportDir = path.join(run.reports, 'security')
      fs.mkdirSync(reportDir, { recursive: true })
      const file = path.join(reportDir, `${date}-${slug(t.name)}.md`)
      if (!t.triage.confirmed.length) {
        fs.writeFileSync(file, `# ${t.name} ${t.version ?? ''} - audit ${date}\n\nNo confirmed vulnerabilities.\n\nCandidates reviewed: ${t.candidates.length}\nRejected: ${t.triage.rejected.join('; ') || '-'}\n`)
        return { target: t.name, confirmed: 0, report: file }
      }
      phase(`Advisory ${t.name}`)
      const advisory = await agent('advisory-writer',
        `Write a PRIVATE vulnerability report draft for the maintainers of ${t.name} (${t.repo_url}). Find their private reporting channel (SECURITY.md in ./src, GitHub private vulnerability reporting). Confirmed findings:\n${JSON.stringify(t.triage.confirmed, null, 2)}\n\nOutput only the Markdown report.`,
        { cwd: t.ws, label: `advisory:${slug(t.name)}` })
      fs.writeFileSync(file, `<!-- PRIVATE DRAFT - do not publish. Report through the maintainers' private channel. -->\n${advisory ?? JSON.stringify(t.triage, null, 2)}`)
      return { target: t.name, confirmed: t.triage.confirmed.length, severities: t.triage.confirmed.map(c => c.severity), report: file }
    })

  const summary = { date, targets: targets.map(t => t.name), reports: results.filter(Boolean) }
  save('summary.json', summary)
  return summary
}
