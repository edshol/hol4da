/*
 * Video Block
 * Inline YouTube player with a lightweight poster facade.
 * Autoplays muted when scrolled into view (IntersectionObserver), pauses when
 * scrolled out. Click the poster or the unmute button to enable sound.
 * Respects prefers-reduced-motion (no autoplay; plays on click).
 *
 * Exports:
 *  - default decorate(block): the named "Video" block.
 *  - autoVideo(main): converts stray YouTube links (e.g. inside a columns
 *    block) into the same player. Called from scripts.js after sections load.
 */

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

/**
 * Renders the poster facade + scroll-triggered player into `container`.
 * `container` must carry the `video block` classes (styling hook).
 */
function renderVideo(container, id, posterPicture, posterImg) {
  ensureCss();
  container.textContent = '';

  // --- Poster facade (a real button for keyboard + a11y) ---
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

  // --- Unmute affordance (shown during muted autoplay) ---
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

  // Manual click → play with sound.
  facade.addEventListener('click', () => load(false));

  // Autoplay (muted) when scrolled into view.
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

export default function decorate(block) {
  const link = block.querySelector('a[href]');
  const textUrl = link ? null : (block.textContent.match(/https?:\/\/\S+|[\w-]{11}/) || [])[0];
  const id = parseYouTubeId(link ? link.getAttribute('href') : textUrl);
  const posterPicture = block.querySelector('picture');
  const posterImg = posterPicture ? null : block.querySelector('img');

  if (!id) {
    block.textContent = '';
    block.innerHTML = '<p class="video-error">有効な YouTube URL が見つかりません。</p>';
    return;
  }

  renderVideo(block, id, posterPicture, posterImg);
}

/**
 * Converts stray YouTube links anywhere in `main` into the player.
 * Skips links already inside a .video.block (handled by the named block)
 * and links in site chrome (header/footer/nav). This is what makes a
 * YouTube URL work inside a columns cell.
 */
export function autoVideo(main) {
  main.querySelectorAll('a[href]').forEach((a) => {
    if (a.closest('.video.block') || a.closest('header, footer, nav')) return;
    const id = parseYouTubeId(a.getAttribute('href'));
    if (!id) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'video block';
    // Replace the link (or its wrapping paragraph) with the player.
    const host = a.closest('p') || a;
    host.replaceWith(wrapper);
    renderVideo(wrapper, id, null, null);
  });
}
