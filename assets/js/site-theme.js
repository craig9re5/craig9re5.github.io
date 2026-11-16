/**
 * Site Theme, Style & Global Navigation Controller
 * Handles editorial/classic style switching, dark/light theme toggling,
 * Giscus comments iframe theme synchronization, and local composer links.
 */
(function () {
  'use strict';

  var STYLE_KEY = 'site-style';
  var THEME_KEY = 'theme';
  var DEFAULT_STYLE = 'editorial';

  function normalizedStyle(style) {
    return style === 'classic' ? 'classic' : 'editorial';
  }

  function normalizedTheme(theme) {
    return theme === 'dark' ? 'dark' : 'light';
  }

  function applyStyle(style, persist) {
    var root = document.documentElement;
    var nextStyle = normalizedStyle(style);
    root.setAttribute('data-style', nextStyle);

    var classicA = document.getElementById('css-classic-base');
    var classicB = document.getElementById('css-classic-custom');
    var editorialCss = document.getElementById('css-editorial');

    if (classicA) classicA.disabled = nextStyle !== 'classic';
    if (classicB) classicB.disabled = nextStyle !== 'classic';
    if (editorialCss) editorialCss.disabled = nextStyle !== 'editorial';

    if (persist) {
      try {
        localStorage.setItem(STYLE_KEY, nextStyle);
      } catch (error) {
        // Blocked storage should not stop visual style switching.
      }
    }

    syncStyleControls(nextStyle);

    try {
      window.dispatchEvent(new CustomEvent('site:stylechange', { detail: { style: nextStyle } }));
    } catch (e) {
      // Ignore if CustomEvent unavailable
    }
    return nextStyle;
  }

  function syncStyleControls(style) {
    var current = normalizedStyle(style || document.documentElement.getAttribute('data-style') || DEFAULT_STYLE);
    var buttons = document.querySelectorAll('[data-style-option]');
    buttons.forEach(function (btn) {
      var opt = btn.getAttribute('data-style-option');
      var active = opt === current;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('is-active', active);
    });

    var note = document.getElementById('style-status-note');
    if (note) {
      note.textContent = current === 'editorial' ? '期刊纸面' : '经典玻璃';
    }
  }

  function initSiteController() {
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      document.querySelectorAll('#nav-composer-link, [data-composer-link]').forEach(function (link) {
        link.hidden = false;
      });
      document.querySelectorAll('[data-composer-item]').forEach(function (item) {
        item.hidden = false;
      });
    }

    var root = document.documentElement;
    var toggleButtons = Array.prototype.slice.call(document.querySelectorAll('#theme-toggle, [data-theme-toggle]'));
    var mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    var giscusOrigin = 'https://giscus.app';
    var giscusRetryTimer = 0;

    function getStoredTheme() {
      try {
        return localStorage.getItem(THEME_KEY);
      } catch (error) {
        return null;
      }
    }

    function giscusTheme(theme) {
      return normalizedTheme(theme) === 'dark' ? 'dark_dimmed' : 'light';
    }

    function syncToggleState(theme) {
      var isDark = normalizedTheme(theme) === 'dark';
      toggleButtons.forEach(function (btn) {
        btn.setAttribute('aria-pressed', String(isDark));
        btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      });
    }

    function postGiscusTheme(theme) {
      var frame = document.querySelector('iframe.giscus-frame');
      if (!frame || !frame.contentWindow) {
        return false;
      }

      try {
        frame.contentWindow.postMessage(
          {
            giscus: {
              setConfig: {
                theme: giscusTheme(theme)
              }
            }
          },
          giscusOrigin
        );
        return true;
      } catch (error) {
        return false;
      }
    }

    function queueGiscusTheme(theme) {
      var nextTheme = normalizedTheme(theme);
      if (giscusRetryTimer) {
        window.clearTimeout(giscusRetryTimer);
      }

      var attempts = 0;
      function retry() {
        if (postGiscusTheme(nextTheme) || attempts >= 8) {
          giscusRetryTimer = 0;
          return;
        }
        attempts += 1;
        giscusRetryTimer = window.setTimeout(retry, attempts < 3 ? 100 : 500);
      }
      retry();
    }

    function bindGiscusFrame(frame) {
      if (!frame || frame.dataset.themeSyncBound === 'true') {
        return false;
      }
      frame.dataset.themeSyncBound = 'true';
      frame.addEventListener('load', function () {
        queueGiscusTheme(root.getAttribute('data-theme'));
      });
      return true;
    }

    function inspectGiscusFrames() {
      var frames = document.querySelectorAll('iframe.giscus-frame');
      var newlyBound = false;
      for (var i = 0; i < frames.length; i += 1) {
        newlyBound = bindGiscusFrame(frames[i]) || newlyBound;
      }
      if (newlyBound) {
        queueGiscusTheme(root.getAttribute('data-theme'));
      }
    }

    if (window.MutationObserver) {
      var giscusObserver = new MutationObserver(inspectGiscusFrames);
      giscusObserver.observe(document.documentElement, { childList: true, subtree: true });

      var attrObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.attributeName === 'data-theme') {
            var theme = root.getAttribute('data-theme');
            syncToggleState(theme);
            queueGiscusTheme(theme);
          } else if (mutation.attributeName === 'data-style') {
            syncStyleControls(root.getAttribute('data-style'));
          }
        });
      });
      attrObserver.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-style'] });
    }

    if (mediaQuery && typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', function (event) {
        if (getStoredTheme()) return;
        var next = event.matches ? 'dark' : 'light';
        root.setAttribute('data-theme', next);
        syncToggleState(next);
        queueGiscusTheme(next);
      });
    }

    window.addEventListener('storage', function (event) {
      if (event.key === STYLE_KEY && (event.newValue === 'classic' || event.newValue === 'editorial')) {
        applyStyle(event.newValue, false);
      } else if (event.key === THEME_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
        root.setAttribute('data-theme', event.newValue);
        syncToggleState(event.newValue);
        queueGiscusTheme(event.newValue);
      }
    });

    window.__syncGiscusTheme = queueGiscusTheme;
    window.__siteStyle = {
      get: function () {
        return normalizedStyle(root.getAttribute('data-style') || DEFAULT_STYLE);
      },
      set: function (next) {
        return applyStyle(next, true);
      }
    };

    syncToggleState(root.getAttribute('data-theme'));
    syncStyleControls(root.getAttribute('data-style'));
    inspectGiscusFrames();

    toggleButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var currentTheme = normalizedTheme(root.getAttribute('data-theme'));
        var nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', nextTheme);
        try {
          localStorage.setItem(THEME_KEY, nextTheme);
        } catch (error) {
          // Blocked storage should not block theme switching.
        }
        syncToggleState(nextTheme);
        queueGiscusTheme(nextTheme);
      });
    });

    document.addEventListener('click', function (event) {
      var styleBtn = event.target.closest('[data-style-option]');
      if (!styleBtn) return;
      var targetStyle = styleBtn.getAttribute('data-style-option');
      applyStyle(targetStyle, true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSiteController);
  } else {
    initSiteController();
  }
})();
