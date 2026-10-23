/*
 * Hero Video Block
 * Full-bleed background video with an overlaid teaser (eyebrow / title /
 * description). The background plays muted + looped and pauses when scrolled
 * out of view. Reuses the video block's source detection, so the background
 * works with YouTube, direct files (mp4/webm) and Scene7 /is/content/ URLs.
 *
 * Authoring (name the block "Hero Video"):
 *   | Hero Video                         |
 *   | https://…/video.mp4                |  <- background video (link or text)
 *   | Discover                           |  <- eyebrow / subtitle (optional)
 *   | # Elevating your journey           |  <- title (any heading)
 *   | A short supporting description.     |  <- description (optional)
 */

import { classifySource, isVideoUrl, attachSource } from '../video/video.js';

/** Pull the first video URL out of the block and remove its element. */
function extractVideoUrl(block) {
  const a = [...block.querySelectorAll('a[href]')]
    .find((el) => classifySource(el.getAttribute('href')));
  if (a) {
    const url = a.getAttribute('href');
    const p = a.closest('p');
    (p && p.textContent.trim() === a.textContent.trim() ? p : a).remove();
    return url;
  }
  const p = [...block.querySelectorAll('p')].find((el) => {
    const t = el.textContent.trim();
    return /^https?:\/\/\S+$/.test(t) && classifySource(t);
  });
  if (p) { const url = p.textContent.trim(); p.remove(); return url; }
  return null;
}

/** Build the background media element for `url` and start it (muted loop). */
async function buildBackground(url) {
  const src = classifySource(url);
  if (!src) return null;

  if (src.kind === 'youtube') {
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      loop: '1',
      playlist: src.id,
      controls: '0',
      modestbranding: '1',
      playsinline: '1',
      rel: '0',
      disablekb: '1',
    });
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${src.id}?${params}`;
    iframe.title = '';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    iframe.loading = 'lazy';
    return { el: iframe, type: 'youtube' };
  }

  // direct file, HLS (incl. next-gen DM), or Scene7 (HEAD-probe the ambiguous)
  if (src.kind === 'probe' && !(await isVideoUrl(src.src))) return null;
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  attachSource(video, src.src, src.kind === 'hls');
  return { el: video, type: 'file' };
}

export default async function decorate(block) {
  const url = extractVideoUrl(block);

  // Rescue markdown-style "## Title" that da.live left as plain text:
  // promote any paragraph starting with #..###### into a real heading.
  [...block.querySelectorAll('p')].forEach((p) => {
    const m = p.textContent.match(/^(#{1,6})\s+(.+)/s);
    if (m) {
      const h = document.createElement(`h${m[1].length}`);
      h.textContent = m[2].trim();
      p.replaceWith(h);
    }
  });

  // Rescue markdown-style links "[text](url)" that da.live left as plain text.
  [...block.querySelectorAll('p')].forEach((p) => {
    if (!/\[[^\]]+\]\([^)]+\)/.test(p.textContent)) return;
    p.innerHTML = p.innerHTML.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_, text, href) => `<a href="${href.trim()}">${text}</a>`,
    );
  });

  // Remaining content becomes the teaser overlay.
  const title = block.querySelector('h1, h2, h3, h4, h5, h6');
  const allParas = [...block.querySelectorAll('p')].filter((p) => p.textContent.trim());
  // CTA paragraphs contain a link (decorateButtons already ran on the block).
  const actions = allParas.filter((p) => p.querySelector('a'));
  const textParas = allParas.filter((p) => !p.querySelector('a'));

  let eyebrow = null;
  let description = textParas;
  if (title) {
    eyebrow = textParas.find((p) => title.compareDocumentPosition(p)
      & Node.DOCUMENT_POSITION_PRECEDING) || null;
    description = textParas.filter((p) => title.compareDocumentPosition(p)
      & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  const content = document.createElement('div');
  content.className = 'hero-video-content';
  if (eyebrow) { eyebrow.className = 'hero-video-eyebrow'; content.append(eyebrow); }
  if (title) content.append(title);
  description.forEach((p) => { p.className = 'hero-video-description'; content.append(p); });
  if (actions.length) {
    const cta = document.createElement('div');
    cta.className = 'hero-video-actions';
    actions.forEach((p) => {
      p.classList.add('button-container');
      p.querySelectorAll('a').forEach((a) => a.classList.add('button'));
      cta.append(p);
    });
    content.append(cta);
  }

  const bg = document.createElement('div');
  bg.className = 'hero-video-bg';
  bg.setAttribute('aria-hidden', 'true');

  block.textContent = '';
  block.append(bg, content);

  if (!url) return;

  // Honour reduced-motion: no autoplaying background at all.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  // Lazily build + play the background ONLY while the hero is on screen. This
  // stops stacked heroes (and heavy YouTube embeds) from all loading at once —
  // the cause of the page/canvas freezing — and keeps the work off the critical
  // path on a normal single-hero page.
  let media;
  let building = false;
  const start = async () => {
    if (!media && !building) {
      building = true;
      media = await buildBackground(url);
      building = false;
      if (media) bg.append(media.el);
    }
    if (media?.type === 'file') {
      const p = media.el.play();
      if (p?.catch) p.catch(() => { /* autoplay blocked — leave it paused */ });
    }
  };
  const stop = () => { if (media?.type === 'file') media.el.pause(); };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) start(); else stop(); });
    }, { threshold: 0.1, rootMargin: '200px' });
    io.observe(block);
  } else {
    start();
  }
}
