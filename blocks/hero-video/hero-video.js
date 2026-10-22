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

import { classifySource, isVideoUrl } from '../video/video.js';

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

  // direct file or Scene7 (confirm via HEAD for the ambiguous case)
  if (src.kind === 'probe' && !(await isVideoUrl(src.src))) return null;
  const video = document.createElement('video');
  video.src = src.src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  return { el: video, type: 'file' };
}

export default async function decorate(block) {
  const url = extractVideoUrl(block);

  // Remaining text becomes the teaser overlay.
  const title = block.querySelector('h1, h2, h3, h4, h5, h6');
  const paras = [...block.querySelectorAll('p')].filter((p) => p.textContent.trim());
  let eyebrow = null;
  let description = paras;
  if (title) {
    eyebrow = paras.find((p) => title.compareDocumentPosition(p)
      & Node.DOCUMENT_POSITION_PRECEDING) || null;
    description = paras.filter((p) => title.compareDocumentPosition(p)
      & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  const content = document.createElement('div');
  content.className = 'hero-video-content';
  if (eyebrow) { eyebrow.className = 'hero-video-eyebrow'; content.append(eyebrow); }
  if (title) content.append(title);
  description.forEach((p) => { p.className = 'hero-video-description'; content.append(p); });

  const bg = document.createElement('div');
  bg.className = 'hero-video-bg';
  bg.setAttribute('aria-hidden', 'true');

  block.textContent = '';
  block.append(bg, content);

  if (!url) return;
  const media = await buildBackground(url);
  if (!media) return;
  bg.append(media.el);

  // Play only while on screen (perf), and honour reduced-motion.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (media.type === 'file' && !reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const p = media.el.play();
          if (p?.catch) p.catch(() => { /* autoplay blocked */ });
        } else {
          media.el.pause();
        }
      });
    }, { threshold: 0.1 });
    io.observe(block);
  } else if (media.type === 'file' && !reduce) {
    media.el.autoplay = true;
  }
}
