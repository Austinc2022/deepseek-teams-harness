/*
 * Company switcher: a slim bar at the top of every company page. Shows which company the page is about and switches
 * to the same page of another company (/company/ is the main one, /company/c/<id>/ the others). The choice is kept
 * in localStorage so the portal's sidebar pages follow it. Without the portal (company-cli serve) it stays hidden.
 */
(function () {
  const m = location.pathname.match(/^(.*\/company\/)(?:c\/([a-z][a-z0-9-]{1,30})\/)?([^/]*)$/)
  if (!m) return
  const root = m[1], cur = m[2] || 'main', file = m[3] || ''
  const KEY = 'company.current'
  const remember = id => { try { localStorage.setItem(KEY, id) } catch {} }
  remember(cur)
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const go = id => { remember(id); location.href = root + (id === 'main' ? '' : `c/${id}/`) + file }

  fetch(root + 'api/companies', { headers: { 'x-company-request': '1' } }).then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d?.companies) return
    const here = d.companies.find(c => c.id === cur)
    const bar = document.createElement('div')
    bar.className = 'company-switcher'
    bar.setAttribute('role', 'navigation')
    bar.setAttribute('aria-label', 'Company')
    const style = document.createElement('style')
    style.textContent = `.company-switcher { max-width: 1320px; margin: 0 auto 12px; display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; font-size: 12px; color: var(--muted, #5d6b66) }
.company-switcher select { font: inherit; font-size: 13px; color: var(--ink, #17211e); background: var(--panel, #fff); border: 1px solid var(--line, #d6dedb); border-radius: 6px; padding: 3px 6px; max-width: 100% }
.company-switcher a { color: inherit }
.company-switcher .warn { color: var(--bad, #b3261e) }`
    const opts = d.companies.map(c => `<option value="${esc(c.id)}"${c.id === cur ? ' selected' : ''}>${esc(c.name)}${c.main ? ' (main)' : c.status === 'running' ? '' : ` (${esc(c.status)})`}</option>`).join('')
    bar.innerHTML = `<label style="display:flex;flex-direction:row;align-items:center;gap:6px;color:inherit;font-size:12px">Company <select aria-label="Company">${opts}</select></label>`
      + `<a href="${esc(root)}companies.html" target="_self">All companies</a>`
      + (!here ? '<span class="warn">This company does not exist (any more).</span>' : here.status !== 'running' ? `<span class="warn">This company is ${esc(here.status)}${here.error ? `: ${esc(here.error)}` : ''}. Start it on the Companies page.</span>` : '')
    bar.querySelector('select').addEventListener('change', e => go(e.target.value))
    document.head.appendChild(style)
    document.body.insertBefore(bar, document.body.firstChild)
  }).catch(() => {})
})()
