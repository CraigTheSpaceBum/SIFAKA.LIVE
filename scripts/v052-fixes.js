(function () {
  'use strict';

  // 0.5.2 targeted UI/payment compatibility fixes.
  // Keep this isolated so the existing Nostr, playback, chat and donation flows
  // remain unchanged unless one of the specific affected surfaces is present.

  function normalizeNip05Checkmarks(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.nip05-badge, .c-nip05, .theater-donation-onchain-nip05, .theater-donation-lightning-nip05')
      .forEach((el) => {
        const raw = String(el.textContent || '').trim();
        if (!raw) return;
        if (!(/[✓✔]/.test(raw) || /\*\*\s*[✓✔]\s*\*\*/.test(raw))) return;
        el.textContent = '✓';
        if (!el.classList.contains('sifaka-v052-nip05-check')) el.classList.add('sifaka-v052-nip05-check');
        if (el.getAttribute('aria-label') !== 'Verified NIP-05') el.setAttribute('aria-label', 'Verified NIP-05');
        if (el.title !== 'Verified NIP-05') el.title = 'Verified NIP-05';
      });
  }

  function applyLiveThumbnailFallback(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('#homePage .stream-card').forEach((card) => {
      const frame = card.querySelector('.ct');
      if (!frame) return;

      const realThumb = Array.from(frame.querySelectorAll('img')).some((img) => {
        const src = String(img.currentSrc || img.src || '').trim();
        return !!src && !img.classList.contains('v052-live-thumb-fallback');
      });
      if (realThumb) {
        const old = frame.querySelector('.v052-live-thumb-fallback');
        if (old) old.remove();
        return;
      }

      const avatar = card.querySelector('.ci-av img');
      const avatarSrc = avatar ? String(avatar.currentSrc || avatar.src || '').trim() : '';
      let fallback = frame.querySelector('.v052-live-thumb-fallback');

      if (avatarSrc) {
        if (!fallback) {
          fallback = document.createElement('img');
          fallback.className = 'v052-live-thumb-fallback';
          fallback.alt = '';
          fallback.setAttribute('aria-hidden', 'true');
          frame.appendChild(fallback);
        }
        if (fallback.src !== avatarSrc) fallback.src = avatarSrc;
        const tc = frame.querySelector('.tc');
        if (tc) tc.textContent = '';
      } else {
        if (fallback) fallback.remove();
        // No thumbnail and no profile picture: deliberately leave the thumbnail
        // area empty instead of showing an initial/random-letter placeholder.
        const tc = frame.querySelector('.tc');
        if (tc) {
          tc.textContent = '';
          tc.style.backgroundImage = 'none';
        }
      }
    });
  }

  function installNwcFeeCompatibility() {
    const fn = window.sendNwcRequest;
    if (typeof fn !== 'function' || fn.__sifakaV052Wrapped) return;
    window.sendNwcRequest = async function (method, params, opts) {
      let nextParams = params;
      if (String(method || '').toLowerCase() === 'pay_invoice' && params && typeof params === 'object') {
        nextParams = { ...params };
        const current = Number(nextParams.max_fee ?? nextParams.max_fee_sats ?? 0);
        if (!Number.isFinite(current) || current <= 0) {
          const amountMsats = Number(nextParams.amount || nextParams.amount_msat || 0);
          const amountSats = Math.max(1, Math.ceil(amountMsats / 1000));
          // A small positive ceiling avoids rejecting legitimate routes that
          // require a base routing fee, while keeping the fee bounded.
          nextParams.max_fee = Math.max(2, Math.ceil(amountSats * 0.01));
          delete nextParams.max_fee_sats;
        }
      }
      return fn.call(this, method, nextParams, opts);
    };
    window.sendNwcRequest.__sifakaV052Wrapped = true;
  }

  function installStyles() {
    if (document.getElementById('sifaka-v052-fixes-style')) return;
    const style = document.createElement('style');
    style.id = 'sifaka-v052-fixes-style';
    style.textContent = [
      '.sifaka-v052-nip05-check{color:var(--purple,#8f5bff)!important;font-weight:800!important;font-family:var(--font-display,"DM Sans",sans-serif)!important;font-size:1.05em!important;line-height:1!important;text-shadow:0 0 8px rgba(143,91,255,.35);}',
      '#homePage .v052-live-thumb-fallback{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover;z-index:0;pointer-events:none;}',
      '#homePage .stream-card .ct .v052-live-thumb-fallback + .tc{position:relative;}'
    ].join('');
    document.head.appendChild(style);
  }

  function run() {
    installStyles();
    normalizeNip05Checkmarks(document);
    applyLiveThumbnailFallback(document);
    installNwcFeeCompatibility();
  }

  const observer = new MutationObserver((mutations) => {
    let relevant = false;
    for (const m of mutations) {
      if (m.type === 'childList' || m.type === 'attributes') {
        relevant = true;
        break;
      }
    }
    if (!relevant) return;
    normalizeNip05Checkmarks(document);
    applyLiveThumbnailFallback(document);
    installNwcFeeCompatibility();
  });

  function start() {
    run();
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();