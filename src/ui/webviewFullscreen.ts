// A script for a WebView that shows a video page: after the page loads, it looks for the
// player's fullscreen button and clicks it. The player's controls can render a moment after
// the page loads, so it keeps looking for a while before giving up.
//
// Injected with the WebView's `injectedJavaScript`. Browsers may refuse a fullscreen request
// that is not from a user's tap, so the click is best effort: the button is still there to tap.

const LOOK_EVERY_MS = 500;
const LOOK_FOR_MS = 15_000;

export const VIDEO_FULLSCREEN_SCRIPT = `(() => {
  // Labels of a fullscreen button, in Chinese and English, and Bilibili's own class for it.
  const SELECTORS = [
    '[aria-label*="全屏"]',
    '[title*="全屏"]',
    '.bpx-player-ctrl-full',
    '[aria-label*="fullscreen" i]',
    '[title*="fullscreen" i]',
  ];
  // "Exit fullscreen" carries the same words: it is not the button to press.
  const EXIT = /退出|exit/i;

  const label = (el) => (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '');

  function findButton() {
    for (const selector of SELECTORS) {
      for (const el of document.querySelectorAll(selector)) {
        if (EXIT.test(label(el))) continue;
        const box = el.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) return el;
      }
    }
    return null;
  }

  const started = Date.now();
  const timer = setInterval(() => {
    if (document.fullscreenElement || Date.now() - started > ${LOOK_FOR_MS}) {
      clearInterval(timer);
      return;
    }
    const button = findButton();
    if (button) {
      clearInterval(timer);
      button.click();
    }
  }, ${LOOK_EVERY_MS});
})();`;
