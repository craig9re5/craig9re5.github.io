/**
 * Site Interactive Visual Effects
 * - Back-to-top button with rAF throttling & smooth scroll
 * - Dynamic spotlight cursor illumination on .site-nav
 */
(function () {
  'use strict';

  /* ---------------- Back to Top ---------------- */
  function initBackToTop() {
    var btn = document.getElementById('back-to-top');
    if (!btn) return;

    var ticking = false;

    function updateVisibility() {
      var visible = window.scrollY > 300;
      btn.classList.toggle('is-visible', visible);
      btn.setAttribute('aria-hidden', String(!visible));
      btn.tabIndex = visible ? 0 : -1;
      ticking = false;
    }

    btn.hidden = false;
    updateVisibility();

    window.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateVisibility);
        }
      },
      { passive: true }
    );

    btn.addEventListener('click', function () {
      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* ---------------- Spotlight Hover Illumination ---------------- */
  function initSpotlight() {
    var panelSelector = '.site-nav';
    var spotlightQuery = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'
    );
    var activePanels = [];
    var activeInnermostPanel = null;
    var frameId = 0;
    var lastMouseX = -999;
    var lastMouseY = -999;
    var geometryDirty = false;
    var trackingEnabled = false;

    function closestPanel(target) {
      return target && target.closest ? target.closest(panelSelector) : null;
    }

    function buildPanelStack(panel) {
      var panels = [];
      while (panel) {
        panels.push(panel);
        panel = panel.parentElement ? panel.parentElement.closest(panelSelector) : null;
      }
      return panels;
    }

    function findActivePanel(panel) {
      for (var i = 0; i < activePanels.length; i++) {
        if (activePanels[i].element === panel) {
          return activePanels[i];
        }
      }
      return null;
    }

    function setActivePanel(panel) {
      if (panel === activeInnermostPanel) return;

      var nextPanelElements = buildPanelStack(panel);
      var nextPanels = [];

      for (var i = 0; i < nextPanelElements.length; i++) {
        var existingPanel = findActivePanel(nextPanelElements[i]);
        nextPanels.push(
          existingPanel || {
            element: nextPanelElements[i],
            rect: nextPanelElements[i].getBoundingClientRect()
          }
        );
      }

      for (var j = 0; j < activePanels.length; j++) {
        if (nextPanelElements.indexOf(activePanels[j].element) === -1) {
          activePanels[j].element.style.removeProperty('--mouse-x');
          activePanels[j].element.style.removeProperty('--mouse-y');
        }
      }

      activePanels = nextPanels;
      activeInnermostPanel = panel;
    }

    function scheduleUpdate() {
      if (!frameId && activePanels.length) {
        frameId = requestAnimationFrame(updateSpotlights);
      }
    }

    function updateSpotlights() {
      frameId = 0;
      if (!activePanels.length) return;

      var i;
      if (geometryDirty) {
        for (i = 0; i < activePanels.length; i++) {
          activePanels[i].rect = activePanels[i].element.getBoundingClientRect();
        }
        geometryDirty = false;
      }

      for (i = 0; i < activePanels.length; i++) {
        var activePanel = activePanels[i];
        var localX = lastMouseX - activePanel.rect.left;
        var localY = lastMouseY - activePanel.rect.top;
        activePanel.element.style.setProperty('--mouse-x', localX.toFixed(1) + 'px');
        activePanel.element.style.setProperty('--mouse-y', localY.toFixed(1) + 'px');
      }
    }

    function onPointerOver(event) {
      setActivePanel(closestPanel(event.target));
    }

    function onPointerOut(event) {
      setActivePanel(closestPanel(event.relatedTarget));
    }

    function onPointerMove(event) {
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;

      var hoveredPanel = closestPanel(event.target);
      if (hoveredPanel !== activeInnermostPanel) {
        setActivePanel(hoveredPanel);
      }
      scheduleUpdate();
    }

    function onGeometryChange() {
      geometryDirty = true;
      scheduleUpdate();
    }

    function startTracking() {
      if (trackingEnabled) return;
      trackingEnabled = true;
      document.addEventListener('pointerover', onPointerOver, { passive: true });
      document.addEventListener('pointerout', onPointerOut, { passive: true });
      document.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('scroll', onGeometryChange, { passive: true, capture: true });
      window.addEventListener('resize', onGeometryChange, { passive: true });
    }

    function stopTracking() {
      if (!trackingEnabled) return;
      trackingEnabled = false;
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onGeometryChange, true);
      window.removeEventListener('resize', onGeometryChange);

      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }

      setActivePanel(null);
      geometryDirty = false;
      lastMouseX = -999;
      lastMouseY = -999;
    }

    function syncTrackingPreference() {
      if (spotlightQuery.matches) {
        startTracking();
      } else {
        stopTracking();
      }
    }

    if (spotlightQuery.addEventListener) {
      spotlightQuery.addEventListener('change', syncTrackingPreference);
    } else {
      spotlightQuery.addListener(syncTrackingPreference);
    }
    syncTrackingPreference();
  }

  /* ---------------- Initialization ---------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initBackToTop();
      initSpotlight();
    });
  } else {
    initBackToTop();
    initSpotlight();
  }
})();
