/*
 * Authored JavaScript injections (EDS replacement for the AEM "Script executor").
 *
 * ALL authored JS lives in ONE document: the /injections spreadsheet.
 *   - Who can change it  = who has edit rights on that document (SharePoint / AEM ACL)
 *   - History            = the document's version history + EDS publish log
 *                          + Git snapshot (tools/snapshot-injections.mjs)
 * This loader never reads JS from anywhere else.
 *
 * Sheet "scripts" (or a single-sheet workbook) columns:
 *   ID        unique id, e.g. INJ-001 (required; duplicates are ignored)
 *   Enabled   TRUE to run (anything else = off)
 *   Path      comma-separated globs, e.g. /my/en/*, /sg/en/home (default: all pages)
 *   Exclude   optional globs
 *   Device    all | desktop | mobile
 *   Timing    eager | lazy (default, after all blocks are decorated) | delayed
 *   Start/End optional ISO date-time window
 *   Script    the JavaScript (runs inside an async function; `inject` helper is available)
 *   Owner / Ticket / Note   free text for the audit trail (not used at runtime)
 *
 * Optional sheet "settings": Key | Value, with Key "enabled" = FALSE as a global kill switch.
 * Per page kill switch: page metadata "injections: off". Debug: ?injections=off
 *
 * Inside a script:
 *   const el = await inject.waitFor('.low-fare-destinations .lfd-price');
 *   inject.log('patched', el);
 */

import { matchesContext } from './overrides.js';

const INJECTIONS_URL = '/injections.json';
const DESKTOP_MQ = '(min-width: 900px)';
const PHASES = ['eager', 'lazy', 'delayed'];
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Rows of a sheet: accepts [..] or { data: [..] } (single- and multi-sheet JSON). */
export const sheetRows = (sheet) => (Array.isArray(sheet) ? sheet : sheet?.data) || [];

const isTrue = (v) => /^(true|yes|on|1)$/i.test(`${v ?? ''}`.trim());
const isOff = (v) => /^(false|no|off|0)$/i.test(`${v ?? ''}`.trim());

/** Pure selection logic (unit-testable): which injections run on this page. */
export function selectInjections(json, ctx) {
  const rows = sheetRows(json?.scripts || json?.data);
  const settings = Object.fromEntries(sheetRows(json?.settings)
    .map((r) => [`${r.Key || ''}`.trim().toLowerCase(), r.Value]));
  if (isOff(settings.enabled)) return [];

  const seen = new Set();
  return rows
    .map((r) => ({
      ...r,
      id: `${r.ID || ''}`.trim(),
      timing: `${r.Timing || 'lazy'}`.trim().toLowerCase(),
      code: `${r.Script || ''}`,
    }))
    .filter((r) => {
      if (!SAFE_ID.test(r.id) || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .filter((r) => isTrue(r.Enabled) && r.code.trim() && PHASES.includes(r.timing))
    .filter((r) => matchesContext(r, ctx));
}

function emit(id, status, error) {
  document.dispatchEvent(new CustomEvent('mag:injection', { detail: { id, status, error: error?.message } }));
}

function waitFor(selector, { timeout = 10000, root = document } = {}) {
  return new Promise((resolve) => {
    const found = root.querySelector(selector);
    if (found) { resolve(found); return; }
    const observer = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) { observer.disconnect(); resolve(el); }
    });
    const target = root === document ? document.documentElement : root;
    observer.observe(target, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}

const started = new Set();

function installRuntime() {
  if (window.magInjections) return;
  window.magInjections = {
    context(id) {
      started.add(id);
      const prefix = `[injection ${id}]`;
      return {
        id,
        waitFor,
        // eslint-disable-next-line no-console
        log: (...args) => console.info(prefix, ...args),
        fail: (e) => {
          // eslint-disable-next-line no-console
          console.error(prefix, 'failed', e);
          emit(id, 'error', e);
        },
        done: () => emit(id, 'done'),
      };
    },
  };
}

/**
 * Wrap authored code: isolated async scope, error capture,
 * shown in DevTools as injections/<id>.js
 */
export function wrapScript(id, code) {
  return `(async (inject) => {\ntry {\n${code}\n;inject.done();\n} catch (e) { inject.fail(e); }\n})(window.magInjections.context(${JSON.stringify(id)}));\n//# sourceURL=injections/${id}.js`;
}

function runOne(injection) {
  const { id, code } = injection;
  const el = document.createElement('script');
  // Reuse the page's CSP nonce (EDS boilerplate uses nonce + strict-dynamic).
  const nonce = document.querySelector('script[nonce]')?.nonce;
  if (nonce) el.nonce = nonce;
  el.dataset.injection = id;
  // textContent is never parsed as HTML, so "</script>" inside the code cannot break out.
  el.textContent = wrapScript(id, code);
  document.head.append(el);
  // Inline scripts execute synchronously on insertion; if context() was not reached,
  // the code has a syntax error or was blocked by CSP.
  if (!started.has(id)) {
    // eslint-disable-next-line no-console
    console.error(`[injection ${id}] did not start (syntax error or CSP block)`);
    emit(id, 'not-started');
  }
}

let loading;

/** Fetch /injections.json once (call early from loadEager, do not await). */
export function loadInjections() {
  if (loading) return loading;
  loading = (async () => {
    const params = new URLSearchParams(window.location.search);
    const pageMeta = document.head.querySelector('meta[name="injections"]')?.content;
    if (isOff(params.get('injections')) || isOff(pageMeta)) return [];
    try {
      const resp = await fetch(INJECTIONS_URL);
      if (!resp.ok) return [];
      const json = await resp.json();
      return selectInjections(json, {
        path: window.location.pathname.replace(/\.html$/, ''),
        isDesktop: window.matchMedia(DESKTOP_MQ).matches,
      });
    } catch (e) {
      return [];
    }
  })();
  return loading;
}

/** Run the injections for one phase: 'eager' | 'lazy' | 'delayed'. */
export async function runInjections(phase) {
  const list = await loadInjections();
  const todo = list.filter((i) => i.timing === phase);
  if (!todo.length) return;
  installRuntime();
  todo.forEach(runOne);
}
