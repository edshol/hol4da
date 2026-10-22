/*
 * Video Block
 * Inline player with a lightweight poster facade. Supports:
 *  - YouTube / youtu.be  -> privacy-friendly iframe
 *  - Direct video files  -> native <video> (mp4/webm/mov/… or Scene7 streams)
 * Autoplays muted when scrolled into view (IntersectionObserver), pauses when
 * scrolled out. Click the poster (YouTube) or use the controls to unmute.
 * Respects prefers-reduced-motion (no autoplay; plays on click).
 *
 * Source type detection (see classifySource):
 *  1. host  -> youtube
 *  2. file extension (.mp4/.webm/.m4v/.mov/.ogv) -> file
 *  3. ambiguous (Scene7 /is/content/, no extension) -> HEAD request,
 *     branch on Content-Type (video/*  or  application/x-mpegURL).
 *
 * Exports:
 *  - default decorate(block): the named "Video" block.
 *  - autoVideo(main): converts stray video links (e.g. inside a columns cell)
 *    into the same player. Called from scripts.js after sections load.
 */

const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|m4v|mov)(\?|#|$)/i;

function parseYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url, window.location.href);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1) || null;
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([^/?]+)/);
      if (m) return m[1];
    }
  } catch (e) { /* not a full URL — fall through */ }
  const bare = url.trim().match(/^[\w-]{11}$/);
  return bare ? bare[0] : null;
}

/**
 * Classify a URL into a renderable video source.
 * @returns {{kind:'youtube',id}|{kind:'file',src}|{kind:'probe',src}|null}
 *   null = definitely not something we render. 'probe' = needs a HEAD check.
 */
function classifySource(url) {
  if (!url) return null;
  const id = parseYouTubeId(url);
  if (id) return { kind: 'youtube', id };
  let u;
  try { u = new URL(url, window.location.href); } catch (e) { return null; }
  if (VIDEO_EXT.test(u.pathname) || VIDEO_EXT.test(u.search)) {
    return { kind: 'file', src: u.href };
  }
  // Extension-less Scene7 / DM content endpoints: could be video, image or PDF.
  if (u.hostname.endsWith('scene7.com') || /\/is\/content\//.test(u.pathname)) {
    return { kind: 'probe', src: u.href };
  }
  return null;
}

/** HEAD the URL and report whether it is a playable video. */
async function isVideoUrl(src) {
  try {
    const resp = await fetch(src, { method: 'HEAD' });
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    return ct.startsWith('video/') || ct.includes('mpegurl');
  } catch (e) {
    return false;
  }
}

/* Ensure video.css is present even when the player is built by autoVideo
   (i.e. without the block loader injecting the stylesheet). */
function ensureCss() {
  const href = `${window.hlx?.codeBasePath || ''}/blocks/video/video.css`;
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }
}

function command(iframe, func) {
  iframe?.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func, args: [] }),
    '*',
  );
}

function buildIframe(id, mute) {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: mute ? '1' : '0',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    enablejsapi: '1',
    origin: window.location.origin,
  });
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube-nocookie.com/embed/${id}?${params}`;
  iframe.title = 'YouTube video player';
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
  iframe.setAttribute('allowfullscreen', '');
  iframe.loading = 'lazy';
  return iframe;
}

/** YouTube: poster facade + lazy iframe, muted autoplay on scroll. */
function renderYouTube(container, id, posterPicture, posterImg) {
  ensureCss();
  container.textContent = '';

  const facade = document.createElement('button');
  facade.type = 'button';
  facade.className = 'video-facade';
  facade.setAttribute('aria-label', '動画を再生');

  if (posterPicture) {
    facade.append(posterPicture);
  } else {
    const img = posterImg || document.createElement('img');
    img.src = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
    img.alt = '';
    img.loading = 'lazy';
    facade.append(img);
  }
  const play = document.createElement('span');
  play.className = 'video-play';
  play.setAttribute('aria-hidden', 'true');
  facade.append(play);
  container.append(facade);

  const unmute = document.createElement('button');
  unmute.type = 'button';
  unmute.className = 'video-unmute';
  unmute.textContent = '🔇 音声をON';

  let iframe = null;
  const load = (mute) => {
    if (iframe) return;
    iframe = buildIframe(id, mute);
    container.append(iframe);
    container.classList.add('video-loaded');
    if (mute) container.append(unmute);
  };

  unmute.addEventListener('click', () => {
    command(iframe, 'unMute');
    command(iframe, 'playVideo');
    unmute.remove();
  });

  facade.addEventListener('click', () => load(false));

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (!iframe) load(true);
          else command(iframe, 'playVideo');
        } else if (iframe) {
          command(iframe, 'pauseVideo');
        }
      });
    }, { threshold: 0.5 });
    io.observe(container);
  }
}

/** Direct video file (mp4/webm/Scene7…): native <video>, muted autoplay on scroll. */
function renderFile(container, src, posterUrl) {
  ensureCss();
  container.textContent = '';

  const video = document.createElement('video');
  video.src = src;
  video.controls = true;
  video.playsInline = true;
  video.muted = true;
  video.setAttribute('muted', ''); // iOS needs the attribute too
  video.preload = 'metadata';
  if (posterUrl) video.poster = posterUrl;
  container.append(video);
  container.classList.add('video-loaded');

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const p = video.play();
          if (p?.catch) p.catch(() => { /* autoplay blocked — leave controls */ });
        } else {
          video.pause();
        }
      });
    }, { threshold: 0.5 });
    io.observe(container);
  }
}

function showError(container) {
  container.textContent = '';
  container.innerHTML = '<p class="video-error">再生できる動画が見つかりません。</p>';
}

/** Render whatever `url` resolves to into `container` (a .video.block element). */
async function renderInto(container, url, posterPicture, posterImg) {
  const src = classifySource(url);
  const posterUrl = posterImg?.src || posterPicture?.querySelector('img')?.src || null;
  if (!src) { showError(container); return; }
  if (src.kind === 'youtube') {
    renderYouTube(container, src.id, posterPicture, posterImg);
  } else if (src.kind === 'file') {
    renderFile(container, src.src, posterUrl);
  } else if (src.kind === 'probe') {
    if (await isVideoUrl(src.src)) renderFile(container, src.src, posterUrl);
    else showError(container);
  }
}

export default function decorate(block) {
  const link = block.querySelector('a[href]');
  const textUrl = link ? null : (block.textContent.match(/https?:\/\/\S+|[\w-]{11}/) || [])[0];
  const url = link ? link.getAttribute('href') : textUrl;
  const posterPicture = block.querySelector('picture');
  const posterImg = posterPicture ? null : block.querySelector('img');
  renderInto(block, url, posterPicture, posterImg);
}

/**
 * Converts stray video links anywhere in `main` into the player.
 * Skips links already inside a .video.block (handled by the named block)
 * and links in site chrome (header/footer/nav). This is what makes a
 * YouTube / Scene7 / mp4 URL work inside a columns cell.
 */
export function autoVideo(main) {
  main.querySelectorAll('a[href]').forEach((a) => {
    if (a.closest('.video.block') || a.closest('header, footer, nav')) return;
    const href = a.getAttribute('href');
    const src = classifySource(href);
    if (!src) return;
    const convert = () => {
      const wrapper = document.createElement('div');
      wrapper.className = 'video block';
      const host = a.closest('p') || a;
      host.replaceWith(wrapper);
      renderInto(wrapper, href);
    };
    if (src.kind === 'probe') {
      // confirm it is really a video before replacing the author's link
      isVideoUrl(src.src).then((ok) => { if (ok) convert(); });
    } else {
      convert();
    }
  });
}
