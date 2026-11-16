(function () {
  'use strict';

  if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
    import('https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js').catch(function () {
      // Non-critical progressive enhancement fallback
    });
  }

  /* ---------------- Theme Toggle ---------------- */
  function initTheme() {
    var root = document.documentElement;
    var toggleBtn = document.getElementById('sample-theme-toggle');
    var mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function getStoredTheme() {
      try {
        return localStorage.getItem('theme');
      } catch (error) {
        return null;
      }
    }

    function normalizedTheme(theme) {
      return theme === 'dark' ? 'dark' : 'light';
    }

    function syncToggle(theme) {
      if (!toggleBtn) return;
      var isDark = normalizedTheme(theme) === 'dark';
      toggleBtn.setAttribute('aria-pressed', String(isDark));
      toggleBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }

    syncToggle(root.getAttribute('data-theme'));

    if (mediaQuery && typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', function (event) {
        if (getStoredTheme()) return;
        var next = event.matches ? 'dark' : 'light';
        root.setAttribute('data-theme', next);
        syncToggle(next);
      });
    }

    if (!toggleBtn) return;
    toggleBtn.addEventListener('click', function () {
      var current = normalizedTheme(root.getAttribute('data-theme'));
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem('theme', next);
      } catch (error) {
        // Ignore blocked storage
      }
      syncToggle(next);
    });
  }

  /* ---------------- Responsive Navbar & Popover Submenu ---------------- */
  function initNavbar() {
    var header = document.getElementById('sample-site-header');
    var inner = header ? header.querySelector('.header-inner') : null;
    var siteMenu = document.getElementById('sample-site-menu');
    var dropdownItem = header ? header.querySelector('.nav-dropdown') : null;
    var trigger = document.getElementById('sample-posts-trigger');
    var submenu = document.getElementById('sample-posts-menu');

    if (!header || !inner || !siteMenu) return;

    var isHoverPreview = false;
    var lastCollapsedWidth = -1;
    var currentWide = null;

    function isPopoverOpen(el) {
      return el && (el.matches(':popover-open') || el.classList.contains(':popover-open'));
    }

    function positionDropdownFallback() {
      if (!trigger || !submenu || !currentWide) return;
      if (CSS.supports && CSS.supports('position-area', 'block-end')) return;

      var tRect = trigger.getBoundingClientRect();
      var sRect = submenu.getBoundingClientRect();
      var gap = 8;
      var top = tRect.bottom + gap;
      if (top + sRect.height > window.innerHeight - 12 && tRect.top - gap - sRect.height > 12) {
        top = tRect.top - gap - sRect.height;
      }
      var left = Math.max(12, Math.min(tRect.left, window.innerWidth - sRect.width - 12));
      submenu.style.top = top + 'px';
      submenu.style.left = left + 'px';
    }

    function updateNavLayout(forceMeasure) {
      var headerWidth = header.clientWidth;
      if (!forceMeasure && currentWide === false && headerWidth <= lastCollapsedWidth) {
        return;
      }

      if (currentWide === true) {
        if (inner.scrollWidth <= inner.clientWidth) {
          return;
        }
      }

      var wasMenuOpen = currentWide === false && isPopoverOpen(siteMenu);

      header.classList.add('is-measuring');
      header.classList.add('is-wide');
      siteMenu.removeAttribute('popover');
      if (submenu) {
        submenu.hidden = true;
        submenu.removeAttribute('popover');
      }

      var fits = inner.scrollWidth <= inner.clientWidth;
      var changed = fits !== currentWide;
      currentWide = fits;

      if (fits) {
        header.classList.add('is-wide');
        siteMenu.removeAttribute('popover');
        if (submenu) {
          submenu.hidden = false;
          submenu.setAttribute('popover', 'auto');
        }
        if (trigger && changed) trigger.setAttribute('aria-expanded', 'false');
        lastCollapsedWidth = -1;
      } else {
        header.classList.remove('is-wide');
        siteMenu.setAttribute('popover', 'auto');
        if (submenu) {
          submenu.removeAttribute('popover');
          submenu.hidden = true;
          submenu.style.top = '';
          submenu.style.left = '';
        }
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        lastCollapsedWidth = headerWidth;
        if (wasMenuOpen && typeof siteMenu.showPopover === 'function') {
          try {
            siteMenu.showPopover();
          } catch (e) {
            // Ignore if not supported
          }
        }
      }

      requestAnimationFrame(function () {
        header.classList.remove('is-measuring');
      });
    }

    if (trigger && submenu) {
      submenu.addEventListener('toggle', function (event) {
        if (!currentWide) return;
        var opened = event.newState === 'open';
        trigger.setAttribute('aria-expanded', String(opened));
        if (!opened) {
          isHoverPreview = false;
        } else {
          positionDropdownFallback();
        }
      });

      trigger.addEventListener('click', function (event) {
        if (!currentWide) {
          var willOpen = submenu.hidden;
          submenu.hidden = !willOpen;
          trigger.setAttribute('aria-expanded', String(willOpen));
          return;
        }
        if (isHoverPreview && isPopoverOpen(submenu)) {
          event.preventDefault();
          isHoverPreview = false;
        }
      });

      if (dropdownItem) {
        dropdownItem.addEventListener('pointerenter', function (event) {
          if (!currentWide) return;
          if (!window.matchMedia('(hover: hover)').matches || event.pointerType === 'touch') return;
          if (typeof submenu.showPopover !== 'function' || isPopoverOpen(submenu)) return;
          isHoverPreview = true;
          try {
            submenu.showPopover({ source: trigger });
          } catch (e) {
            try {
              submenu.showPopover();
            } catch (err) {
              isHoverPreview = false;
            }
          }
        });

        dropdownItem.addEventListener('pointerleave', function () {
          if (!currentWide || !isHoverPreview) return;
          isHoverPreview = false;
          if (typeof submenu.hidePopover === 'function' && isPopoverOpen(submenu)) {
            try {
              submenu.hidePopover();
            } catch (e) {
              // Ignore
            }
          }
        });

        dropdownItem.addEventListener('focusout', function (event) {
          if (!currentWide) return;
          if (event.relatedTarget && dropdownItem.contains(event.relatedTarget)) return;
          if (typeof submenu.hidePopover === 'function' && isPopoverOpen(submenu)) {
            try {
              submenu.hidePopover();
            } catch (e) {
              // Ignore
            }
          }
        });
      }
    }

    updateNavLayout(true);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        updateNavLayout(true);
      });
    }

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        updateNavLayout(false);
      });
      ro.observe(header);
    } else {
      window.addEventListener('resize', function () {
        updateNavLayout(true);
      });
    }
  }

  /* ---------------- Reading Progress Fallback ---------------- */
  function initProgressFallback() {
    if (CSS.supports && CSS.supports('animation-timeline', 'scroll()')) return;
    var bar = document.getElementById('reading-progress');
    if (!bar) return;

    var ticking = false;
    function update() {
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      bar.style.transform = 'scaleX(' + ratio + ')';
      ticking = false;
    }

    window.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    update();
  }

  /* ---------------- Copy Link (Invoker Commands + Fallback) ---------------- */
  function initCopyButtons() {
    var shareInput = document.getElementById('sample-share-url');
    if (shareInput) {
      shareInput.value = window.location.href;
    }

    var timers = new WeakMap();
    var lastMessage = '';

    function report(button, ok) {
      var tip = button.nextElementSibling;
      clearTimeout(timers.get(button));
      button.removeAttribute('data-copied');
      button.removeAttribute('data-failed');

      var message = ok ? 'Copied' : 'Copy failed';
      if (message === lastMessage) {
        message += '\u00A0';
      }
      lastMessage = message;

      if (tip) tip.textContent = '';
      void button.offsetWidth;
      button.setAttribute(ok ? 'data-copied' : 'data-failed', '');
      if (tip) {
        requestAnimationFrame(function () {
          tip.textContent = message;
        });
      }

      timers.set(
        button,
        setTimeout(function () {
          button.removeAttribute('data-copied');
          button.removeAttribute('data-failed');
          if (tip) tip.textContent = '';
        }, 2000)
      );
    }

    function legacyCopy(text) {
      var field = Object.assign(document.createElement('textarea'), { value: text });
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
      document.body.append(field);
      field.select();
      try {
        return document.execCommand('copy');
      } finally {
        field.remove();
      }
    }

    async function copy(button, target) {
      var text = target.matches('input, textarea') ? target.value : target.innerText.trim();
      if (!text) return;
      try {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
          throw new Error('Clipboard API unavailable');
        }
        await navigator.clipboard.writeText(text);
        report(button, true);
      } catch (err) {
        if (legacyCopy(text)) {
          report(button, true);
        } else {
          report(button, false);
        }
      }
    }

    document.addEventListener(
      'command',
      function (event) {
        if (event.command && event.command.indexOf('--copy') === 0) {
          copy(event.source, event.target);
        }
      },
      true
    );

    if (!('CommandEvent' in window)) {
      document.addEventListener('click', function (event) {
        var button = event.target.closest('button[command^="--copy"]');
        if (!button) return;
        var target = document.getElementById(button.getAttribute('commandfor'));
        if (target) {
          copy(button, target);
        }
      });
    }
  }

  /* ---------------- Scrollspy (In this Article) ---------------- */
  function initScrollspy() {
    var tocNav = document.querySelector('.toc-nav');
    if (!tocNav) return;

    var links = Array.prototype.slice.call(tocNav.querySelectorAll('.toc-link'));
    if (!links.length) return;

    var sections = links
      .map(function (link) {
        var href = link.getAttribute('href') || '';
        if (href.charAt(0) !== '#') return null;
        return document.getElementById(href.slice(1));
      })
      .filter(Boolean);

    if (!sections.length) return;

    var supportsNative = CSS.supports && CSS.supports('scroll-target-group', 'auto');

    function setActiveLink(activeLink, manageFallbackClass) {
      links.forEach(function (link) {
        var isActive = link === activeLink;
        link.setAttribute('aria-current', isActive ? 'true' : 'false');
        if (manageFallbackClass) {
          link.classList.toggle('target-current', isActive);
        }
      });
    }

    if (supportsNative) {
      var nativeTimer = 0;
      var syncNative = function () {
        var current = tocNav.querySelector('a:target-current');
        if (current) {
          links.forEach(function (link) {
            link.classList.remove('target-current');
            link.setAttribute('aria-current', link === current ? 'true' : 'false');
          });
        } else if (window.scrollY < 160) {
          // Before scrolling into section-1, highlight the opening section cleanly
          setActiveLink(links[0], true);
        } else {
          links.forEach(function (link) {
            link.classList.remove('target-current');
          });
        }
      };

      var scheduleSync = function () {
        clearTimeout(nativeTimer);
        requestAnimationFrame(function () {
          requestAnimationFrame(syncNative);
        });
        nativeTimer = setTimeout(syncNative, 90);
      };

      syncNative();
      document.addEventListener('scrollend', syncNative);
      window.addEventListener('scroll', scheduleSync, { passive: true });
      window.addEventListener('hashchange', scheduleSync);
      return;
    }

    var activeId = sections[0].id;
    function applyById(id) {
      activeId = id;
      var matched = null;
      links.forEach(function (link) {
        if (link.getAttribute('href') === '#' + id) {
          matched = link;
        }
      });
      setActiveLink(matched || links[0], true);
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            applyById(entry.target.id);
          }
        });
      },
      { rootMargin: '-32% 0px -56% 0px', threshold: 0 }
    );

    sections.forEach(function (sec) {
      observer.observe(sec);
    });

    window.addEventListener(
      'scroll',
      function () {
        if (window.scrollY < 160 && activeId !== sections[0].id) {
          applyById(sections[0].id);
        } else if (
          window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 40 &&
          activeId !== sections[sections.length - 1].id
        ) {
          applyById(sections[sections.length - 1].id);
        }
      },
      { passive: true }
    );

    applyById(sections[0].id);
  }

  function boot() {
    initTheme();
    initNavbar();
    initProgressFallback();
    initCopyButtons();
    initScrollspy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
