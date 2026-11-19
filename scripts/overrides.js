/*
 * Page overrides: EDS replacement for the AEM "Script executor" injection.
 *
 * Authors maintain a spreadsheet published at /overrides.json (in SharePoint/Drive or AEM).
 * Publishing the sheet takes effect immediately (CDN purge on publish) on every page whose
 * path matches. No arbitrary authored JavaScript is executed.
 *
 * Sheet columns:
 *   Path      comma-separated globs on the URL path, e.g. /my/en/*, /sg/en/home, * (all pages)
 *   Exclude   optional globs to skip
 *   Selector  CSS selector, e.g. .low-fare-destinations .lfd-price
 *   Action    hide | show | text | html | attr | add-class | remove-class | remove
 *   Value     text / html / "name=value" / class name
 *   Device    all (default) | desktop | mobile
 *   Start     optional ISO date-time (UTC unless offset given)
 *   End       optional ISO date-time
 *
 * Anything that needs real JavaScript goes to /injections (see scripts/injections.js),
 * so all authored JS lives in that single, permission-restricted document.
 */

const OVERRIDES_URL = '/overrides.json';
const DESKTOP_MQ = '(min-width: 900px)';

export function globToRegExp(glob) {
  const escaped = glob.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

const splitGlobs = (value) => `${value || ''}`.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

/**
 * Shared targeting used by overrides and injections:
 * Path (comma-separated globs, default *), Exclude (globs), Device, Start, End.
 */
export function matchesContext(rule, { path, now = new Date(), isDesktop = true }) {
  const include = splitGlobs(rule.Path);
  if (!(include.length ? include : ['*']).some((g) => globToRegExp(g).test(path))) return false;
  if (splitGlobs(rule.Exclude).some((g) => globToRegExp(g).test(path))) return false;
  const device = `${rule.Device || 'all'}`.trim().toLowerCase();
  if (device === 'desktop' && !isDesktop) return false;
  if (device === 'mobile' && isDesktop) return false;
  if (rule.Start && now < new Date(rule.Start)) return false;
  if (rule.End && now > new Date(rule.End)) return false;
  return true;
}

export function isActive(rule, ctx) {
  return Boolean(rule.Selector) && matchesContext(rule, ctx);
}

function sanitizeHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll('script, iframe, object, embed, style, link, meta').forEach((n) => n.remove());
  tpl.content.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach(({ name, value }) => {
      if (name.startsWith('on') || /^\s*javascript:/i.test(value)) el.removeAttribute(name);
    });
  });
  return tpl;
}

/* Each action is idempotent so re-running it from the MutationObserver never loops. */
const ACTIONS = {
  show: (el) => { if (el.style.display === 'none' || el.hidden) { el.hidden = false; el.style.removeProperty('display'); } },
  text: (el, value) => { if (el.textContent !== value) el.textContent = value; },
  html: (el, value, id) => {
    if (el.dataset.overrideApplied === id) return;
    el.replaceChildren(sanitizeHtml(value).content.cloneNode(true));
    el.dataset.overrideApplied = id;
  },
  attr: (el, value) => {
    const idx = value.indexOf('=');
    const name = (idx < 0 ? value : value.slice(0, idx)).trim();
    const val = idx < 0 ? '' : value.slice(idx + 1).trim();
    if (!name || name.startsWith('on')) return;
    if (el.getAttribute(name) !== val) el.setAttribute(name, val);
  },
  'add-class': (el, value) => el.classList.add(...value.split(/\s+/).filter(Boolean)),
  'remove-class': (el, value) => el.classList.remove(...value.split(/\s+/).filter(Boolean)),
  remove: (el) => el.remove(),
};

function applyDomRules(rules, root = document) {
  rules.forEach((rule) => {
    const action = ACTIONS[rule.action];
    try {
      root.querySelectorAll(rule.Selector).forEach((el) => action(el, rule.Value || '', rule.id));
    } catch (e) {
      // invalid selector in the sheet: skip the rule rather than breaking the page
    }
  });
}

/**
 * Fetch and apply overrides. Call (without awaiting) from loadEager() in scripts.js
 * so "hide" rules are injected as CSS before blocks render, avoiding a flash of old content.
 */
export async function loadOverrides({ url = OVERRIDES_URL } = {}) {
  let json;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return;
    json = await resp.json();
  } catch (e) {
    return;
  }

  const ctx = {
    path: window.location.pathname.replace(/\.html$/, ''),
    isDesktop: window.matchMedia(DESKTOP_MQ).matches,
  };
  const sheet = json.overrides || json.data;
  const rules = ((Array.isArray(sheet) ? sheet : sheet?.data) || [])
    .map((r, i) => ({ ...r, id: `ov${i}`, action: (r.Action || '').trim().toLowerCase() }))
    .filter((r) => isActive(r, ctx));
  if (!rules.length) return;

  // 1) hide: CSS, applied immediately and to anything rendered later
  const hideCss = rules.filter((r) => r.action === 'hide')
    .map((r) => `${r.Selector}{display:none!important}`);
  if (hideCss.length) {
    const style = document.createElement('style');
    style.id = 'page-overrides';
    style.textContent = hideCss.join('\n');
    document.head.append(style);
  }

  // 2) DOM rules: apply now and whenever blocks/fragments decorate later
  const domRules = rules.filter((r) => ACTIONS[r.action]);
  if (domRules.length) {
    applyDomRules(domRules);
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; applyDomRules(domRules); });
    }).observe(document.body, { childList: true, subtree: true });
  }
}
