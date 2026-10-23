/*
 * Video Block
 * Lightweight, performance-first inline player.
 *
 * Playback defaults by source kind (native <video> is cheap to autoplay, the
 * YouTube embed is not):
 *  - Direct file / Dynamic Media (Scene7) -> muted autoplay when scrolled into
 *    view (IntersectionObserver), paused when it leaves. A native <video> has
 *    no heavy player JS, so this does not freeze the page or wreck PageSpeed.
 *  - YouTube -> click-to-play: only a poster facade renders on load; the ~0.5MB
 *    embed is fetched only when the visitor clicks. This keeps the page fast
 *    and lets Lighthouse/PageSpeed score high (the heavy player never loads
 *    during an automated run).
 *
 * VARIANT "autoplay" (block name "Video youtube autoplay") = force muted
 * autoplay for YouTube too. Use only where the motion matters more than the
 * performance budget. (File/DM already autoplay, so the class is redundant
 * there.)
 *
 * Supported sources (see classifySource):
 *  - YouTube / youtu.be                      -> privacy-friendly iframe
 *  - Direct files (.mp4/.webm/.m4v/.mov/.ogv) -> native <video>
 *  - AEM Dynamic Media / Scene7 (/is/content/, no extension) -> HEAD probe,
 *    then native <video> when Content-Type is video/* or application/x-mpegURL.
 *
 * Exports:
 *  - default decorate(block): the named "Video" block.
 *  - autoVideo(main): converts stray video links (e.g. inside a columns cell)
 *    into the same click-to-play player. Called from scripts.js.
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
export function classifySource(url) {
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
export async function isVideoUrl(src) {
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

/** The poster + play-button facade. Renders nothing heavy; just an image. */
function buildFacade(posterPicture, posterImg, posterUrl, ytId) {
  const facade = document.createElement('button');
  facade.type = 'button';
  facade.className = 'video-facade';
  facade.setAttribute('aria-label', '動画を再生');
  if (posterPicture) {
    facade.append(posterPicture);
  } else {
    const img = posterImg || document.createElement('img');
    if (!img.getAttribute('src')) {
      const src = posterUrl || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '');
      if (src) img.src = src;
    }
    img.alt = '';
    img.loading = 'lazy';
    if (img.getAttribute('src')) facade.append(img);
  }
  const play = document.createElement('span');
  play.className = 'video-play';
  play.setAttribute('aria-hidden', 'true');
  facade.append(play);
  return facade;
}

function buildUnmute() {
  const unmute = document.createElement('button');
  unmute.type = 'button';
  unmute.className = 'video-unmute';
  unmute.textContent = '🔇 音声をON';
  return unmute;
}

/** YouTube: poster facade; the iframe loads on click (default) or, for the
    "autoplay" variant, muted when scrolled into view. */
function renderYouTube(container, id, posterPicture, posterImg, autoplay) {
  ensureCss();
  container.textContent = '';
  const facade = buildFacade(posterPicture, posterImg, null, id);
  container.append(facade);

  const unmute = buildUnmute();
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

  if (!autoplay) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
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

/** Direct file / Dynamic Media: click-to-play facade by default (the <video>
    and its stream are created only on click), muted autoplay for the variant. */
function renderFile(container, src, posterUrl, autoplay) {
  ensureCss();
  container.textContent = '';

  const mkVideo = (muted) => {
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.playsInline = true;
    if (muted) { video.muted = true; video.setAttribute('muted', ''); }
    video.preload = 'metadata';
    if (posterUrl) video.poster = posterUrl;
    return video;
  };

  if (!autoplay) {
    const facade = buildFacade(null, null, posterUrl, null);
    container.append(facade);
    facade.addEventListener('click', () => {
      const video = mkVideo(false);
      container.append(video);
      container.classList.add('video-loaded');
      const p = video.play();
      if (p?.catch) p.catch(() => { /* leave the native controls */ });
    }, { once: true });
    return;
  }

  const video = mkVideo(true);
  container.append(video);
  container.classList.add('video-loaded');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
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

function showError(container) {
  container.textContent = '';
  container.innerHTML = '<p class="video-error">再生できる動画が見つかりません。</p>';
}

/* Source-type variants let the author declare the kind, so we skip runtime
   detection (and the Dynamic Media HEAD probe) entirely — no wasted request.
   e.g. block name "Video dm", "Video mp4 autoplay", "Video youtube". */
const TYPE_VARIANTS = {
  youtube: 'youtube',
  yt: 'youtube',
  mp4: 'file',
  file: 'file',
  webm: 'file',
  dm: 'file',
  dynamicmedia: 'file',
  'dynamic-media': 'file',
  scene7: 'file',
};

function forcedKind(block) {
  const hit = [...block.classList].find((c) => TYPE_VARIANTS[c]);
  return hit ? TYPE_VARIANTS[hit] : null;
}

/** Render whatever `url` resolves to into `container` (a .video.block element).
    `forced` ('youtube' | 'file' | null) comes from a source-type variant and,
    when set, bypasses classifySource so no HEAD probe is made.
    `autoplayFiles` autoplays native-video sources (file / Scene7) muted by
    default — cheap and freeze-free, unlike the YouTube embed, which autoplays
    only when `autoplay` is set. */
async function renderInto(container, url, posterPicture, posterImg, autoplay, forced, autoplayFiles = false) {
  let src;
  if (forced === 'youtube') {
    src = { kind: 'youtube', id: parseYouTubeId(url) };
  } else if (forced === 'file') {
    try { src = { kind: 'file', src: new URL(url, window.location.href).href }; } catch (e) { src = null; }
  } else {
    src = classifySource(url);
  }
  const posterUrl = posterImg?.src || posterPicture?.querySelector('img')?.src || null;
  if (!src || (src.kind === 'youtube' && !src.id)) { showError(container); return; }
  if (src.kind === 'youtube') {
    renderYouTube(container, src.id, posterPicture, posterImg, autoplay);
  } else if (src.kind === 'file') {
    renderFile(container, src.src, posterUrl, autoplay || autoplayFiles);
  } else if (src.kind === 'probe') {
    if (await isVideoUrl(src.src)) renderFile(container, src.src, posterUrl, autoplay || autoplayFiles);
    else showError(container);
  }
}

export default function decorate(block) {
  const autoplay = block.classList.contains('autoplay');
  const link = block.querySelector('a[href]');
  const textUrl = link ? null : (block.textContent.match(/https?:\/\/\S+|[\w-]{11}/) || [])[0];
  const url = link ? link.getAttribute('href') : textUrl;
  const posterPicture = block.querySelector('picture');
  const posterImg = posterPicture ? null : block.querySelector('img');
  // Named Video block: autoplay file/DM sources muted by default (YouTube
  // stays click-to-play unless the `autoplay` class is present).
  renderInto(block, url, posterPicture, posterImg, autoplay, forcedKind(block), true);
}

/**
 * Converts stray video links anywhere in `main` into a click-to-play player.
 * Skips links already inside a .video.block (handled by the named block)
 * and links in site chrome (header/footer/nav). This is what makes a
 * YouTube / Scene7 / mp4 URL work inside a columns cell. Click-to-play only
 * (never autoplay) so it never slows the host page.
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
      renderInto(wrapper, href, null, null, false);
    };
    if (src.kind === 'probe') {
      isVideoUrl(src.src).then((ok) => { if (ok) convert(); });
    } else {
      convert();
    }
  });
}
