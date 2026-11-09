// ==UserScript==
// @name         Fast Video
// @namespace    https://github.com/apoev/fast-video
// @version      1.0.0
// @description  Скорость HTML5-видео на iPhone и iPad: S медленнее, D своя/1×, F быстрее, E пропуск. Кнопки на экране, если нет клавиатуры.
// @author       apoev
// @match        *://*/*
// @match        http://*/*
// @match        https://*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://github.com/apoev/fast-video/raw/main/userscript/fast-video.user.js
// @downloadURL  https://github.com/apoev/fast-video/raw/main/userscript/fast-video.user.js
// @homepageURL  https://github.com/apoev/fast-video
// ==/UserScript==

// Собранный файл. Правки вносите в src/engine.js и src/userscript-boot.js,
// затем запустите python3 scripts/build_userscript.py

(function (root) {
  'use strict';

  var MSG = 'fast-video';
  var ACTIONS = ['slower', 'normal', 'faster', 'skip'];
  var MIN_RATE = 0.1;
  var MAX_RATE = 9.9;
  var ACTION_TITLE = {
    slower: 'Медленнее',
    normal: '1× / своя',
    faster: 'Быстрее',
    skip: 'Пропуск'
  };
  var DEFAULT_SHORTCUTS = {
    slower: { code: 'KeyS', alt: false, ctrl: false, shift: false, meta: false },
    normal: { code: 'KeyD', alt: false, ctrl: false, shift: false, meta: false },
    faster: { code: 'KeyF', alt: false, ctrl: false, shift: false, meta: false },
    skip: { code: 'KeyE', alt: false, ctrl: false, shift: false, meta: false }
  };
  var SKIP_BUTTONS = [
    'button.ytp-ad-skip-button-modern',
    'button.ytp-ad-skip-button',
    'button.ytp-skip-ad-button',
    '.ytp-ad-skip-button-container button',
    'button.videoAdUiSkipButton',
    '.videoAdUiSkipButton'
  ].join(', ');

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function hostKey(hostname) {
    return String(hostname || '')
      .trim()
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^www\./, '');
  }

  function isHostBlocked(disabledHosts, host) {
    var key = hostKey(host);
    if (!key || !disabledHosts) return false;
    for (var i = 0; i < disabledHosts.length; i++) {
      var entry = disabledHosts[i];
      if (key === entry || key.endsWith('.' + entry)) return true;
    }
    return false;
  }

  function normalizeShortcut(value, fallback) {
    var source = value && typeof value === 'object' ? value : fallback;
    return {
      code: typeof source.code === 'string' ? source.code : fallback.code,
      alt: !!source.alt,
      ctrl: !!source.ctrl,
      shift: !!source.shift,
      meta: !!source.meta
    };
  }

  function normalizeSettings(raw) {
    var input = raw && typeof raw === 'object' ? raw : {};
    var shortcuts = {};
    for (var i = 0; i < ACTIONS.length; i++) {
      var action = ACTIONS[i];
      var incoming = input.shortcuts && input.shortcuts[action];
      shortcuts[action] = normalizeShortcut(incoming, DEFAULT_SHORTCUTS[action]);
    }
    var preferred = Number(input.preferredRate);
    if (!isFinite(preferred)) preferred = 1;
    preferred = clamp(round1(preferred), MIN_RATE, MAX_RATE);
    var disabledHosts = [];
    if (Array.isArray(input.disabledHosts)) {
      for (var h = 0; h < input.disabledHosts.length; h++) {
        var key = hostKey(input.disabledHosts[h]);
        if (key && disabledHosts.indexOf(key) === -1) disabledHosts.push(key);
      }
    }
    var showTouchControls = null;
    if (input.showTouchControls === true) showTouchControls = true;
    if (input.showTouchControls === false) showTouchControls = false;
    return {
      version: 1,
      preferredRate: preferred,
      shortcuts: shortcuts,
      disabledHosts: disabledHosts,
      showTouchControls: showTouchControls
    };
  }

  function defaultSettings() {
    return normalizeSettings(null);
  }

  function modifier(value, keyName, boolName) {
    if (!value) return false;
    if (typeof value[keyName] === 'boolean') return value[keyName];
    return !!value[boolName];
  }

  function sameShortcut(shortcut, event) {
    if (!shortcut || !shortcut.code || !event || shortcut.code !== event.code) return false;
    return !!shortcut.alt === modifier(event, 'altKey', 'alt') &&
      !!shortcut.ctrl === modifier(event, 'ctrlKey', 'ctrl') &&
      !!shortcut.shift === modifier(event, 'shiftKey', 'shift') &&
      !!shortcut.meta === modifier(event, 'metaKey', 'meta');
  }

  function matchShortcut(settings, event) {
    for (var i = 0; i < ACTIONS.length; i++) {
      if (sameShortcut(settings.shortcuts[ACTIONS[i]], event)) return ACTIONS[i];
    }
    return null;
  }

  function shortcutLabel(shortcut) {
    if (!shortcut || !shortcut.code) return '—';
    var parts = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.meta) parts.push('⌘');
    parts.push(codeLabel(shortcut.code));
    return parts.join(' + ');
  }

  function codeLabel(code) {
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    var names = {
      Space: 'Space',
      Escape: 'Esc',
      Enter: 'Enter',
      Tab: 'Tab',
      Backspace: '⌫',
      ArrowLeft: '←',
      ArrowRight: '→',
      ArrowUp: '↑',
      ArrowDown: '↓',
      Minus: '−',
      Equal: '+',
      BracketLeft: '[',
      BracketRight: ']',
      Backslash: '\\',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/'
    };
    return names[code] || code;
  }

  function nextRate(current, action, preferred) {
    var rate = clamp(round1(Number(current) || 1), MIN_RATE, MAX_RATE);
    var ticks = Math.round(rate * 10);
    if (action === 'slower') return clamp((ticks - 1) / 10, MIN_RATE, MAX_RATE);
    if (action === 'faster') return clamp((ticks + 1) / 10, MIN_RATE, MAX_RATE);
    if (action === 'normal') {
      var pref = clamp(round1(Number(preferred) || 1), MIN_RATE, MAX_RATE);
      return Math.abs(rate - 1) < 0.051 ? pref : 1;
    }
    return rate;
  }

  function formatRate(rate) {
    var value = clamp(round1(Number(rate) || 1), MIN_RATE, MAX_RATE);
    return value.toFixed(1);
  }

  function createController(options) {
    options = options || {};
    var settings = normalizeSettings(options.initialSettings);
    var started = false;
    var sessionRate = null;
    var seen = [];
    var swallowed = {};
    var frameVideoUntil = 0;
    var dock = null;
    var recording = null;
    var huds = typeof WeakMap === 'function' ? new WeakMap() : null;
    var hudList = [];

    function persist() {
      if (typeof options.persist !== 'function') return;
      try { options.persist(clone(settings)); } catch (err) {}
    }

    function remember(id) {
      if (!id) return false;
      if (seen.indexOf(id) !== -1) return false;
      seen.push(id);
      if (seen.length > 40) seen.shift();
      return true;
    }

    function isFramed() {
      try { return window.top !== window; } catch (err) { return true; }
    }

    function topHost() {
      try {
        var origins = location.ancestorOrigins;
        if (origins && origins.length) {
          return hostKey(new URL(origins[origins.length - 1]).hostname);
        }
      } catch (err) {}
      try { return hostKey(location.hostname); } catch (err2) { return ''; }
    }

    function isDisabled() {
      return isHostBlocked(settings.disabledHosts, topHost());
    }

    function postToChildren(packet) {
      var frames;
      try { frames = document.querySelectorAll('iframe, frame'); } catch (err) { return; }
      for (var i = 0; i < frames.length; i++) {
        try {
          if (frames[i].contentWindow) frames[i].contentWindow.postMessage(packet, '*');
        } catch (err) {}
      }
    }

    function publishSettings() {
      var packet = { source: MSG, kind: 'settings', settings: clone(settings), id: uid() };
      remember(packet.id);
      postToChildren(packet);
    }

    function commit(next) {
      settings = normalizeSettings(next);
      persist();
      publishSettings();
      refreshDock();
    }

    function applyIncomingSettings(next) {
      var normalized = normalizeSettings(next);
      if (JSON.stringify(normalized) === JSON.stringify(settings)) return;
      settings = normalized;
      refreshDock();
    }

    function collectFrom(node, acc) {
      if (!node || !node.querySelectorAll) return;
      var videos;
      try { videos = node.querySelectorAll('video'); } catch (err) { return; }
      for (var i = 0; i < videos.length; i++) acc.push(videos[i]);
      var all;
      try { all = node.querySelectorAll('*'); } catch (err) { return; }
      for (var j = 0; j < all.length; j++) {
        if (all[j].shadowRoot) collectFrom(all[j].shadowRoot, acc);
      }
    }

    function allVideos() {
      var acc = [];
      collectFrom(document, acc);
      return acc;
    }

    function isPlaying(video) {
      return !video.paused && !video.ended && video.readyState >= 2;
    }

    function isControlTarget(video) {
      if (!video || String(video.tagName).toLowerCase() !== 'video') return false;
      if (isPlaying(video)) return true;
      return video.offsetWidth >= 48 && video.offsetHeight >= 36;
    }

    function isVisible(video) {
      var style;
      try { style = getComputedStyle(video); } catch (err) { return false; }
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      var opacity = parseFloat(style.opacity);
      if (isFinite(opacity) && opacity < 0.1) return false;
      var rect = video.getBoundingClientRect();
      if (rect.width < 16 || rect.height < 16) return false;
      if (rect.bottom < 0 || rect.right < 0) return false;
      if (rect.top > (window.innerHeight || 0) || rect.left > (window.innerWidth || 0)) return false;
      return true;
    }

    function targets() {
      return allVideos().filter(isControlTarget);
    }

    function hasWork() {
      if (targets().length) return true;
      return Date.now() < frameVideoUntil;
    }

    function important(el, prop, value) {
      el.style.setProperty(prop, value, 'important');
    }

    function findAnchor(video) {
      var width = video.offsetWidth;
      var height = video.offsetHeight;
      var node = video.parentElement;
      var best = null;
      for (var i = 0; i < 8 && node; i++) {
        if (Math.abs(node.offsetWidth - width) <= 6 && Math.abs(node.offsetHeight - height) <= 6) {
          best = node;
          break;
        }
        node = node.parentElement;
      }
      var anchor = best || video.parentElement || video;
      try {
        if (anchor !== video && getComputedStyle(anchor).position === 'static') {
          anchor.style.position = 'relative';
        }
      } catch (err) {}
      return anchor;
    }

    function hudFor(video) {
      if (huds && huds.has(video)) {
        var existing = huds.get(video);
        if (existing.host.isConnected) return existing;
      }
      var host = document.createElement('fast-video-hud');
      host.setAttribute('aria-hidden', 'true');
      important(host, 'z-index', '2147483646');
      important(host, 'pointer-events', 'none');
      important(host, 'opacity', '0');
      important(host, 'transition', 'opacity 0.45s ease');
      var shadow = host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = '<style>:host{all:initial} .label{font-family:system-ui,-apple-system,sans-serif;font-weight:760;letter-spacing:-0.04em;color:#fff;line-height:.85;text-shadow:0 2px 16px rgba(0,0,0,.72)}</style><div class="label"></div>';
      var record = { host: host, shadow: shadow, timer: 0, label: shadow.querySelector('.label') };
      placeHud(video, host);
      if (huds) huds.set(video, record);
      else hudList.push({ video: video, record: record });
      return record;
    }

    function placeHud(video, host) {
      var anchor = findAnchor(video);
      var fitted = anchor !== video &&
        Math.abs(anchor.offsetWidth - video.offsetWidth) <= 12 &&
        Math.abs(anchor.offsetHeight - video.offsetHeight) <= 12;
      if (fitted) {
        if (host.parentNode !== anchor) anchor.appendChild(host);
        important(host, 'position', 'absolute');
        important(host, 'right', '5%');
        important(host, 'bottom', '8%');
        important(host, 'left', 'auto');
        important(host, 'top', 'auto');
        return;
      }
      var root = document.documentElement || document.body;
      if (host.parentNode !== root) root.appendChild(host);
      var rect = video.getBoundingClientRect();
      important(host, 'position', 'fixed');
      important(host, 'left', Math.round(rect.left + rect.width * 0.52) + 'px');
      important(host, 'top', Math.round(rect.top + rect.height * 0.58) + 'px');
      important(host, 'right', 'auto');
      important(host, 'bottom', 'auto');
    }

    function showHud(video, text) {
      if (!isVisible(video)) return;
      var hud;
      try { hud = hudFor(video); } catch (err) { return; }
      try { placeHud(video, hud.host); } catch (err) {}
      var size = Math.max(22, Math.min(video.offsetHeight * 0.28, 112));
      hud.label.style.fontSize = size + 'px';
      hud.label.textContent = text;
      important(hud.host, 'opacity', '1');
      clearTimeout(hud.timer);
      hud.timer = setTimeout(function () {
        important(hud.host, 'opacity', '0');
      }, 1800);
    }

    function reassert(video, target) {
      if (video.dataset.fvRate !== String(target)) return;
      if (Math.abs(video.playbackRate - target) < 0.05) return;
      var hits = Number(video.dataset.fvHits || 0);
      if (hits > 8) return;
      video.dataset.fvHits = String(hits + 1);
      try { video.playbackRate = target; } catch (err) {}
    }

    function setVideoRate(video, rate) {
      var target = clamp(round1(rate), MIN_RATE, MAX_RATE);
      video.dataset.fvRate = String(target);
      video.dataset.fvHits = '0';
      try { video.preservesPitch = true; } catch (err) {}
      try { video.playbackRate = target; } catch (err) {}
      try { video.defaultPlaybackRate = target; } catch (err) {}
      if (Math.abs(video.playbackRate - target) > 0.05 && !video.paused && video.dataset.fvNudging !== '1') {
        video.dataset.fvNudging = '1';
        try { video.pause(); } catch (err) {}
        try { video.playbackRate = target; } catch (err) {}
        setTimeout(function () {
          video.play().catch(function () {});
          setTimeout(function () { video.dataset.fvNudging = '0'; }, 120);
        }, 80);
      }
      [40, 180, 500].forEach(function (delay) {
        setTimeout(function () { reassert(video, target); }, delay);
      });
      if (!video.dataset.fvLock) {
        video.dataset.fvLock = '1';
        video.addEventListener('ratechange', function () {
          var wanted = Number(video.dataset.fvRate);
          if (!wanted || Math.abs(video.playbackRate - wanted) < 0.05) return;
          reassert(video, wanted);
        }, true);
      }
    }

    function clickSkipButtons(root) {
      var nodes;
      try { nodes = root.querySelectorAll(SKIP_BUTTONS); } catch (err) { nodes = []; }
      for (var i = 0; i < nodes.length; i++) {
        try { nodes[i].click(); } catch (err) {}
      }
      var all;
      try { all = root.querySelectorAll('*'); } catch (err) { return; }
      for (var j = 0; j < all.length; j++) {
        if (all[j].shadowRoot) clickSkipButtons(all[j].shadowRoot);
      }
    }

    function runPlayerHooks() {
      var overlays;
      try {
        overlays = document.querySelectorAll("span[role='button'].videoSpritePlayButton");
      } catch (err) { overlays = []; }
      for (var i = 0; i < overlays.length; i++) {
        try { overlays[i].remove(); } catch (err) {}
      }
    }

    function applyLocal(action) {
      if (action === 'skip') {
        var skipped = false;
        var list = targets();
        for (var i = 0; i < list.length; i++) {
          var video = list[i];
          if (!isPlaying(video) || !isFinite(video.duration) || video.duration <= 0.2) continue;
          try {
            video.currentTime = Math.max(0, video.duration - 0.1);
            showHud(video, 'пропуск');
            skipped = true;
          } catch (err) {}
        }
        clickSkipButtons(document);
        return skipped;
      }
      var videos = targets();
      var last = null;
      for (var n = 0; n < videos.length; n++) {
        var item = videos[n];
        var rate = nextRate(item.playbackRate || 1, action, settings.preferredRate);
        setVideoRate(item, rate);
        sessionRate = rate;
        last = rate;
        showHud(item, formatRate(rate) + '×');
      }
      runPlayerHooks();
      if (last != null) updateDockRate(last);
      return videos.length > 0;
    }

    function broadcast(action) {
      var packet = { source: MSG, kind: 'apply', action: action, id: uid() };
      remember(packet.id);
      applyLocal(action);
      postToChildren(packet);
    }

    function requestAction(action, opts) {
      opts = opts || {};
      if (!opts.force && isDisabled()) return;
      if (ACTIONS.indexOf(action) === -1) return;
      if (!opts.force && isFramed()) {
        try {
          window.parent.postMessage({ source: MSG, kind: 'bubble', action: action, id: uid() }, '*');
        } catch (err) {}
        return;
      }
      broadcast(action);
    }

    function typingTarget(node) {
      if (!node || node.nodeType !== 1) return false;
      var tag = node.tagName ? node.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (node.isContentEditable) return true;
      var role = node.getAttribute && node.getAttribute('role');
      return role === 'textbox' || role === 'searchbox' || role === 'combobox';
    }

    function shouldIgnore(event) {
      if (!event.isTrusted) return true;
      if (isDisabled()) return true;
      if (recording) return true;
      var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      for (var i = 0; i < path.length; i++) {
        var node = path[i];
        if (node && node.tagName && String(node.tagName).toLowerCase().indexOf('fast-video') === 0) return true;
        if (typingTarget(node)) return true;
      }
      if (typingTarget(event.target)) return true;
      try { if (document.designMode === 'on') return true; } catch (err) {}
      return false;
    }

    function onKeyDown(event) {
      if (recording) {
        takeShortcut(event);
        return;
      }
      var action = matchShortcut(settings, event);
      if (!action || shouldIgnore(event)) return;
      swallowed[event.code] = true;
      event.preventDefault();
      event.stopPropagation();
      requestAction(action);
    }

    function onKeyUp(event) {
      if (!swallowed[event.code]) return;
      delete swallowed[event.code];
      event.preventDefault();
      event.stopPropagation();
    }

    function onMessage(event) {
      var data = event.data;
      if (!data || data.source !== MSG) return;
      if (data.kind === 'has-video') {
        frameVideoUntil = Date.now() + 4000;
        refreshDock();
        return;
      }
      if (data.id && !remember(data.id)) return;
      if (data.kind === 'settings') {
        applyIncomingSettings(data.settings);
        postToChildren(data);
        return;
      }
      if (data.kind === 'bubble') {
        if (isFramed()) {
          try { window.parent.postMessage(data, '*'); } catch (err) {}
        } else {
          broadcast(data.action);
        }
        return;
      }
      if (data.kind === 'apply') {
        applyLocal(data.action);
        postToChildren(data);
      }
    }

    function noteChildVideos() {
      if (!isFramed() || !targets().length) return;
      try { window.parent.postMessage({ source: MSG, kind: 'has-video' }, '*'); } catch (err) {}
    }

    function onPlay(event) {
      var video = event.target;
      if (!video || String(video.tagName).toLowerCase() !== 'video') return;
      if (sessionRate != null && video.dataset.fvNudging !== '1' && Math.abs((video.playbackRate || 1) - sessionRate) >= 0.05) {
        setVideoRate(video, sessionRate);
      }
      refreshDock();
    }

    function coarsePointer() {
      try { return window.matchMedia('(pointer: coarse)').matches; } catch (err) { return false; }
    }

    function dockMode() {
      if (isFramed() || !hasWork()) return 'hidden';
      var pref = settings.showTouchControls;
      var wantFull = pref === true || (pref == null && coarsePointer());
      if (isDisabled()) return coarsePointer() || pref === true ? 'chip' : 'hidden';
      if (wantFull) return 'full';
      if (coarsePointer() && pref === false) return 'chip';
      return 'hidden';
    }

    function updateDockRate(rate) {
      if (!dock) return;
      var text = formatRate(rate) + '×';
      dock.rate.textContent = text;
      dock.chip.textContent = text;
    }

    function updateSheet() {
      if (!dock || recording) return;
      for (var i = 0; i < ACTIONS.length; i++) {
        var action = ACTIONS[i];
        var label = dock.shadow.getElementById('sc-' + action);
        if (label) label.textContent = shortcutLabel(settings.shortcuts[action]);
      }
      if (dock.shadow.activeElement !== dock.slider) {
        dock.slider.value = String(Math.min(3, Math.max(0.5, settings.preferredRate)));
      }
      dock.prefOut.textContent = formatRate(settings.preferredRate) + '×';
      dock.block.checked = isDisabled();
      dock.touch.checked = settings.showTouchControls !== false;
    }

    function refreshDock() {
      var mode = dockMode();
      if (mode === 'hidden') {
        if (dock) important(dock.host, 'display', 'none');
        return;
      }
      if (!dock) dock = createDock();
      important(dock.host, 'display', 'block');
      dock.full.hidden = mode !== 'full';
      dock.chip.hidden = mode !== 'chip';
      var primary = null;
      var list = targets();
      for (var i = 0; i < list.length; i++) {
        if (isVisible(list[i]) && (!primary || list[i].offsetWidth > primary.offsetWidth)) primary = list[i];
      }
      updateDockRate(primary ? primary.playbackRate : settings.preferredRate);
      updateSheet();
    }

    function takeShortcut(event) {
      if (!recording) return;
      if (!event.isTrusted) return;
      event.preventDefault();
      event.stopPropagation();
      if (/^(Shift|Control|Alt|Meta)/.test(event.code)) return;
      var action = recording;
      recording = null;
      if (event.code === 'Escape') {
        updateSheet();
        return;
      }
      var shortcut = {
        code: event.code,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        meta: event.metaKey
      };
      var shortcuts = clone(settings.shortcuts);
      for (var i = 0; i < ACTIONS.length; i++) {
        if (ACTIONS[i] !== action && sameShortcut(shortcuts[ACTIONS[i]], shortcut)) {
          shortcuts[ACTIONS[i]] = { code: '', alt: false, ctrl: false, shift: false, meta: false };
        }
      }
      shortcuts[action] = shortcut;
      commit({
        preferredRate: settings.preferredRate,
        shortcuts: shortcuts,
        disabledHosts: settings.disabledHosts,
        showTouchControls: settings.showTouchControls
      });
    }

    function toggleHost(blocked) {
      var host = topHost();
      if (!host) {
        updateSheet();
        return;
      }
      var hosts = settings.disabledHosts.filter(function (item) { return item !== host; });
      if (blocked) hosts.push(host);
      commit({
        preferredRate: settings.preferredRate,
        shortcuts: settings.shortcuts,
        disabledHosts: hosts,
        showTouchControls: settings.showTouchControls
      });
    }

    function createDock() {
      var host = document.createElement('fast-video-dock');
      important(host, 'all', 'initial');
      important(host, 'position', 'fixed');
      important(host, 'left', '50%');
      important(host, 'bottom', 'calc(14px + env(safe-area-inset-bottom))');
      important(host, 'transform', 'translateX(-50%)');
      important(host, 'z-index', '2147483647');
      important(host, 'width', 'max-content');
      important(host, 'max-width', 'calc(100vw - 16px)');
      var shadow = host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = [
        '<style>',
        ':host{all:initial}',
        '.panel{font-family:system-ui,-apple-system,sans-serif;color:#fff}',
        '.dock,.chip{display:flex;gap:4px;align-items:center;padding:4px;border-radius:999px;background:rgba(18,18,18,.88);box-shadow:0 8px 28px rgba(0,0,0,.35)}',
        'button{appearance:none;border:0;background:transparent;color:#fff;font:600 15px/1 system-ui,-apple-system,sans-serif;min-width:40px;height:40px;border-radius:999px;padding:0 10px}',
        'button:active{background:rgba(255,255,255,.16)}',
        '.rate{min-width:68px;font-variant-numeric:tabular-nums}',
        '.chip{min-width:64px;justify-content:center}',
        '.sheet{margin-bottom:8px;width:min(320px,calc(100vw - 20px));padding:12px;border-radius:16px;background:rgba(18,18,18,.94);box-shadow:0 8px 28px rgba(0,0,0,.35)}',
        '.sheet[hidden],.dock[hidden],.chip[hidden]{display:none}',
        '.title{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin:8px 0 4px}',
        '.hint{margin:6px 0 10px;color:rgba(255,255,255,.68);font-size:12px;line-height:1.35}',
        'input[type=range]{width:100%;accent-color:#f0b429}',
        '.sc{width:100%;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.06);margin-top:6px;border-radius:10px;padding:0 12px;height:36px}',
        '.check{display:flex;gap:8px;align-items:center;font-size:13px;margin-top:8px}',
        '.link{background:transparent;color:#f0b429;font-size:12px;height:32px;padding:0;margin-top:6px}',
        '</style>',
        '<div class="panel">',
        '<div class="sheet" id="sheet" hidden>',
        '<div class="title"><span>Своя скорость</span><span id="pref-out">1.0×</span></div>',
        '<input id="pref" type="range" min="0.5" max="3" step="0.1" value="1" />',
        '<p class="hint">Средняя кнопка и D: не 1× возвращает 1×, уже 1× ставит свою скорость. S и F меняют шаг на 0.1.</p>',
        '<div id="shortcuts"></div>',
        '<label class="check"><input id="block" type="checkbox" /> Не работать на этом сайте</label>',
        '<label class="check"><input id="touch" type="checkbox" checked /> Кнопки поверх видео</label>',
        '<button type="button" class="link" id="reset">Сбросить клавиши и скорость</button>',
        '</div>',
        '<div class="dock" id="full">',
        '<button type="button" data-act="slower" aria-label="Медленнее">−</button>',
        '<button type="button" data-act="normal" id="rate" aria-label="1× или своя скорость">1.0×</button>',
        '<button type="button" data-act="faster" aria-label="Быстрее">+</button>',
        '<button type="button" data-act="skip" aria-label="Пропустить">⏭</button>',
        '<button type="button" id="gear" aria-label="Настройки">⚙</button>',
        '</div>',
        '<button type="button" class="chip" id="chip" hidden>1.0×</button>',
        '</div>'
      ].join('');
      var shortcuts = shadow.getElementById('shortcuts');
      ACTIONS.forEach(function (action) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'sc';
        button.dataset.record = action;
        button.innerHTML = '<span>' + ACTION_TITLE[action] + '</span><span id="sc-' + action + '"></span>';
        shortcuts.appendChild(button);
      });
      var api = {
        host: host,
        shadow: shadow,
        full: shadow.getElementById('full'),
        chip: shadow.getElementById('chip'),
        sheet: shadow.getElementById('sheet'),
        rate: shadow.getElementById('rate'),
        slider: shadow.getElementById('pref'),
        prefOut: shadow.getElementById('pref-out'),
        block: shadow.getElementById('block'),
        touch: shadow.getElementById('touch')
      };
      shadow.addEventListener('click', function (event) {
        var button = event.target.closest ? event.target.closest('button') : null;
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        if (button.dataset.act) {
          requestAction(button.dataset.act);
          return;
        }
        if (button.id === 'gear' || button.id === 'chip') {
          api.sheet.hidden = !api.sheet.hidden;
          if (!api.sheet.hidden) updateSheet();
          return;
        }
        if (button.dataset.record) {
          recording = button.dataset.record;
          shadow.getElementById('sc-' + recording).textContent = 'клавиша…';
          return;
        }
        if (button.id === 'reset') {
          recording = null;
          commit({
            preferredRate: 1,
            shortcuts: clone(DEFAULT_SHORTCUTS),
            disabledHosts: settings.disabledHosts,
            showTouchControls: null
          });
        }
      });
      api.slider.addEventListener('input', function () {
        api.prefOut.textContent = formatRate(api.slider.value) + '×';
        commit({
          preferredRate: Number(api.slider.value),
          shortcuts: settings.shortcuts,
          disabledHosts: settings.disabledHosts,
          showTouchControls: settings.showTouchControls
        });
      });
      api.block.addEventListener('change', function () { toggleHost(api.block.checked); });
      api.touch.addEventListener('change', function () {
        commit({
          preferredRate: settings.preferredRate,
          shortcuts: settings.shortcuts,
          disabledHosts: settings.disabledHosts,
          showTouchControls: api.touch.checked
        });
      });
      (document.documentElement || document.body).appendChild(host);
      return api;
    }

    function status() {
      var list = targets();
      var primary = null;
      for (var i = 0; i < list.length; i++) {
        if (!primary || list[i].offsetWidth > primary.offsetWidth) primary = list[i];
      }
      return {
        videos: list.length,
        rate: primary ? primary.playbackRate : null,
        disabled: isDisabled(),
        host: topHost(),
        embedded: Date.now() < frameVideoUntil
      };
    }

    function start() {
      if (started) return;
      started = true;
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('keyup', onKeyUp, true);
      window.addEventListener('message', onMessage, true);
      document.addEventListener('play', onPlay, true);
      document.addEventListener('pointerdown', function (event) {
        if (!dock || dock.sheet.hidden) return;
        if (event.composedPath && event.composedPath().indexOf(dock.host) !== -1) return;
        dock.sheet.hidden = true;
      }, true);
      setInterval(function () {
        noteChildVideos();
        refreshDock();
      }, 1000);
      if (!isFramed()) publishSettings();
      refreshDock();
    }

    return {
      start: start,
      requestAction: requestAction,
      applySettings: applyIncomingSettings,
      commit: commit,
      getSettings: function () { return clone(settings); },
      status: status
    };
  }

  var api = {
    ACTIONS: ACTIONS,
    ACTION_TITLE: ACTION_TITLE,
    MIN_RATE: MIN_RATE,
    MAX_RATE: MAX_RATE,
    defaultSettings: defaultSettings,
    normalizeSettings: normalizeSettings,
    nextRate: nextRate,
    matchShortcut: matchShortcut,
    sameShortcut: sameShortcut,
    shortcutLabel: shortcutLabel,
    hostKey: hostKey,
    isHostBlocked: isHostBlocked,
    formatRate: formatRate,
    createController: createController
  };

  root.FastVideo = api;
  try {
    if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
  } catch (err) {}
})(typeof globalThis !== 'undefined' ? globalThis : this);

(function () {
  'use strict';

  function loadSettings(done) {
    try {
      if (typeof GM_getValue === 'function') {
        var value = GM_getValue('settings', null);
        if (value && typeof value.then === 'function') {
          value.then(function (stored) { done(stored); }, function () { done(null); });
          return;
        }
        done(value);
        return;
      }
    } catch (err) {}
    try {
      if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') {
        Promise.resolve(GM.getValue('settings', null)).then(done, function () { done(null); });
        return;
      }
    } catch (err) {}
    try {
      done(JSON.parse(localStorage.getItem('fast-video-settings') || 'null'));
    } catch (err) {
      done(null);
    }
  }

  function persist(settings) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue('settings', settings);
    } catch (err) {}
    try {
      if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') GM.setValue('settings', settings);
    } catch (err) {}
    try {
      localStorage.setItem('fast-video-settings', JSON.stringify(settings));
    } catch (err) {}
  }

  function boot() {
    loadSettings(function (stored) {
      FastVideo.createController({
        initialSettings: stored,
        persist: persist
      }).start();
    });
  }

  if (document.documentElement) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
