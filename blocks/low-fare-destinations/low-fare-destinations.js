/*
 * Low Fare Destinations block
 * EDS port of the AEM "Low Fare Destination Tiles" component (MH Revamp).
 *
 * Authoring (works for both document-based and Universal Editor / xwalk):
 *   - Destination rows (>= 4 cells, first cell = 3-letter origin airport code):
 *       | KUL | Kuala Lumpur | Tokyo | NRT | <portrait img> | <landscape img> | <link> |
 *   - Config rows (2 cells, key | value):
 *       | Title       | Explore our top destinations from |
 *       | View all    | <link>                              |
 *       | Price label | All-in return from                  |
 *       | Fare API    | https://.../fares?from={origin}&to={destination} |
 *   - Single-cell rows: a link -> "View all" button, plain text -> title.
 *
 * Block options (classes): variant-1 | variant-2 (3 tiles, default), hide-desktop, hide-mobile
 */
import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';

const MAX_ORIGINS = 5;
const MAX_DESTINATIONS = 15;
const FARE_CACHE_TTL = 30 * 60 * 1000;
const DESKTOP_MQ = '(min-width: 900px)';

const toKey = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
const isAirportCode = (text) => /^[A-Z]{3}$/.test(text.trim());

function readCookie(name) {
  if (!name) return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

/**
 * Parse block rows into { config, origins: Map<code, { city, destinations[] }> }.
 */
export function parseRows(rows) {
  const config = {};
  const origins = new Map();

  rows.forEach((row) => {
    const cells = [...row.children];
    const firstText = cells[0]?.textContent.trim() || '';

    if (cells.length >= 4 && isAirportCode(firstText)) {
      const [
        originCell, cityCell, nameCell, codeCell, portraitCell, landscapeCell, linkCell,
      ] = cells;
      const originCode = originCell.textContent.trim().toUpperCase();
      if (!origins.has(originCode)) {
        if (origins.size >= MAX_ORIGINS) return;
        origins.set(originCode, { city: cityCell.textContent.trim(), destinations: [] });
      }
      const origin = origins.get(originCode);
      if (origin.destinations.length >= MAX_DESTINATIONS) return;
      origin.destinations.push({
        name: nameCell.textContent.trim(),
        code: codeCell.textContent.trim().toUpperCase(),
        portrait: portraitCell?.querySelector('img'),
        landscape: landscapeCell?.querySelector('img'),
        href: linkCell?.querySelector('a')?.href || linkCell?.textContent.trim() || '',
      });
      return;
    }

    if (cells.length === 2) {
      const key = toKey(firstText);
      const link = cells[1].querySelector('a');
      config[key] = link
        ? { href: link.href, text: link.textContent.trim() }
        : cells[1].textContent.trim();
      return;
    }

    if (cells.length === 1) {
      const link = cells[0].querySelector('a');
      if (link) config['view-all'] = { href: link.href, text: link.textContent.trim() };
      else if (firstText) config.title = firstText;
    }
  });

  return { config, origins };
}

/**
 * Origin priority: ?origin= -> cookie -> page metadata "origin" -> first authored origin.
 */
export function resolveOrigin(origins, { search = window.location.search, cookieName } = {}) {
  const candidates = [
    new URLSearchParams(search).get('origin'),
    readCookie(cookieName),
    getMetadata('origin'),
  ].filter(Boolean).map((c) => c.toUpperCase());
  const hit = candidates.find((c) => origins.has(c));
  return hit || origins.keys().next().value;
}

const jsonRequests = new Map();
function getJson(url) {
  if (!jsonRequests.has(url)) {
    jsonRequests.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return jsonRequests.get(url);
}

/**
 * Fare API adapter. Supports:
 *  - per-route endpoint returning { price, currency } or { data: { price, currency } }
 *  - a sheet (e.g. /fares.json) with columns Origin | Destination | Price | Currency
 */
export function pickFare(json, origin, destination) {
  if (!json) return null;
  const sheet = json.fares || json.data;
  const rows = Array.isArray(sheet) ? sheet : sheet?.data;
  const data = Array.isArray(rows)
    ? rows.find((r) => `${r.Origin || ''}`.trim().toUpperCase() === origin
      && `${r.Destination || ''}`.trim().toUpperCase() === destination)
    : (json.data || json);
  if (!data) return null;
  const raw = `${data.price ?? data.Price ?? data.amount ?? ''}`.replace(/,/g, '').trim();
  const price = Number(raw);
  if (!raw || !Number.isFinite(price)) return null;
  return { price, currency: `${data.currency || data.Currency || 'MYR'}`.trim() };
}

async function fetchFare(template, origin, destination) {
  if (!template) return null;
  const cacheKey = `lfd:${origin}-${destination}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.ts < FARE_CACHE_TTL) return cached.fare;
  } catch (e) { /* storage unavailable */ }

  const url = template
    .replace('{origin}', encodeURIComponent(origin))
    .replace('{destination}', encodeURIComponent(destination));
  const fare = pickFare(await getJson(url), origin, destination);
  if (fare) {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), fare }));
    } catch (e) { /* ignore */ }
  }
  return fare;
}

function formatFare({ price, currency }) {
  return `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(price)}`;
}

function buildPicture(dest) {
  const base = dest.portrait || dest.landscape;
  if (!base) return null;
  const picture = createOptimizedPicture(base.src, dest.name, false, [{ width: '750' }]);
  if (dest.landscape && dest.portrait) {
    const desktop = createOptimizedPicture(dest.landscape.src, dest.name, false, [
      { media: DESKTOP_MQ, width: '1200' },
    ]);
    // Keep only the desktop <source>s and put them first so they win on wide screens.
    desktop.querySelectorAll(`source[media="${DESKTOP_MQ}"]`).forEach((s) => picture.prepend(s));
  }
  return picture;
}

function buildTile(dest, priceLabel) {
  const li = document.createElement('li');
  li.className = 'lfd-tile';
  li.dataset.destination = dest.code;

  const inner = document.createElement(dest.href ? 'a' : 'div');
  inner.className = 'lfd-tile-inner';
  if (dest.href) inner.href = dest.href;

  const picture = buildPicture(dest);
  if (picture) inner.append(picture);

  const text = document.createElement('div');
  text.className = 'lfd-tile-text';
  text.innerHTML = `
    <p class="lfd-name"></p>
    <p class="lfd-label"></p>
    <p class="lfd-price" aria-live="polite"></p>`;
  text.querySelector('.lfd-name').textContent = dest.name;
  text.querySelector('.lfd-label').textContent = priceLabel;
  inner.append(text);
  li.append(inner);
  return li;
}

export default async function decorate(block) {
  const { config, origins } = parseRows([...block.children]);
  block.textContent = '';
  if (!origins.size) return;

  if (![...block.classList].some((c) => c.startsWith('variant-'))) block.classList.add('variant-2');

  const originCode = resolveOrigin(origins, {
    cookieName: config['origin-cookie'] || getMetadata('low-fare-origin-cookie'),
  });
  const origin = origins.get(originCode);
  block.dataset.origin = originCode;

  const titleText = typeof config.title === 'string' ? config.title : 'Explore our top destinations from';
  const heading = document.createElement('h2');
  heading.className = 'lfd-title';
  heading.textContent = `${titleText} ${origin.city}`.trim();

  const priceLabel = typeof config['price-label'] === 'string' ? config['price-label'] : 'All-in return from';
  const list = document.createElement('ul');
  list.className = 'lfd-tiles';
  const tiles = origin.destinations.map((dest) => buildTile(dest, priceLabel));
  list.append(...tiles);

  block.append(heading, list);

  const viewAll = config['view-all'];
  if (viewAll?.href) {
    const p = document.createElement('p');
    p.className = 'button-container lfd-view-all';
    const a = document.createElement('a');
    a.className = 'button primary';
    a.href = viewAll.href;
    a.textContent = viewAll.text && !viewAll.text.startsWith('http') ? viewAll.text : 'View all';
    p.append(a);
    block.append(p);
  }

  // Prices are filled asynchronously so the tiles (and LCP image) render immediately.
  // Docs auto-link URLs; use the link text (href would URL-encode the {origin} placeholders).
  const fareCfg = config['fare-api'];
  const fareApi = (typeof fareCfg === 'string' ? fareCfg : fareCfg?.text)
    || getMetadata('low-fare-api');
  if (!fareApi) {
    block.classList.add('no-price');
    return;
  }
  origin.destinations.forEach(async (dest, i) => {
    const fare = await fetchFare(fareApi, originCode, dest.code);
    const tile = tiles[i];
    if (fare) {
      tile.querySelector('.lfd-price').textContent = formatFare(fare);
      tile.classList.add('has-price');
    } else {
      tile.classList.add('price-unavailable');
    }
  });
}
