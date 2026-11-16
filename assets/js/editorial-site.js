/**
 * Editorial Site Template Runtime
 * - Responsive popover navbar & dropdown preview
 * - Reading progress scroll-timeline fallback
 * - Invoker Command link copy + fallback
 * - Dynamic Scrollspy TOC for post headings (including post-decryption content)
 */
(function () {
  'use strict';

  if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
    import('https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js').catch(function () {
      // Non-critical progressive enhancement fallback
    });
  }

  function isEditorialActive() {
    return document.documentElement.getAttribute('data-style') !== 'classic';
  }

  /* ---------------- Responsive Editorial Navbar ---------------- */
  function initEditorialNavbar() {
    var header = document.getElementById('ed-site-header');
    var inner = header ? header.querySelector('.ed-header-inner') : null;
    var siteMenu = document.getElementById('ed-site-menu');
    var dropdownItem = header ? header.querySelector('.ed-nav-dropdown') : null;
    var trigger = document.getElementById('ed-posts-trigger');
    var submenu = document.getElementById('ed-posts-menu');

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
      if (!isEditorialActive()) return;

      var headerWidth = header.clientWidth;
      if (headerWidth === 0) return;

      if (!forceMeasure && currentWide === false && headerWidth <= lastCollapsedWidth) {
        return;
      }

      if (currentWide === true && inner.scrollWidth <= inner.clientWidth) {
        return;
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
            // Ignore if unavailable
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
          if (!currentWide || !isEditorialActive()) return;
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

    window.addEventListener('site:stylechange', function (event) {
      if (event.detail && event.detail.style === 'editorial') {
        currentWide = null;
        requestAnimationFrame(function () {
          updateNavLayout(true);
        });
      }
    });

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

  /* ---------------- Reading Progress Transform Fallback ---------------- */
  function initProgressFallback() {
    if (CSS.supports && CSS.supports('animation-timeline', 'scroll()')) return;
    var bar = document.getElementById('reading-progress');
    if (!bar) return;

    var ticking = false;
    function update() {
      ticking = false;
      if (!isEditorialActive()) {
        bar.style.transform = '';
        return;
      }
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      bar.style.transform = 'scaleX(' + ratio + ')';
    }

    window.addEventListener(
      'scroll',
      function () {
        if (!isEditorialActive()) return;
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    window.addEventListener('site:stylechange', update);
    update();
  }

  /* ---------------- Invoker Link Copy ---------------- */
  function initCopyButtons() {
    var shareInput = document.getElementById('ed-share-url');
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

  /* ---------------- Dynamic Post TOC & Scrollspy ---------------- */
  var tocCleanup = null;

  function buildArrowSvg() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '10');
    svg.setAttribute('height', '10');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M3.5 8h8.2M8.4 4.5 12 8l-3.6 3.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  function refreshEditorialToc() {
    if (typeof tocCleanup === 'function') {
      tocCleanup();
      tocCleanup = null;
    }

    var tocCard = document.getElementById('ed-toc-card');
    var tocNav = tocCard ? tocCard.querySelector('.ed-toc-nav') : null;
    var tocList = document.getElementById('ed-toc-list');
    var body = document.getElementById('decrypted-post-body');
    if (!body || body.style.display === 'none') {
      body = document.getElementById('post-content-body');
    }

    if (!tocCard || !tocNav || !tocList || !body) return;

    var headings = Array.prototype.slice.call(body.querySelectorAll('h2, h3')).filter(function (h) {
      return (h.textContent || '').trim().length > 0;
    });

    tocList.innerHTML = '';

    if (headings.length < 2) {
      tocCard.hidden = true;
      return;
    }

    var contentLang = body.getAttribute('lang') || document.documentElement.lang || 'zh-Hans';
    var usedIds = new Set();
    var h2Index = 0;

    var links = headings.map(function (heading, index) {
      var id = heading.id;
      if (!id || usedIds.has(id)) {
        id = 'section-' + (index + 1);
      }
      while (usedIds.has(id) || (document.getElementById(id) && document.getElementById(id) !== heading)) {
        id += '-' + (index + 1);
      }
      usedIds.add(id);
      heading.id = id;
      heading.setAttribute('tabindex', '-1');
      heading.classList.add('ed-toc-target');

      var li = document.createElement('li');
      var isSub = heading.tagName === 'H3';
      if (!isSub) h2Index += 1;
      if (isSub) li.className = 'ed-toc-subitem';

      var a = document.createElement('a');
      a.className = 'ed-toc-link';
      a.href = '#' + id;
      a.setAttribute('lang', contentLang);

      var indicator = document.createElement('span');
      indicator.className = 'ed-toc-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      indicator.appendChild(buildArrowSvg());

      var label = document.createElement('span');
      label.className = 'ed-toc-label';
      var rawText = heading.textContent.trim();
      label.textContent = isSub || /^\d+[.、\s]/.test(rawText) ? rawText : h2Index + '. ' + rawText;

      a.appendChild(indicator);
      a.appendChild(label);
      li.appendChild(a);
      tocList.appendChild(li);
      return a;
    });

    tocCard.hidden = false;

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
        } else if (window.scrollY < 180) {
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

      tocCleanup = function () {
        clearTimeout(nativeTimer);
        document.removeEventListener('scrollend', syncNative);
        window.removeEventListener('scroll', scheduleSync);
        window.removeEventListener('hashchange', scheduleSync);
      };
      return;
    }

    var activeId = headings[0].id;
    function applyById(id) {
      activeId = id;
      var matched = null;
      links.forEach(function (link) {
        if (link.getAttribute('href') === '#' + id) matched = link;
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
      { rootMargin: '-30% 0px -56% 0px', threshold: 0 }
    );

    headings.forEach(function (h) {
      observer.observe(h);
    });

    function onFallbackScroll() {
      if (window.scrollY < 180 && activeId !== headings[0].id) {
        applyById(headings[0].id);
      } else if (
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 40 &&
        activeId !== headings[headings.length - 1].id
      ) {
        applyById(headings[headings.length - 1].id);
      }
    }

    window.addEventListener('scroll', onFallbackScroll, { passive: true });
    applyById(headings[0].id);

    tocCleanup = function () {
      observer.disconnect();
      window.removeEventListener('scroll', onFallbackScroll);
    };
  }

  window.refreshEditorialToc = refreshEditorialToc;

  function boot() {
    initEditorialNavbar();
    initProgressFallback();
    initCopyButtons();
    refreshEditorialToc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
