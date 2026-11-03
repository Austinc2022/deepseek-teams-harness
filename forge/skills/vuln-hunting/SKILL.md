---
name: vuln-hunting
description: Playbook for source-code security audits of open-source projects - where to look, how to prove, how to report candidates.
---
# Vulnerability hunting playbook

Scope: local source code and local builds inside the sandbox only.

1. Map attack surface: entry points that receive untrusted data (network handlers, parsers,
   file loaders, CLI args, env, IPC, deserializers, template rendering, plugin loading).
2. Follow data to sinks: memory ops (C/C++/unsafe Rust), command/SQL/LDAP/template
   execution, file paths, redirects/URLs (SSRF), regex (ReDoS), deserialization, crypto
   APIs, authz checks, integer arithmetic on sizes/lengths.
3. Diff the new release against the previous tag: new code is where new bugs are.
4. Check dependency manifests and lockfiles for known-vulnerable versions; check CI/workflows
   for injection (`pull_request_target`, untrusted `${{ }}` interpolation).
5. For each candidate: exact file:line path from source to sink, preconditions, impact,
   confidence (high/medium/low). No speculative "could be" items without a code path.

Output candidates as JSON when asked; otherwise a concise table plus details.
