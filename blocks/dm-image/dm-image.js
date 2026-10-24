/*
 * DM Image Block — responsive images from AEM "Dynamic Media with OpenAPI"
 * with Smart Crop, for Edge Delivery Services (da.live) and Universal Editor.
 *
 * Why a block (and not a plain <img>): helix localizes external <img src> to
 * ./media_<hash> and would strip the Dynamic Media query parameters (width,
 * smartcrop, …). So the author pastes the DM delivery URL as a LINK and this
 * block builds the responsive <picture>/<img> on the client, keeping the
 * smartcrop/width params intact — same approach as the video block.
 *
 * Smart Crop is DELIVERY-side: the asset's folder must have an Image Profile
 * with named Smart Crops, the asset approved for Delivery. The named crop is
 * requested via `?smartcrop=<ProfileName>`. (Smart Crop is images only.)
 *
 * Authoring (block name "DM Image"):
 *   | DM Image                                                     |
 *   | https://delivery-p…-e….adobeaemcloud.com/adobe/assets/urn:…/as/photo.jpg |
 *   | smartcrop | Wide           |   <- single named crop for all sizes (optional)
 *   | alt       | A scenic coast |   <- alt text (optional)
 *   | sizes     | (max-width:600px) 100vw, 50vw |  (optional)
 *   | widths    | 375,768,1200,2000 |              (optional override)
 *
 * Art direction (different Smart Crop per breakpoint — the compelling demo):
 *   | mobile  | Square |   <- crop used up to 600px
 *   | desktop | Wide   |   <- crop used from 601px
 *   | caption | Square on mobile · Wide on desktop |  (optional label)
 */

const DEFAULT_WIDTHS = [375, 640, 750, 1024, 1366, 1600, 2000];
const DEFAULT_SIZES = '(max-width: 600px) 100vw, (max-width: 1200px) 60vw, 50vw';

/** Append Dynamic Media delivery parameters to a base image URL. */
function dmSrc(base, width, crop) {
  let u;
  try { u = new URL(base, window.location.href); } catch (e) { return base; }
  // If only the asset base was pasted (…/adobe/assets/<urn>), add a seo name.
  if (/\/adobe\/assets\/[^/]+$/.test(u.pathname)) u.pathname += '/as/asset.jpg';
  u.searchParams.set('width', String(width));
  u.searchParams.set('quality', '85');
  u.searchParams.set('preferwebp', 'true');
  if (crop) u.searchParams.set('smartcrop', crop);
  else u.searchParams.delete('smartcrop');
  return u.href;
}

/** Build an <img> with a width-based srcset for one crop. */
function buildImg(base, widths, crop, sizes, alt, eager) {
  const img = document.createElement('img');
  img.loading = eager ? 'eager' : 'lazy';
  img.alt = alt || '';
  img.sizes = sizes || DEFAULT_SIZES;
  const mid = widths[Math.floor(widths.length / 2)];
  img.src = dmSrc(base, mid, crop);
  img.srcset = widths.map((w) => `${dmSrc(base, w, crop)} ${w}w`).join(', ');
  return img;
}

/** Parse the block's rows into { url, config{} }. */
function parse(block) {
  const cfg = {};
  let url = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const link = row.querySelector('a[href]');
    if (link && !url) { url = link.getAttribute('href'); return; }
    // a bare URL sitting in a single cell
    if (!url && cells.length === 1) {
      const t = cells[0].textContent.trim();
      if (/^https?:\/\/\S+$/.test(t)) { url = t; return; }
    }
    if (cells.length >= 2) {
      const key = cells[0].textContent.trim().toLowerCase();
      const val = cells[1].textContent.trim();
      if (key) cfg[key] = val;
    }
  });
  return { url, cfg };
}

export default function decorate(block) {
  const { url, cfg } = parse(block);
  if (!url) { block.textContent = ''; return; }

  const widths = (cfg.widths
    ? cfg.widths.split(',').map((n) => parseInt(n.trim(), 10)).filter(Boolean)
    : DEFAULT_WIDTHS);
  const sizes = cfg.sizes || DEFAULT_SIZES;
  const alt = cfg.alt || '';

  const figure = document.createElement('figure');
  figure.className = 'dm-image-figure';

  if (cfg.mobile || cfg.desktop) {
    // Art-directed: a different Smart Crop per breakpoint.
    const picture = document.createElement('picture');
    if (cfg.mobile) {
      const s = document.createElement('source');
      s.media = '(max-width: 600px)';
      s.srcset = widths.map((w) => `${dmSrc(url, w, cfg.mobile)} ${w}w`).join(', ');
      s.sizes = sizes;
      picture.append(s);
    }
    if (cfg.desktop) {
      const s = document.createElement('source');
      s.media = '(min-width: 601px)';
      s.srcset = widths.map((w) => `${dmSrc(url, w, cfg.desktop)} ${w}w`).join(', ');
      s.sizes = sizes;
      picture.append(s);
    }
    picture.append(buildImg(url, widths, cfg.desktop || cfg.mobile, sizes, alt));
    figure.append(picture);
  } else {
    // Single crop (or none) with a width-based srcset.
    figure.append(buildImg(url, widths, cfg.smartcrop, sizes, alt));
  }

  if (cfg.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'dm-image-caption';
    cap.textContent = cfg.caption;
    figure.append(cap);
  }

  block.textContent = '';
  block.append(figure);
}
