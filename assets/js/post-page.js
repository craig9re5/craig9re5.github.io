/**
 * Post Page Enhancements
 * - Reading progress bar with rAF throttling
 * - Local-environment 'Edit this post' shortcut link
 * - Code block wrappers with language badges & copy-to-clipboard buttons
 */
(function () {
  'use strict';

  /* ---------------- Reading Progress ---------------- */
  function initReadingProgress() {
    var bar = document.getElementById('reading-progress');
    if (!bar) return;

    var ticking = false;

    function isEditorialStyle() {
      return document.documentElement.getAttribute('data-style') === 'editorial';
    }

    function updateBar() {
      ticking = false;
      if (isEditorialStyle()) {
        bar.style.width = '';
        return;
      }
      var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (height <= 0) {
        bar.style.width = '0%';
      } else {
        var scrolled = (winScroll / height) * 100;
        bar.style.width = Math.min(scrolled, 100) + '%';
      }
    }

    window.addEventListener(
      'scroll',
      function () {
        if (isEditorialStyle()) return;
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateBar);
        }
      },
      { passive: true }
    );

    window.addEventListener('site:stylechange', function () {
      if (isEditorialStyle()) {
        bar.style.width = '';
      } else {
        updateBar();
      }
    });

    updateBar();
  }

  /* ---------------- Local Post Edit Link ---------------- */
  function initLocalEdit() {
    var host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return;
    }

    var container = document.getElementById('post-local-edit');
    if (!container) {
      return;
    }

    var fileName = container.getAttribute('data-post-file');
    var link = container.querySelector('.post-local-edit-link');
    if (!fileName || !link) {
      return;
    }

    link.href = 'http://127.0.0.1:4173/post-composer.html?edit=' + encodeURIComponent(fileName);
    container.hidden = false;
  }

  /* ---------------- Code Block Enhancement ---------------- */
  function enhanceCodeBlocks() {
    var codeBlocks = document.querySelectorAll('.post-body pre');
    codeBlocks.forEach(function (pre) {
      if (pre.closest('.code-block-wrapper')) return;

      var wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      var code = pre.querySelector('code');
      var lang = '';
      if (code) {
        var classes = (code.className || '').split(/\s+/);
        for (var i = 0; i < classes.length; i++) {
          if (classes[i].indexOf('language-') === 0) {
            lang = classes[i].replace('language-', '');
            break;
          }
        }
      }
      if (!lang && pre.className) {
        var preClasses = pre.className.split(/\s+/);
        for (var j = 0; j < preClasses.length; j++) {
          if (preClasses[j].indexOf('language-') === 0) {
            lang = preClasses[j].replace('language-', '');
            break;
          }
        }
      }

      var header = document.createElement('div');
      header.className = 'code-block-header';

      var langBadge = document.createElement('span');
      langBadge.className = 'code-lang-badge';
      langBadge.textContent = lang ? lang.toUpperCase() : 'CODE';
      header.appendChild(langBadge);

      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'code-copy-btn';
      copyBtn.setAttribute('aria-label', 'Copy code to clipboard');
      copyBtn.innerHTML =
        '<svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg><span class="copy-text">Copy</span>';

      copyBtn.addEventListener('click', function () {
        var textToCopy = (code || pre).innerText;
        navigator.clipboard
          .writeText(textToCopy)
          .then(function () {
            copyBtn.classList.add('is-copied');
            copyBtn.innerHTML =
              '<svg class="check-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><span class="copy-text">Copied!</span>';
            setTimeout(function () {
              copyBtn.classList.remove('is-copied');
              copyBtn.innerHTML =
                '<svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg><span class="copy-text">Copy</span>';
            }, 2000);
          })
          .catch(function () {
            // fallback
          });
      });

      header.appendChild(copyBtn);
      wrapper.insertBefore(header, pre);
    });
  }

  /* ---------------- Responsive Table Wrapper ---------------- */
  function enhancePostTables() {
    var tables = document.querySelectorAll('.post-body table');
    tables.forEach(function (table, idx) {
      if (table.closest('.table-wrapper')) return;
      var wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper';
      wrapper.setAttribute('tabindex', '0');
      wrapper.setAttribute('role', 'region');
      var caption = table.querySelector('caption');
      if (caption) {
        if (!caption.id) caption.id = 'ed-table-caption-' + (idx + 1);
        wrapper.setAttribute('aria-labelledby', caption.id);
      } else {
        wrapper.setAttribute('aria-label', 'Scrollable data table');
      }
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  // Export for dynamic content (e.g. encrypted post decryption)
  window.enhanceCodeBlocks = enhanceCodeBlocks;
  window.enhancePostTables = enhancePostTables;

  /* ---------------- Initialization ---------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initReadingProgress();
      initLocalEdit();
      enhanceCodeBlocks();
      enhancePostTables();
    });
  } else {
    initReadingProgress();
    initLocalEdit();
    enhanceCodeBlocks();
    enhancePostTables();
  }
})();
