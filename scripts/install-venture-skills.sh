#!/bin/bash
# Install the GitHub skills used by the venture-studio teams into forge/skills/.
# Every source path was verified against the GitHub trees API (2026-11-08).
# Re-run safely: already-installed skills are skipped (pass --overwrite to refresh them all).
#
#   scripts/install-venture-skills.sh            install missing skills
#   scripts/install-venture-skills.sh --overwrite   reinstall all
#
# Licenses: most are MIT/Apache-2.0. trailofbits/skills is CC-BY-SA-4.0 (fine for local use;
# attribute and share-alike if you redistribute modified copies). deanpeters/Product-Manager-Skills
# is deliberately NOT used (non-commercial license).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORCE="${1:-}"

SKILLS=(
  # --- obra/superpowers (MIT): planning + disciplined implementation
  github:obra/superpowers/skills/brainstorming
  github:obra/superpowers/skills/writing-plans
  github:obra/superpowers/skills/executing-plans
  github:obra/superpowers/skills/subagent-driven-development
  github:obra/superpowers/skills/dispatching-parallel-agents
  github:obra/superpowers/skills/test-driven-development
  github:obra/superpowers/skills/systematic-debugging
  github:obra/superpowers/skills/using-git-worktrees
  github:obra/superpowers/skills/verification-before-completion
  github:obra/superpowers/skills/requesting-code-review
  github:obra/superpowers/skills/receiving-code-review
  github:obra/superpowers/skills/finishing-a-development-branch
  # --- anthropics/skills (per-skill Apache-2.0)
  github:anthropics/skills/skills/doc-coauthoring
  github:anthropics/skills/skills/frontend-design
  github:anthropics/skills/skills/web-artifacts-builder
  github:anthropics/skills/skills/mcp-builder
  github:anthropics/skills/skills/skill-creator
  github:anthropics/skills/skills/canvas-design
  github:anthropics/skills/skills/theme-factory
  # --- anthropics/knowledge-work-plugins (Apache-2.0)
  github:anthropics/knowledge-work-plugins/product-management/skills/write-spec
  github:anthropics/knowledge-work-plugins/product-management/skills/metrics-review
  github:anthropics/knowledge-work-plugins/product-management/skills/synthesize-research
  github:anthropics/knowledge-work-plugins/legal/skills/compliance-check
  # --- vercel-labs / cloudflare (official)
  github:vercel-labs/agent-skills/skills/react-best-practices
  github:vercel-labs/agent-skills/skills/web-design-guidelines
  github:vercel-labs/agent-skills/skills/deploy-to-vercel
  github:cloudflare/skills/skills/wrangler
  github:cloudflare/skills/skills/workers-best-practices
  # --- wshobson/agents (MIT)
  github:wshobson/agents/plugins/documentation-generation/skills/architecture-decision-records
  github:wshobson/agents/plugins/developer-essentials/skills/e2e-testing-patterns
  github:wshobson/agents/plugins/cicd-automation/skills/github-actions-templates
  github:wshobson/agents/plugins/cicd-automation/skills/deployment-pipeline-design
  github:wshobson/agents/plugins/cicd-automation/skills/secrets-management
  # --- trailofbits/skills (CC-BY-SA-4.0) + getsentry/skills (Apache-2.0): security
  github:trailofbits/skills/plugins/static-analysis/skills/semgrep
  github:trailofbits/skills/plugins/sharp-edges/skills/sharp-edges
  github:trailofbits/skills/plugins/supply-chain-risk-auditor/skills/supply-chain-risk-auditor
  github:trailofbits/skills/plugins/differential-review/skills/differential-review
  github:trailofbits/skills/plugins/property-based-testing/skills/property-based-testing
  github:getsentry/skills/skills/security-review
  github:getsentry/skills/skills/gha-security-review
  github:getsentry/skills/skills/find-bugs
  # --- testing
  github:lackeyjb/playwright-skill/skills/playwright-skill
  # --- market & opportunity research
  github:mvanhorn/last30days-skill/skills/last30days
  github:K-Dense-AI/scientific-agent-skills/skills/market-research-reports
  github:phuryn/pm-skills/pm-market-research/skills/market-sizing
  github:phuryn/pm-skills/pm-market-research/skills/competitor-analysis
  github:phuryn/pm-skills/pm-market-research/skills/user-personas
  github:phuryn/pm-skills/pm-market-research/skills/sentiment-analysis
  # --- product management & business evaluation (phuryn MIT, alirezarezvani MIT)
  github:phuryn/pm-skills/pm-execution/skills/create-prd
  github:phuryn/pm-skills/pm-execution/skills/prioritization-frameworks
  github:phuryn/pm-skills/pm-product-strategy/skills/product-strategy
  github:phuryn/pm-skills/pm-product-strategy/skills/business-model
  github:phuryn/pm-skills/pm-product-strategy/skills/lean-canvas
  github:phuryn/pm-skills/pm-product-strategy/skills/pricing-strategy
  github:phuryn/pm-skills/pm-product-discovery/skills/identify-assumptions-new
  github:phuryn/pm-skills/pm-product-discovery/skills/analyze-feature-requests
  github:phuryn/pm-skills/pm-data-analytics/skills/cohort-analysis
  github:phuryn/pm-skills/pm-marketing-growth/skills/north-star-metric
  github:phuryn/pm-skills/pm-toolkit/skills/privacy-policy
  github:alirezarezvani/claude-skills/finance/skills/financial-analyst
  github:alirezarezvani/claude-skills/finance/skills/saas-metrics-coach
  # --- growth & launch (coreyhaines31 MIT, appeeky MIT)
  github:coreyhaines31/marketingskills/skills/product-marketing
  github:coreyhaines31/marketingskills/skills/launch
  github:coreyhaines31/marketingskills/skills/copywriting
  github:coreyhaines31/marketingskills/skills/seo-audit
  github:coreyhaines31/marketingskills/skills/cro
  github:coreyhaines31/marketingskills/skills/pricing
  github:coreyhaines31/marketingskills/skills/aso
  github:coreyhaines31/marketingskills/skills/analytics
  github:appeeky/aso-skills/skills/aso-audit
)

ok=0; skip=0; fail=0; failed=()
for src in "${SKILLS[@]}"; do
  if [ "$FORCE" = "--overwrite" ]; then out=$("$ROOT/forge-cli" skill install "$src" --overwrite 2>&1)
  else out=$("$ROOT/forge-cli" skill install "$src" 2>&1); fi
  if [ $? -eq 0 ]; then ok=$((ok+1)); echo "ok    $src"
  elif echo "$out" | grep -q "already installed"; then skip=$((skip+1)); echo "skip  $src"
  else fail=$((fail+1)); failed+=("$src: $out"); echo "FAIL  $src"; fi
done
echo "installed=$ok skipped=$skip failed=$fail"
for f in "${failed[@]:-}"; do [ -n "$f" ] && echo "  $f"; done
[ $fail -eq 0 ]
