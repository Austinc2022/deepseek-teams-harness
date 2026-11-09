// Venture studio, steps 3-7: take one idea from verdict to a launch-ready product.
//
//   evaluate (if needed) -> PRD -> UX + architecture (parallel) -> plan review loop -> launch kit
//   (marketing, brand, legal drafts in parallel)
//   ── GATE 1: stops here unless build=true ──
//   -> dev-pipeline (plan, implement with sub-agents, code + security review, QA)
//   -> dependency/supply-chain audit (one automatic fix round for critical findings)
//   -> AUTOMATIC QUALITY GATE: QA passed, no blocking review findings, no critical audit findings
//   -> release (CI, private source repo, desktop installers) and, with publish=true and a passed
//      gate, GO LIVE: preview deploy -> health check -> production; live URLs go into the ledger
//   venture-autopilot runs this with build=true publish=true, without a human.
//
//   forge run venture-pipeline idea=<ledger id>                     plan + launch kit only
//   forge run venture-pipeline idea=<ledger id> build=true          also build the MVP
//   optional: repo=/abs/path (default forge/workspaces/ventures/<id>) force=true (ignore a reject verdict)
//             launch=false (skip launch kit)  publish=true (go live automatically if the quality gate passes)

export const meta = {
  name: 'venture-pipeline',
  description: 'Idea to product: PRD, UX, architecture, plan review, launch kit; build=true builds the MVP; publish=true takes it live after an automatic quality gate.',
  team: 'product-planning',
  args: {
    idea: 'Ledger id or free-text idea (required)',
    build: 'true to build the MVP after planning (default false = stop at gate 1)',
    publish: 'true = go live automatically when the quality gate passes (default false)',
    repo: 'Absolute folder for the product repo (default forge/workspaces/ventures/<id>)',
    launch: 'false to skip the launch kit (default true)',
    force: 'true to continue even if the committee rejected the idea',
  },
}

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { resolveIdea, evaluateIdea, loadLedger, updateLedger, ideaCard, paths, money } from '../lib/venture.mjs'

const VERDICT = {
  type: 'object',
  properties: { approved: { type: 'boolean' }, summary: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } } },
  required: ['approved', 'summary', 'issues'],
  additionalProperties: false,
}

export default async function (api) {
  const { agent, parallel, phase, log, save, args, run } = api
  const home = run.home
  const yes = v => String(v) === 'true'
  const publish = yes(args.publish)

  // ---- idea + verdict
  phase('Verdict')
  const id = await resolveIdea(home, args.idea)
  let idea = loadLedger(home).ideas[id]
  if (!idea.evaluation) { await evaluateIdea(api, home, id); idea = loadLedger(home).ideas[id] }
  const ev = idea.evaluation
  if (ev?.decision === 'reject' && !yes(args.force)) {
    return `Committee REJECTED ${id} (${ev.overall}/100): ${ev.summary}\nRe-run with force=true to plan it anyway.`
  }
  const brief = `${ideaCard(idea)}\n\nCommittee: ${ev ? `${ev.decision} ${ev.overall}/100, ceiling tier ${ev.tier}. ${ev.summary}\nNext validation steps: ${(ev.nextSteps ?? []).join('; ')}\nKill criteria: ${(ev.killCriteria ?? []).join('; ')}` : 'not evaluated'}`

  // ---- product repo
  const repo = args.repo ? path.resolve(String(args.repo)) : path.join(paths(home).ventures, id)
  fs.mkdirSync(path.join(repo, 'docs', 'adr'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'launch'), { recursive: true })
  if (!fs.existsSync(path.join(repo, '.git'))) execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
  fs.writeFileSync(path.join(repo, 'docs', 'IDEA.md'), `# ${idea.title}\n\nLedger id: ${id}\n\n\`\`\`\n${brief}\n\`\`\`\n`)
  const at = { cwd: repo }
  log(`product repo: ${repo}`)

  // ---- PRD
  phase('PRD')
  const prd = await agent('product-manager', `Write the PRD for this idea to docs/PRD.md in ${repo} (read docs/IDEA.md first). Keep the MVP ruthlessly small and testable within 8 weeks.\n\n${brief}`, { ...at, label: 'prd' })
  if (!prd) throw new Error('product-manager failed')

  // ---- UX + architecture in parallel
  phase('Design + architecture')
  const [ux, arch] = await parallel([
    () => agent('ux-designer', `From docs/PRD.md in ${repo}, write docs/UX.md (flows, screen inventory, design tokens, accessibility) and docs/wireframes.html (one self-contained file with the key screens).`, { ...at, label: 'ux' }),
    () => agent('solution-architect', `From docs/PRD.md and docs/IDEA.md in ${repo}: choose the stack, write ADRs in docs/adr/, docs/ARCHITECTURE.md, and an implementation plan docs/PLAN.md (milestones, exact files, tests, parallel groups, CI + packaging + telemetry from day one). docs/UX.md may appear while you work; align with it if present.`, { ...at, label: 'architecture' }),
  ])
  if (!arch) throw new Error('solution-architect failed')

  // ---- plan review loop
  let verdict = null
  for (let round = 1; round <= 2; round++) {
    phase(`Plan review ${round}`)
    verdict = await agent('plan-reviewer', `Review docs/PLAN.md in ${repo} against docs/PRD.md, docs/UX.md and docs/ARCHITECTURE.md. Is it complete, buildable in ~8 weeks, and free of over-engineering?`, { ...at, schema: VERDICT, label: `plan-review-${round}` })
    if (!verdict || verdict.approved) break
    await agent('solution-architect', `Revise docs/PLAN.md (and ADRs if needed) in ${repo} to resolve every review issue:\n- ${verdict.issues.join('\n- ')}`, { ...at, label: `plan-revise-${round}` })
  }
  log(`plan ${verdict?.approved ? 'approved' : 'not fully approved'}`)

  // ---- launch kit (useful before building: landing-page demand tests)
  let launchKit = null
  if (String(args.launch) !== 'false') {
    phase('Launch kit')
    const [mkt, brand, legal] = await parallel([
      () => agent('growth-marketer', `Create the launch kit for the product in ${repo} (read docs/PRD.md, docs/IDEA.md). Write launch/LAUNCH-KIT.md: positioning, ICP, landing-page copy, pricing-page structure, launch plan (Product Hunt/HN/communities), SEO keywords, ASO metadata, a pre-build demand test (landing page + waitlist) and a 30-day experiment plan. Drafts only - post nothing.`, { ...at, label: 'growth' }),
      () => agent('brand-designer', `Create the brand for the product in ${repo} (read docs/PRD.md and docs/UX.md if present). Write launch/BRAND.md (name options with conflict flags, voice, colors, type) and 1-2 launch visuals in launch/brand/.`, { ...at, label: 'brand' }),
      () => agent('legal-drafter', `From docs/PRD.md and docs/ARCHITECTURE.md in ${repo}, draft launch/legal/PRIVACY-POLICY.md, launch/legal/TERMS-OUTLINE.md and launch/legal/COMPLIANCE-CHECKLIST.md, each marked as a draft for lawyer review.`, { ...at, label: 'legal' }),
    ])
    launchKit = { growth: mkt, brand, legal }
  }
  await updateLedger(home, l => { if (l.ideas[id]) { l.ideas[id].status = 'planned'; l.ideas[id].repo = repo } })

  const planSummary = `Plan ${verdict?.approved ? 'approved' : `has open issues: ${verdict?.issues?.join('; ') ?? 'review failed'}`}.`
  if (!yes(args.build)) {
    phase('Gate 1')
    const msg = [
      `# ${idea.title} - planned (gate 1)`,
      `Repo: ${repo}`,
      `Committee: ${ev?.decision ?? '?'} ${ev?.overall ?? '?'}/100 · ceiling ${money(ev?.ceilingPerDay)}/day`,
      planSummary,
      `Review docs/PRD.md, docs/UX.md, docs/wireframes.html, docs/ARCHITECTURE.md, docs/PLAN.md and launch/.`,
      `To build the MVP: ./forge-cli run venture-pipeline idea=${id} build=true`,
      `\n## PRD summary\n${prd}`, `\n## Architecture summary\n${arch}`, ux ? `\n## UX summary\n${ux}` : '',
    ].join('\n')
    save('gate1.md', msg)
    return msg
  }

  // ---- build via the existing dev pipeline
  phase('Build')
  const dev = await import(new URL('./dev-pipeline.js', import.meta.url).href)
  const build = await dev.default({
    ...api,
    args: {
      repo,
      task: `Target platform: ${idea.platform ?? 'see docs/IDEA.md'}. ${platformHint(idea.platform)}Build the MVP described in docs/PRD.md following the approved implementation plan docs/PLAN.md, the UX spec docs/UX.md (+ docs/wireframes.html) and the ADRs in docs/adr/. The planner should adopt docs/PLAN.md rather than re-plan from scratch. Commit work locally in logical commits.`,
      maxPlanRounds: 1, maxFixRounds: 2, release: 'false',
    },
  })

  // ---- automatic quality gate (replaces the human approval before going live)
  phase('Audit')
  const runAudit = label => agent('dependency-auditor', `Audit the repo at ${repo} before release: dependencies, supply chain, CI workflows, dangerous APIs and configs. Count findings by severity honestly.`, { ...at, schema: AUDIT, label })
  let audit = await runAudit('dependency-audit')
  const gateOf = a => ({ qaPassed: build?.qaPassed === true, openBlocking: build?.openBlocking?.length ?? null, auditCritical: a ? a.critical : null })
  const passes = g => g.qaPassed && g.openBlocking === 0 && g.auditCritical === 0
  let gate = gateOf(audit)
  if (publish && !passes(gate) && gate.qaPassed && gate.openBlocking === 0 && audit?.critical) {
    // one automatic fix round for critical audit findings, then re-audit
    phase('Audit fix')
    await agent('implementer', `Fix these critical release-blocking findings in ${repo}, re-run tests and commit:\n- ${audit.findings.filter(f => f.severity === 'critical').map(f => `${f.file ?? ''} ${f.issue} (fix: ${f.fix ?? '?'})`).join('\n- ')}`, { ...at, label: 'audit-fix' })
    audit = await runAudit('dependency-audit-2')
    gate = gateOf(audit)
  }
  const shipOk = passes(gate)
  const goLive = publish && shipOk
  log(`quality gate: ${shipOk ? 'PASSED' : 'FAILED'} ${JSON.stringify(gate)}; go live: ${goLive}`)

  // ---- release prep, and with goLive the actual deployment
  phase(goLive ? 'Release + go live' : 'Release prep')
  const t = targets(`${idea.platform} ${arch}`)
  const web = true // every venture gets at least a live landing page (with downloads / store links)
  const [ci, pkg, mobilePkg, extPkg] = await parallel([
    () => agent('devops-engineer', `Set up CI/CD in ${repo}: test, lint, build matrix, security scans, tag-triggered releases. publish: ${goLive}.${goLive ? ' Create a PRIVATE GitHub repository for the source with gh if gh is logged in, push main and the tags.' : ''}`, { ...at, label: 'ci' }),
    () => t.desktop ? agent('desktop-packager', `Make the desktop app in ${repo} shippable: bundle config, local build, signing/notarization via CI secrets, updater, release workflow, RELEASE-CHECKLIST.md. publish: ${goLive}.${goLive ? ' Build the installers you can build on this Mac and copy them to the landing site\'s public downloads folder so the cloud deployer ships them.' : ''}`, { ...at, label: 'desktop-packaging' }) : null,
    () => t.mobile ? agent('mobile-packager', `Make the ${[t.ios && 'Apple (iOS/watchOS/visionOS)', t.android && 'Android/Wear OS'].filter(Boolean).join(' and ')} app in ${repo} store-ready: release config, signing via CI secrets, fastlane lanes, store metadata in launch/store/, RELEASE-CHECKLIST.md. publish: ${goLive}.${goLive ? ' Upload to TestFlight / the Play internal testing track if the store credentials are already configured; otherwise report what is missing.' : ''}`, { ...at, label: 'mobile-packaging' }) : null,
    () => t.extension ? agent('extension-engineer', `Package the browser extension in ${repo} for the Chrome Web Store, Edge Add-ons and Firefox Add-ons: versioned zips in dist/, launch/STORE-LISTING.md with permission justifications, and copy the zips to the landing site's public downloads folder. Do not upload to any store.`, { ...at, label: 'extension-packaging' }) : null,
  ])
  const deploy = web ? await agent('cloud-deployer',
    `${goLive ? 'GO LIVE' : 'Prepare deployment'} for ${repo}: the web app/API if there is one, otherwise a landing page built from launch/LAUNCH-KIT.md copy with waitlist and download or store links (desktop installers, extension zips, App Store / Google Play badges marked \"coming soon\" until the store listing is live). publish: ${goLive}. ${goLive ? 'Deploy a preview, health-check it, then promote to production; roll back if the health check fails. Report every live URL.' : 'Write DEPLOY.md with exact commands; do not deploy.'}`,
    { ...at, schema: DEPLOY, label: goLive ? 'go-live' : 'deploy-prep' }) : null
  const live = goLive && deploy?.deployed === true
  await updateLedger(home, l => {
    if (!l.ideas[id]) return
    l.ideas[id].status = live ? 'live' : build?.qaPassed ? 'built' : 'building'
    l.ideas[id].release = { date: new Date().toISOString(), gate, shipOk, goLive, live, urls: deploy?.urls ?? [], blockedBy: deploy?.blockedBy ?? '' }
  })
  log(live ? `LIVE: ${deploy.urls.join(' ')}` : `not live${deploy?.blockedBy ? `: ${deploy.blockedBy}` : ''}`)

  return {
    idea: id, repo, plan: planSummary,
    build: { planApproved: build?.planApproved, qaPassed: build?.qaPassed, openBlocking: build?.openBlocking?.length ?? null, summary: build?.implementation },
    gate, shipOk, goLive, live, urls: deploy?.urls ?? [], blockedBy: deploy?.blockedBy ?? null,
    audit: audit?.summary ?? null, ci, packaging: pkg, mobilePackaging: mobilePkg, extensionPackaging: extPkg, deploy: deploy?.summary ?? null, launchKit: launchKit ? 'launch/' : null,
  }
}

/** Which platform-specific build and release agents an idea needs, from its platform text (and the architecture). */
function targets(text) {
  const x = String(text)
  const ios = /\b(ios|iphone|ipad|ipados|watchos|apple watch|visionos|vision pro|swiftui)\b|apple app store/i.test(x)
  const android = /android|google play|wear os|kotlin|galaxy store/i.test(x)
  const extension = /extension|chrome web store|add-ons|manifest v3/i.test(x)
  const desktop = /desktop|tauri|electron|macos|mac app store|setapp|windows|microsoft store|winget/i.test(x)
  return { ios, android, mobile: ios || android, extension, desktop }
}

function platformHint(platform) {
  const t = targets(platform)
  const who = [
    t.ios && '`ios-app-engineer` (Swift/SwiftUI)', t.android && '`android-app-engineer` (Kotlin/Compose)',
    t.desktop && '`desktop-app-engineer` (Tauri/Electron)', t.extension && '`extension-engineer` (Manifest V3)',
  ].filter(Boolean)
  return who.length ? `Delegate platform-specific code to ${who.join(' and ')}; use \`frontend-engineer\` for web UI. ` : ''
}

const AUDIT = {
  type: 'object',
  properties: {
    critical: { type: 'integer' }, high: { type: 'integer' }, medium: { type: 'integer' },
    findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }, file: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'issue'], additionalProperties: false } },
    summary: { type: 'string' },
  },
  required: ['critical', 'high', 'medium', 'findings', 'summary'],
  additionalProperties: false,
}

const DEPLOY = {
  type: 'object',
  properties: {
    deployed: { type: 'boolean', description: 'true only if production is live and its health check passed' },
    urls: { type: 'array', items: { type: 'string' } },
    blockedBy: { type: 'string', description: 'what prevented going live (e.g. not logged in to vercel/wrangler), or empty' },
    summary: { type: 'string' },
  },
  required: ['deployed', 'urls', 'blockedBy', 'summary'],
  additionalProperties: false,
}
