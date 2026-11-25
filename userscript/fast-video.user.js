// ==UserScript==
// @name         Fast Video
// @namespace    https://github.com/apoev/fast-video
// @version      1.2.27
// @description  Скорость HTML5-видео на iPhone и iPad: S медленнее, D своя/1×, F быстрее, E пропуск. Кнопки на экране, если нет клавиатуры.
// @author       apoev
// @match        *://*/*
// @match        http://*/*
// @match        https://*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
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

  function snapOpacity(value, fallback) {
    var n = Number(value);
    if (!isFinite(n)) n = fallback == null ? 0.45 : fallback;
    return clamp(Math.round(n * 20) / 20, 0.25, 1);
  }

  function snapScale(value) {
    var n = Number(value);
    if (!isFinite(n)) n = 0.8;
    return clamp(Math.round(n * 10) / 10, 0.6, 1.6);
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
    return {
      version: 1,
      preferredRate: preferred,
      shortcuts: shortcuts,
      disabledHosts: disabledHosts,
      showTouchControls: true,
      dockPlace: input.dockPlace === 'screen' ? 'screen' : 'player',
      dockAnchor: input.dockAnchor === 'top' || input.dockAnchor === 'center' || input.dockAnchor === 'left' || input.dockAnchor === 'right'
        ? (input.dockAnchor === 'center' ? 'top' : input.dockAnchor)
        : 'bottom',
      dockOpacity: snapOpacity(input.dockOpacity),
      hudOpacity: snapOpacity(input.hudOpacity),
      dockScale: snapScale(input.dockScale),
      showPresets: input.showPresets !== false
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

  function nextRate(current, action, preferred, step) {
    var rate = clamp(round1(Number(current) || 1), MIN_RATE, MAX_RATE);
    var delta = Number(step);
    if ((action === 'slower' || action === 'faster') && isFinite(delta) && delta > 0.05) {
      var precise = clamp(Math.round((Number(current) || 1) * 100) / 100, MIN_RATE, MAX_RATE);
      var moved = action === 'slower' ? precise - delta : precise + delta;
      return clamp(Math.round(moved * 100) / 100, MIN_RATE, MAX_RATE);
    }
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
    var value = clamp(Math.round((Number(rate) || 1) * 100) / 100, MIN_RATE, MAX_RATE);
    return Math.round(value * 100) % 10 === 0 ? value.toFixed(1) : value.toFixed(2);
  }

  function readMediaTiming(duration) {
    var value = Number(duration);
    if (value === Infinity) return { duration: null, live: true };
    if (!isFinite(value) || value <= 0.2) return { duration: null, live: false };
    return { duration: Math.round(value), live: false };
  }

  function formatDuration(seconds) {
    var timing = readMediaTiming(seconds);
    if (timing.live) return 'эфир';
    if (timing.duration == null) return '';
    var total = timing.duration;
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var secs = total % 60;
    function pad(value) { return (value < 10 ? '0' : '') + value; }
    if (hours > 0) return hours + ':' + pad(minutes) + ':' + pad(secs);
    return minutes + ':' + pad(secs);
  }

  function pageIdentity(url) {
    var raw = String(url || '').trim();
    if (!raw) return '';
    var parsed;
    try { parsed = new URL(raw); } catch (err) { return raw; }
    var host = hostKey(parsed.hostname);
    var youtube = host === 'youtube.com' || host === 'youtube-nocookie.com' ||
      host.endsWith('.youtube.com') || host.endsWith('.youtube-nocookie.com');
    if (host === 'youtu.be') {
      var shortId = parsed.pathname.split('/').filter(Boolean)[0] || '';
      return shortId ? 'yt:' + shortId : raw;
    }
    if (youtube) {
      var videoId = parsed.searchParams.get('v');
      if (videoId) return 'yt:' + videoId;
      var parts = parsed.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'v') && parts[1]) {
        return 'yt:' + parts[1];
      }
    }
    if (host === 'rutube.ru' || host.endsWith('.rutube.ru')) {
      ['autoplay', 'mute', 'muted', 'autostartmute', 't', 'start', 'stopTime', 'endTime', 'skinColor', 'q', 'quality', 'r'].forEach(function (key) {
        parsed.searchParams.delete(key);
      });
    }
    parsed.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'si', 'feature', 'fbclid', 'gclid'].forEach(function (key) {
      parsed.searchParams.delete(key);
    });
    var keys = [];
    parsed.searchParams.forEach(function (_value, key) {
      if (keys.indexOf(key) === -1) keys.push(key);
    });
    keys.sort();
    var query = [];
    for (var i = 0; i < keys.length; i++) {
      var values = parsed.searchParams.getAll(keys[i]);
      for (var n = 0; n < values.length; n++) {
        query.push(encodeURIComponent(keys[i]) + '=' + encodeURIComponent(values[n]));
      }
    }
    return parsed.origin + parsed.pathname + (query.length ? '?' + query.join('&') : '');
  }

  function normalizePlaylist(raw) {
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (err) { raw = null; }
    }
    var input = raw && typeof raw === 'object' ? raw : {};
    var items = [];
    var seenIds = {};
    var source = Array.isArray(input.items) ? input.items : [];
    for (var i = 0; i < source.length; i++) {
      var item = source[i];
      if (!item || typeof item !== 'object' || typeof item.url !== 'string') continue;
      var url = item.url.trim();
      if (!/^https?:\/\//i.test(url)) continue;
      if (url.length > 2000) url = url.slice(0, 2000);
      var id = typeof item.id === 'string' && item.id && !seenIds[item.id] ? item.id : uid();
      seenIds[id] = true;
      var timing = readMediaTiming(item.duration);
      if (item.live && timing.duration == null) timing = { duration: null, live: true };
      var title = String(item.title || url).replace(/\s+/g, ' ').trim().slice(0, 180);
      items.push({
        id: id,
        url: url,
        title: title || url,
        duration: timing.duration,
        live: timing.live,
        added: isFinite(Number(item.added)) ? Number(item.added) : 0,
        poster: sanitizePoster(item.poster)
      });
    }
    if (items.length > 100) items = items.slice(items.length - 100);
    var currentId = typeof input.currentId === 'string' ? input.currentId : '';
    var found = false;
    for (var j = 0; j < items.length; j++) {
      if (items[j].id === currentId) found = true;
    }
    if (!found) currentId = items.length ? items[0].id : '';
    var playId = typeof input.playId === 'string' ? input.playId : '';
    var playFound = false;
    for (var p = 0; p < items.length; p++) {
      if (items[p].id === playId) playFound = true;
    }
    if (!playFound) playId = '';
    var playAt = playId && isFinite(Number(input.playAt)) ? Number(input.playAt) : 0;
    return {
      items: items,
      currentId: currentId,
      open: input.open !== false,
      playId: playId,
      playAt: playAt
    };
  }

  function sanitizePoster(value) {
    if (typeof value !== 'string') return '';
    var poster = value.trim();
    if (poster.indexOf('//') === 0) poster = 'https:' + poster;
    if (/^https:\/\//i.test(poster) && poster.length <= 2000 && poster.indexOf(' ') === -1) return poster;
    if (/^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(poster) && poster.length <= 48000) return poster;
    return '';
  }

  function rutubeId(url) {
    var parsed;
    try { parsed = new URL(url); } catch (err) { return ''; }
    var host = hostKey(parsed.hostname);
    if (host !== 'rutube.ru' && !host.endsWith('.rutube.ru')) return '';
    var parts = parsed.pathname.split('/').filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      if (/^[0-9a-f]{32}$/i.test(parts[i])) return parts[i].toLowerCase();
    }
    return '';
  }

  function rutubePoster(url) {
    var id = rutubeId(url);
    if (!id) return '';
    return 'https://rutube.ru/api/video/' + id + '/thumbnail/?redirect=1';
  }

  function knownPoster(url) {
    return youtubePoster(url) || rutubePoster(url);
  }

  function youtubePoster(url) {
    var ident = pageIdentity(url);
    if (ident.indexOf('yt:') !== 0) return '';
    var id = ident.slice(3);
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return '';
    return 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg';
  }

  function reorderItems(items, ids) {
    var map = {};
    var used = {};
    var next = [];
    var list = Array.isArray(items) ? items : [];
    var order = Array.isArray(ids) ? ids : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id) map[list[i].id] = list[i];
    }
    for (var n = 0; n < order.length; n++) {
      var item = map[order[n]];
      if (!item || used[item.id]) continue;
      used[item.id] = true;
      next.push(item);
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j] && !used[list[j].id]) next.push(list[j]);
    }
    return next;
  }

  function playlistNext(playlist, pageUrl) {
    var list = normalizePlaylist(playlist);
    var index = -1;
    for (var i = 0; i < list.items.length; i++) {
      if (list.items[i].id === list.currentId) {
        index = i;
        break;
      }
    }
    if (index < 0 || index + 1 >= list.items.length) return null;
    if (pageUrl && pageIdentity(list.items[index].url) !== pageIdentity(pageUrl)) return null;
    for (var n = index + 1; n < list.items.length; n++) {
      if (!pageUrl || pageIdentity(list.items[n].url) !== pageIdentity(pageUrl)) return list.items[n];
    }
    return null;
  }

  function playlistClipboard(playlist) {
    var list = normalizePlaylist(playlist);
    var lines = [];
    var seen = {};
    for (var i = 0; i < list.items.length; i++) {
      var url = list.items[i].url;
      var ident = pageIdentity(url);
      if (!url || !ident || seen[ident]) continue;
      seen[ident] = true;
      lines.push(url);
    }
    return lines.join('\n');
  }

  function durationsMatch(seen, stored) {
    var now = readMediaTiming(seen);
    var known = readMediaTiming(stored);
    if (now.live || now.duration == null || known.live || known.duration == null) return false;
    var slack = Math.max(2, known.duration * 0.03);
    return Math.abs(now.duration - known.duration) <= slack;
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
    var settingsHold = false;
    var pointerInPlayer = false;
    var dockVisible = false;
    var dockFadeTimer = 0;
    var huds = typeof WeakMap === 'function' ? new WeakMap() : null;
    var hudList = [];
    var playlist = normalizePlaylist(null);
    var playlistUi = null;
    var listDrag = null;
    var suppressPlaylistClick = false;
    var playlistSaving = 0;
    var posterCheckedFor = '';
    var playlistQueue = [];
    var playlistQueueRunning = false;
    var advancing = false;
    var playedPastStart = false;
    var enqueuedHere = false;
    var copyStamp = 0;
    var resumeTimer = 0;
    var resumeUntil = 0;
    var resumeStarted = false;
    var playbackAck = false;
    var askedToPlay = false;
    var nativeAssign = null;
    var nativeReload = null;
    try { nativeAssign = Location.prototype.assign; } catch (err) {}
    try { nativeReload = Location.prototype.reload; } catch (err2) {}

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
      settings = normalizeSettings(Object.assign({}, settings, next));
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
      shadow.innerHTML = '<style>.label{display:block;font-family:system-ui,-apple-system,sans-serif;font-weight:760;letter-spacing:-0.04em;color:#fff;line-height:.85;text-shadow:0 2px 16px rgba(0,0,0,.72)}</style><div class="label"></div>';
      var record = { host: host, shadow: shadow, timer: 0, label: shadow.querySelector('.label') };
      placeHud(video, host);
      if (huds) huds.set(video, record);
      else hudList.push({ video: video, record: record });
      return record;
    }

    function placeHud(video, host) {
      important(host, 'display', 'block');
      important(host, 'margin', '0');
      important(host, 'width', 'max-content');
      important(host, 'transform', 'none');
      important(host, 'z-index', '2147483646');
      important(host, 'pointer-events', 'none');
      var rect = video.getBoundingClientRect();
      if (rect.width < 16 || rect.height < 16) return;
      var anchor = findAnchor(video);
      var anchorRect = anchor.getBoundingClientRect();
      var fitted = anchor !== video &&
        anchorRect.width > 16 && anchorRect.height > 16 &&
        Math.abs(anchorRect.width - rect.width) <= 24 &&
        Math.abs(anchorRect.height - rect.height) <= 24 &&
        Math.abs(anchorRect.top - rect.top) <= 24 &&
        Math.abs(anchorRect.left - rect.left) <= 24;
      if (fitted) {
        if (host.parentNode !== anchor) anchor.appendChild(host);
        important(host, 'position', 'absolute');
        important(host, 'right', Math.max(8, Math.round(rect.width * 0.05)) + 'px');
        important(host, 'bottom', Math.max(8, Math.round(rect.height * 0.08)) + 'px');
        important(host, 'left', 'auto');
        important(host, 'top', 'auto');
        return;
      }
      var root = document.documentElement || document.body;
      if (host.parentNode !== root) root.appendChild(host);
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
      important(hud.host, 'opacity', String(settings.hudOpacity));
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
      var target = clamp(Math.round(rate * 100) / 100, MIN_RATE, MAX_RATE);
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

    function applyLocal(action, rate, step) {
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
      var fixed = null;
      if (action === 'set') {
        fixed = clamp(round1(Number(rate)), MIN_RATE, MAX_RATE);
        if (!isFinite(fixed)) return false;
      }
      var videos = targets();
      var last = null;
      for (var n = 0; n < videos.length; n++) {
        var item = videos[n];
        var next = fixed != null ? fixed : nextRate(item.playbackRate || 1, action, settings.preferredRate, step);
        setVideoRate(item, next);
        sessionRate = next;
        last = next;
        showHud(item, formatRate(next) + '×');
      }
      runPlayerHooks();
      if (last != null) updateDockRate(last);
      return videos.length > 0;
    }

    function broadcast(action, rate, step) {
      var packet = { source: MSG, kind: 'apply', action: action, id: uid() };
      if (action === 'set') packet.rate = rate;
      if (isFinite(step) && step > 0) packet.step = step;
      remember(packet.id);
      applyLocal(action, rate, step);
      postToChildren(packet);
    }

    function requestAction(action, opts) {
      opts = opts || {};
      if (!opts.force && isDisabled()) return;
      if (action !== 'set' && ACTIONS.indexOf(action) === -1) return;
      var rate = null;
      var step = Number(opts.step);
      if (!isFinite(step) || step <= 0) step = 0;
      if (action === 'set') {
        rate = clamp(round1(Number(opts.rate)), MIN_RATE, MAX_RATE);
        if (!isFinite(rate)) return;
      }
      if (!opts.force && isFramed()) {
        try {
          var bubble = { source: MSG, kind: 'bubble', action: action, id: uid() };
          if (action === 'set') bubble.rate = rate;
          if (step) bubble.step = step;
          window.parent.postMessage(bubble, '*');
        } catch (err) {}
        return;
      }
      broadcast(action, rate, step);
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
      if (data.kind === 'playlist-add' || data.kind === 'playlist-ended' || data.kind === 'playlist-timing') {
        if (isFramed()) {
          try { window.parent.postMessage(data, '*'); } catch (err) {}
          return;
        }
        var timing = timingFrom(data.duration, data.live);
        if (data.kind === 'playlist-add') addCurrentPage(timing, true, data.poster);
        else if (data.kind === 'playlist-ended') handleEnded(timing, !!data.ad, !!data.played);
        else noteTiming(timing);
        return;
      }
      if (data.kind === 'playlist-play') {
        if (!isFramed()) return;
        postToChildren(data);
        attemptLocalPlay();
        return;
      }
      if (data.kind === 'playlist-started') {
        if (isFramed()) {
          try { window.parent.postMessage(data, '*'); } catch (err) {}
          return;
        }
        notePlaybackStarted();
        return;
      }
      if (data.kind === 'bubble') {
        if (isFramed()) {
          try { window.parent.postMessage(data, '*'); } catch (err) {}
        } else {
          broadcast(data.action, data.rate, data.step);
        }
        return;
      }
      if (data.kind === 'apply') {
        applyLocal(data.action, data.rate, data.step);
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
      if (wantsPlayback() || askedToPlay) watchPlayback(video);
      refreshDock();
    }

    function coarsePointer() {
      try {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia('(any-pointer: coarse)').matches) return true;
      } catch (err) {}
      try { return navigator.maxTouchPoints > 0; } catch (err2) { return false; }
    }

    function hoverControls() {
      try {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      } catch (err) {
        return false;
      }
    }

    function pointerHitsPlayer(event) {
      var video = primaryVideo();
      if (!video) return false;
      var shell = playerShell(video);
      var path = event.composedPath ? event.composedPath() : [event.target];
      for (var i = 0; i < path.length; i++) {
        if (path[i] === shell) return true;
      }
      return false;
    }

    function dockMode() {
      if (settingsHold && !isFramed()) return 'full';
      if (settings.dockPlace === 'player') {
        if (!primaryVideo()) return 'hidden';
        if (hoverControls() && !pointerInPlayer) return 'hidden';
      } else if (isFramed() || !hasWork()) {
        return 'hidden';
      }
      if (isDisabled()) return 'chip';
      return 'full';
    }

    function primaryVideo() {
      var primary = null;
      var list = targets();
      for (var i = 0; i < list.length; i++) {
        if (isVisible(list[i]) && (!primary || list[i].offsetWidth > primary.offsetWidth)) primary = list[i];
      }
      return primary;
    }

    function playerShell(video) {
      var width = video.offsetWidth;
      var height = video.offsetHeight;
      var node = video.parentElement;
      var best = node || video;
      for (var i = 0; i < 8 && node && node !== document.body && node !== document.documentElement; i++) {
        var dw = Math.abs(node.offsetWidth - width);
        var dh = Math.abs(node.offsetHeight - height);
        if (dw <= 96 && dh <= 140 && node.offsetWidth >= width * 0.75) best = node;
        else if (node.offsetWidth > width + 180 || node.offsetHeight > height + 220) break;
        node = node.parentElement;
      }
      try {
        if (best !== video && getComputedStyle(best).position === 'static') best.style.position = 'relative';
      } catch (err) {}
      return best;
    }

    function placeDock() {
      if (!dock) return;
      var host = dock.host;
      var root = document.documentElement || document.body;
      var video = settings.dockPlace === 'player' && !settingsHold ? primaryVideo() : null;
      var shift = 'translateX(-50%)';
      var anchor = settings.dockAnchor;
      important(host, 'transform-origin', 'center bottom');
      important(host, 'z-index', '2147483647');
      important(host, 'pointer-events', 'auto');
      important(host, 'width', 'max-content');
      important(host, 'max-width', 'none');
      if (!video) {
        if (host.parentNode !== root) root.appendChild(host);
        important(host, 'position', 'fixed');
        important(host, 'margin', '0');
        important(host, 'display', 'block');
        important(host, 'height', 'auto');
        if (!settingsHold && anchor === 'top') {
          important(host, 'left', '50%');
          important(host, 'right', 'auto');
          important(host, 'top', 'calc(8px + env(safe-area-inset-top))');
          important(host, 'bottom', 'auto');
          important(host, 'transform', shift);
          return;
        }
        if (!settingsHold && (anchor === 'left' || anchor === 'right')) {
          important(host, 'top', '50%');
          important(host, 'bottom', 'auto');
          important(host, 'height', 'auto');
          important(host, 'transform', 'translateY(-50%)');
          if (anchor === 'left') {
            important(host, 'left', '0');
            important(host, 'right', 'auto');
          } else {
            important(host, 'left', 'auto');
            important(host, 'right', '0');
          }
          return;
        }
        important(host, 'left', '50%');
        important(host, 'right', 'auto');
        important(host, 'top', 'auto');
        important(host, 'bottom', 'calc(14px + env(safe-area-inset-bottom))');
        important(host, 'transform', shift);
        return;
      }
      var shell = playerShell(video);
      if (host.parentNode !== shell || shell.lastElementChild !== host) shell.appendChild(host);
      important(host, 'position', 'absolute');
      important(host, 'margin', '0');
      var shellRect = shell.getBoundingClientRect();
      var videoRect = video.getBoundingClientRect();
      important(host, 'display', 'block');
      important(host, 'height', 'auto');
      if (anchor === 'top') {
        var top = Math.max(8, Math.round(videoRect.top - shellRect.top + 8));
        important(host, 'left', '50%');
        important(host, 'right', 'auto');
        important(host, 'top', top + 'px');
        important(host, 'bottom', 'auto');
        important(host, 'transform', shift);
        return;
      }
      if (anchor === 'left' || anchor === 'right') {
        var mid = Math.round((videoRect.top + videoRect.bottom) / 2 - shellRect.top);
        important(host, 'top', mid + 'px');
        important(host, 'bottom', 'auto');
        important(host, 'height', 'auto');
        important(host, 'transform', 'translateY(-50%)');
        if (anchor === 'left') {
          important(host, 'left', Math.max(0, Math.round(videoRect.left - shellRect.left)) + 'px');
          important(host, 'right', 'auto');
        } else {
          important(host, 'left', 'auto');
          important(host, 'right', Math.max(0, Math.round(shellRect.right - videoRect.right)) + 'px');
        }
        return;
      }
      var bottom = Math.max(10, Math.round(shellRect.bottom - videoRect.bottom + 10));
      important(host, 'left', '50%');
      important(host, 'right', 'auto');
      important(host, 'top', 'auto');
      important(host, 'bottom', bottom + 'px');
      important(host, 'transform', shift);
    }

    function applyDockLook() {
      if (!dock) return;
      var video = settings.dockPlace === 'player' ? primaryVideo() : null;
      var placeAnchor = settingsHold ? 'bottom' : settings.dockAnchor;
      var vertical = placeAnchor === 'left' || placeAnchor === 'right';
      var needed = vertical
        ? (settings.showPresets === false ? 332 : 512)
        : (settings.showPresets === false ? 352 : 532);
      var room = video
        ? (vertical ? video.offsetHeight - 24 : video.offsetWidth - 12)
        : ((vertical ? window.innerHeight : window.innerWidth) || needed) - 16;
      if (dock.panel) {
        dock.panel.classList.remove('anchor-top', 'anchor-bottom', 'anchor-left', 'anchor-right');
        dock.panel.classList.add('anchor-' + (placeAnchor === 'top' || placeAnchor === 'left' || placeAnchor === 'right' ? placeAnchor : 'bottom'));
      }
      if (dock.full) {
        dock.full.classList.toggle('vertical', vertical);
        dock.full.classList.toggle('left', placeAnchor === 'left');
        dock.full.classList.toggle('right', placeAnchor === 'right');
      }
      var available = Math.max(room, 40);
      var fit = vertical && available < needed ? Math.max(0.55, available / needed) : 1;
      var scale = Math.round(fit * snapScale(settings.dockScale) * 100) / 100;
      dock.panel.style.setProperty('--fv-opacity', String(settings.dockOpacity));
      dock.panel.style.setProperty('--fv-scale', String(scale));
      var inPlayer = !!(video && settings.dockPlace === 'player' && !settingsHold);
      var boxW = inPlayer ? video.getBoundingClientRect().width : (window.innerWidth || 320);
      var limit = Math.max(96, Math.floor(boxW - (vertical ? 0 : 8)));
      dock.panel.style.setProperty('--fv-room', limit + 'px');
      var boxH = inPlayer ? video.getBoundingClientRect().height : (window.innerHeight || 640);
      var barMain = Math.ceil(52 * scale);
      var sheetH = vertical
        ? Math.max(120, Math.floor(boxH - 16))
        : Math.max(120, Math.floor(boxH - barMain - 28));
      var sheetW = Math.max(160, Math.min(320, Math.floor((vertical ? boxW - barMain - 24 : boxW - 16))));
      dock.panel.style.setProperty('--fv-sheet-h', sheetH + 'px');
      dock.panel.style.setProperty('--fv-sheet-w', sheetW + 'px');
      var presets = dock.shadow.querySelectorAll('[data-rate]');
      for (var i = 0; i < presets.length; i++) presets[i].hidden = settings.showPresets === false;
      if (dock.rate) dock.rate.hidden = settings.showPresets !== false;
    }

    function updateDockRate(rate) {
      if (!dock) return;
      var text = formatRate(rate) + '×';
      dock.rate.textContent = text;
      dock.chip.textContent = text;
      var presets = dock.shadow.querySelectorAll('[data-rate]');
      var current = formatRate(rate);
      for (var i = 0; i < presets.length; i++) {
        presets[i].classList.toggle('on', formatRate(presets[i].dataset.rate) === current);
      }
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
      if (dock.place) dock.place.checked = settings.dockPlace === 'player';
      var anchors = dock.shadow.querySelectorAll('[data-anchor]');
      for (var a = 0; a < anchors.length; a++) {
        anchors[a].classList.toggle('on', anchors[a].dataset.anchor === settings.dockAnchor);
      }
      if (dock.presets) dock.presets.checked = settings.showPresets !== false;
      if (dock.fade && dock.shadow.activeElement !== dock.fade) {
        dock.fade.value = String(Math.round((1 - settings.dockOpacity) * 100));
      }
      if (dock.fadeOut) dock.fadeOut.textContent = Math.round((1 - settings.dockOpacity) * 100) + '%';
      if (dock.hudFade && dock.shadow.activeElement !== dock.hudFade) {
        dock.hudFade.value = String(Math.round((1 - settings.hudOpacity) * 100));
      }
      if (dock.hudFadeOut) dock.hudFadeOut.textContent = Math.round((1 - settings.hudOpacity) * 100) + '%';
      if (dock.scale && dock.shadow.activeElement !== dock.scale) {
        dock.scale.value = String(Math.round(settings.dockScale * 100));
      }
      if (dock.scaleOut) dock.scaleOut.textContent = Math.round(settings.dockScale * 100) + '%';
    }

    function dockFadeMs() {
      try {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
      } catch (err) {}
      return 250;
    }

    function revealDock() {
      if (!dock) return;
      var host = dock.host;
      var ms = dockFadeMs();
      var appearing = !dockVisible;
      dockVisible = true;
      if (dockFadeTimer) {
        clearTimeout(dockFadeTimer);
        dockFadeTimer = 0;
      }
      important(host, 'transition', 'opacity ' + (ms / 1000) + 's ease');
      important(host, 'display', 'block');
      if (!appearing) {
        important(host, 'opacity', '1');
        return;
      }
      if (host.style.opacity !== '0') important(host, 'opacity', '0');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (!dock || !dockVisible) return;
          important(dock.host, 'opacity', '1');
        });
      });
    }

    function concealDock() {
      if (!dock) return;
      if (!dockVisible) {
        if (dockFadeTimer) return;
        important(dock.host, 'opacity', '0');
        important(dock.host, 'display', 'none');
        return;
      }
      dockVisible = false;
      var ms = dockFadeMs();
      important(dock.host, 'transition', 'opacity ' + (ms / 1000) + 's ease');
      important(dock.host, 'opacity', '0');
      important(dock.host, 'pointer-events', 'none');
      if (dockFadeTimer) clearTimeout(dockFadeTimer);
      dockFadeTimer = setTimeout(function () {
        dockFadeTimer = 0;
        if (!dock || dockVisible) return;
        important(dock.host, 'display', 'none');
      }, ms);
    }

    function refreshDock() {
      if (dock && !dock.host.isConnected) dock = null;
      var mode = dockMode();
      if (mode === 'hidden') {
        concealDock();
        renderPlaylist();
        return;
      }
      if (!dock) dock = createDock();
      revealDock();
      dock.full.hidden = mode !== 'full';
      dock.chip.hidden = mode !== 'chip';
      var primary = primaryVideo();
      updateDockRate(primary ? primary.playbackRate : settings.preferredRate);
      updateSheet();
      applyDockLook();
      placeDock();
      syncEnqueueButton();
      renderPlaylist();
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

    function timingFrom(duration, live) {
      var timing = readMediaTiming(duration);
      if (live && timing.duration == null) return { duration: null, live: true };
      return timing;
    }

    function isVideoElement(node) {
      return !!(node && node.tagName && String(node.tagName).toLowerCase() === 'video');
    }

    function videoLooksLikeAd(video) {
      try {
        if (document.querySelector('.ad-showing, .ytp-ad-skip-button, .ytp-ad-skip-button-modern')) return true;
      } catch (err) {}
      var node = video;
      for (var i = 0; i < 8 && node; i++) {
        var cls = '';
        try { cls = String(node.className || ''); } catch (err2) { cls = ''; }
        if (/(?:^|\s)ad-showing(?:\s|$)/.test(cls)) return true;
        if (node.parentElement) node = node.parentElement;
        else {
          var root = node.getRootNode && node.getRootNode();
          if (root && root.host) node = root.host;
          else break;
        }
      }
      return false;
    }

    function postUp(kind, extra) {
      var packet = { source: MSG, kind: kind, id: uid() };
      if (extra) {
        for (var key in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, key)) packet[key] = extra[key];
        }
      }
      try { window.parent.postMessage(packet, '*'); } catch (err) {}
    }

    function playlistVisible() {
      if (isFramed() || !playlist.items.length) return false;
      if (hasWork()) return true;
      var here = '';
      try { here = pageIdentity(location.href); } catch (err) { return false; }
      for (var i = 0; i < playlist.items.length; i++) {
        if (pageIdentity(playlist.items[i].url) === here) return true;
      }
      return false;
    }

    function playlistNote() {
      var here = '';
      try { here = pageIdentity(location.href); } catch (err) {}
      for (var i = 0; i < playlist.items.length; i++) {
        if (!here || pageIdentity(playlist.items[i].url) !== here) continue;
        if (playlist.items[i].live) return 'У эфира нет конца, следующий сам не откроется.';
        if (playlist.items[i].duration == null) return 'Длительность ещё неизвестна, следующий сам не откроется.';
        break;
      }
      return 'По окончании ролика с известной длительностью откроется и запустится следующий.';
    }

    function playlistSignature() {
      var parts = [playlist.currentId, playlist.open ? '1' : '0'];
      for (var i = 0; i < playlist.items.length; i++) {
        var item = playlist.items[i];
        parts.push(item.id, item.title, item.duration == null ? '' : String(item.duration), item.live ? '1' : '0', item.poster ? item.poster.slice(0, 48) : '');
      }
      return parts.join('\n');
    }

    function mutatePlaylist(fn, done) {
      playlistQueue.push({ fn: fn, done: done });
      runPlaylistQueue();
    }

    function runPlaylistQueue() {
      if (playlistQueueRunning) return;
      var job = playlistQueue.shift();
      if (!job) return;
      playlistQueueRunning = true;
      var store = options.playlistStore;

      function finish(next) {
        playlist = next;
        playlistQueueRunning = false;
        renderPlaylist();
        resumePlayback();
        try { if (typeof job.done === 'function') job.done(next); } catch (err) {}
        runPlaylistQueue();
      }

      if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
        try {
          finish(normalizePlaylist(job.fn(normalizePlaylist(playlist))));
        } catch (err) {
          playlistQueueRunning = false;
          runPlaylistQueue();
        }
        return;
      }

      playlistSaving += 1;
      try {
        store.load(function (raw) {
          var base = normalizePlaylist(raw);
          var before = JSON.stringify(base);
          var next;
          try { next = normalizePlaylist(job.fn(base)); }
          catch (err) {
            playlistSaving -= 1;
            playlistQueueRunning = false;
            runPlaylistQueue();
            return;
          }
          if (JSON.stringify(next) === before) {
            playlistSaving -= 1;
            finish(next);
            return;
          }
          try {
            store.save(next, function () {
              playlistSaving -= 1;
              finish(next);
            });
          } catch (err2) {
            playlistSaving -= 1;
            finish(playlist);
          }
        });
      } catch (err3) {
        playlistSaving -= 1;
        playlistQueueRunning = false;
        runPlaylistQueue();
      }
    }

    function absoluteImage(value) {
      if (!value) return '';
      var raw = String(value).trim();
      var matched = raw.match(/url\((['"]?)(.*?)\1\)/i);
      if (matched) raw = matched[2];
      if (raw.indexOf('//') === 0) raw = 'https:' + raw;
      if (raw.indexOf('/') === 0) {
        try { raw = new URL(raw, location.href).href; } catch (err) { return ''; }
      }
      return sanitizePoster(raw);
    }

    function elementPoster(video) {
      var fromVideo = absoluteImage(video && video.poster);
      if (fromVideo) return fromVideo;
      var root = video ? playerShell(video) : null;
      if (!root || !root.querySelectorAll) return '';
      var imgs;
      try { imgs = root.querySelectorAll('img'); } catch (err) { imgs = []; }
      var best = '';
      var bestArea = 0;
      for (var i = 0; i < imgs.length; i++) {
        var src = absoluteImage(imgs[i].currentSrc || imgs[i].getAttribute('src'));
        if (!src || /avatar|emoji|icon|sprite|logo/i.test(src)) continue;
        var area = (imgs[i].naturalWidth || imgs[i].offsetWidth || 0) * (imgs[i].naturalHeight || imgs[i].offsetHeight || 0);
        if (area < 80 * 45 || area <= bestArea) continue;
        bestArea = area;
        best = src;
      }
      if (best) return best;
      var styled;
      try { styled = root.querySelectorAll('[class*="thumb"], [class*="poster"], [class*="preview"], [class*="cover"]'); } catch (err2) { styled = []; }
      for (var j = 0; j < styled.length && j < 24; j++) {
        var bg = '';
        try { bg = getComputedStyle(styled[j]).backgroundImage; } catch (err3) { bg = ''; }
        var image = absoluteImage(bg);
        if (image) return image;
      }
      return '';
    }

    function framePoster(video) {
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return '';
      var height = 90;
      var width = Math.max(80, Math.round(height * video.videoWidth / video.videoHeight));
      if (width > 160) {
        width = 160;
        height = Math.max(48, Math.round(width * video.videoHeight / video.videoWidth));
      }
      try {
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext('2d');
        if (!ctx) return '';
        ctx.drawImage(video, 0, 0, width, height);
        var url = canvas.toDataURL('image/jpeg', 0.7);
        return url && url.indexOf('data:image/jpeg') === 0 && url.length <= 48000 ? url : '';
      } catch (err) {
        return '';
      }
    }

    function metaPoster() {
      try {
        var node = document.querySelector('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="og:image"], link[rel="image_src"]');
        var content = node && (node.getAttribute('content') || node.getAttribute('href'));
        return absoluteImage(content);
      } catch (err) {}
      return '';
    }

    function capturePoster(video) {
      var known = '';
      try { known = knownPoster(location.href); } catch (err) {}
      if (known) return known;
      return elementPoster(video) || metaPoster() || framePoster(video);
    }

    function addCurrentPage(timing, quiet, poster) {
      timing = timing || { duration: null, live: false };
      var url = '';
      try { url = String(location.href || ''); } catch (err) { return; }
      if (!/^https?:\/\//i.test(url)) return;
      var title = '';
      try { title = document.title; } catch (err2) {}
      var shot = capturePoster(primaryVideo());
      if (!shot && typeof poster === 'string') shot = poster;
      var item = {
        id: uid(),
        url: url,
        title: title || url,
        duration: timing.duration,
        live: !!timing.live && timing.duration == null,
        added: Date.now(),
        poster: shot
      };
      mutatePlaylist(function (list) {
        list.items.push(item);
        if (!list.currentId) list.currentId = item.id;
        list.open = true;
        return list;
      });
      if (!quiet) {
        var video = primaryVideo();
        if (video) showHud(video, 'в плейлист');
      }
    }

    function requestEnqueue() {
      enqueuedHere = true;
      var video = primaryVideo();
      var timing = video && !videoLooksLikeAd(video) ? readMediaTiming(video.duration) : { duration: null, live: false };
      var poster = '';
      try { poster = capturePoster(video); } catch (err) {}
      if (isFramed()) {
        if (video) showHud(video, 'в плейлист');
        postUp('playlist-add', { duration: timing.duration, live: timing.live, poster: poster });
        return;
      }
      addCurrentPage(timing, false);
    }

    function removePlaylistItem(id) {
      mutatePlaylist(function (list) {
        var idx = -1;
        for (var i = 0; i < list.items.length; i++) {
          if (list.items[i].id === id) idx = i;
        }
        if (idx < 0) return list;
        var removedCurrent = list.items[idx].id === list.currentId;
        list.items.splice(idx, 1);
        if (removedCurrent) {
          var neighbor = list.items[idx] || list.items[idx - 1] || null;
          list.currentId = neighbor ? neighbor.id : '';
        }
        return list;
      });
    }

    function reorderPlaylist(ids) {
      mutatePlaylist(function (list) {
        list.items = reorderItems(list.items, ids);
        return list;
      });
    }

    function writeClipboard(text, done) {
      try {
        if (typeof GM_setClipboard === 'function') {
          GM_setClipboard(text, 'text');
          done(true);
          return;
        }
      } catch (err) {}
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      var parent = document.documentElement || document.body;
      if (!parent) {
        done(false);
        return;
      }
      parent.appendChild(area);
      area.focus();
      area.select();
      var copied = false;
      try { copied = document.execCommand('copy'); } catch (err2) { copied = false; }
      if (area.parentNode) area.parentNode.removeChild(area);
      if (copied) {
        done(true);
        return;
      }
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        return;
      }
      done(false);
    }

    function copyPlaylistLinks(button) {
      var text = playlistClipboard(playlist);
      if (!text) return;
      writeClipboard(text, function (ok) {
        if (!button) return;
        copyStamp += 1;
        var stamp = copyStamp;
        button.textContent = ok ? 'Скопировано' : 'Не вышло';
        setTimeout(function () {
          if (stamp !== copyStamp || !button.isConnected) return;
          button.textContent = 'В Mimir';
        }, 1600);
      });
    }

    function clearPlaylist() {
      mutatePlaylist(function (list) {
        list.items = [];
        list.currentId = '';
        return list;
      });
    }

    function playbackUrl(url) {
      try {
        var parsed = new URL(url);
        var host = hostKey(parsed.hostname);
        var youtube = host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be' ||
          host.endsWith('.youtube.com') || host.endsWith('.youtube-nocookie.com');
        var rutube = host === 'rutube.ru' || host.endsWith('.rutube.ru');
        if ((youtube || rutube) && !parsed.searchParams.get('autoplay')) parsed.searchParams.set('autoplay', '1');
        return parsed.href;
      } catch (err) {
        return url;
      }
    }

    function isMainVideo(video) {
      return !!(video && (video.offsetWidth >= 160 || video.offsetHeight >= 120));
    }

    function readPlayIntent() {
      try {
        var data = JSON.parse(sessionStorage.getItem('fast-video-play') || 'null');
        if (!data || typeof data.id !== 'string' || typeof data.url !== 'string') return null;
        if (!isFinite(Number(data.at)) || Date.now() - Number(data.at) > 120000) return null;
        return data;
      } catch (err) { return null; }
    }

    function clearPlayIntent() {
      try { sessionStorage.removeItem('fast-video-play'); } catch (err) {}
    }

    function hereIdentity() {
      try { return pageIdentity(location.href); } catch (err) { return ''; }
    }

    function intentMatchesPage() {
      var intent = readPlayIntent();
      var here = hereIdentity();
      if (!intent || !here) return null;
      try {
        if (pageIdentity(intent.url) !== here) return null;
      } catch (err) { return null; }
      return intent;
    }

    function wantsPlayback() {
      if (isFramed()) return false;
      if (intentMatchesPage()) return true;
      if (!playlist.playId || playlist.playId !== playlist.currentId) return false;
      var playAt = Number(playlist.playAt) || 0;
      if (!playAt || Date.now() - playAt > 120000) return false;
      var current = null;
      for (var i = 0; i < playlist.items.length; i++) {
        if (playlist.items[i].id === playlist.playId) current = playlist.items[i];
      }
      if (!current) return false;
      try { return pageIdentity(current.url) === hereIdentity(); } catch (err) { return false; }
    }

    function navigateTo(url) {
      var href = String(url || '');
      if (!href) return;
      try {
        if (typeof nativeAssign === 'function') {
          nativeAssign.call(location, href);
          return;
        }
      } catch (err) {}
      try { location.href = href; } catch (err2) {}
    }

    function reloadPage() {
      try {
        if (typeof nativeReload === 'function') {
          nativeReload.call(location);
          return;
        }
      } catch (err) {}
      try { location.reload(); } catch (err2) {}
    }

    function stopResume() {
      if (!resumeTimer) return;
      clearTimeout(resumeTimer);
      resumeTimer = 0;
    }

    function notePlaybackStarted() {
      if (playbackAck || (!playlist.playId && !readPlayIntent())) return;
      playbackAck = true;
      stopResume();
      clearPlayIntent();
      var token = playlist.playId;
      if (!token) return;
      mutatePlaylist(function (list) {
        if (list.playId !== token) return list;
        list.playId = '';
        list.playAt = 0;
        return list;
      });
    }

    function reportPlaybackStarted() {
      if (isFramed()) {
        if (!askedToPlay || playbackAck) return;
        playbackAck = true;
        postUp('playlist-started', {});
        return;
      }
      notePlaybackStarted();
    }

    function watchPlayback(video) {
      var mark = video.currentTime || 0;
      setTimeout(function () {
        if (!video || video.paused || video.ended) return;
        if ((video.currentTime || 0) < mark + 0.15) return;
        if (!wantsPlayback() && !askedToPlay) return;
        reportPlaybackStarted();
      }, 800);
    }

    function userActivated() {
      try { return !!(navigator.userActivation && navigator.userActivation.isActive); } catch (err) { return false; }
    }

    function armUnmute(video) {
      if (!video || video.dataset.fvUnmuteArmed === '1') return;
      video.dataset.fvUnmuteArmed = '1';
      function unmute() {
        document.removeEventListener('pointerdown', unmute, true);
        if (video.dataset.fvMutedForPlay !== '1') return;
        video.muted = false;
        video.dataset.fvMutedForPlay = '';
      }
      document.addEventListener('pointerdown', unmute, true);
    }

    var playClickAt = 0;

    function clickPlayButtons(root) {
      if (!root || Date.now() - playClickAt < 1500) return;
      var selector = [
        '.ytp-large-play-button',
        'button.vjs-big-play-button',
        '.plyr__control--overlaid',
        '.vp-overlay-play',
        'media-play-button',
        '[aria-label*="Воспроиз"]',
        '[aria-label*="воспроиз"]',
        '[title*="Воспроиз"]',
        '[aria-label="Play"]',
        '[aria-label="play"]',
        '[data-testid*="play"]'
      ].join(', ');
      var nodes;
      try { nodes = root.querySelectorAll(selector); } catch (err) { nodes = []; }
      for (var i = 0; i < nodes.length; i++) {
        var rect;
        try { rect = nodes[i].getBoundingClientRect(); } catch (err2) { continue; }
        if (rect.width < 8 || rect.height < 8) continue;
        try { nodes[i].click(); } catch (err3) { continue; }
        playClickAt = Date.now();
        break;
      }
      if (playClickAt && Date.now() - playClickAt < 1500) return;
      var all;
      try { all = root.querySelectorAll('*'); } catch (err4) { return; }
      for (var j = 0; j < all.length; j++) {
        if (all[j].shadowRoot) clickPlayButtons(all[j].shadowRoot);
      }
    }

    function startVideo(video) {
      if (!video) return;
      try { video.playsInline = true; } catch (err) {}
      try { video.setAttribute('playsinline', ''); } catch (err2) {}
      try { video.autoplay = true; } catch (err3) {}
      if (!video.paused && !video.ended) {
        watchPlayback(video);
        return;
      }
      if (video.ended) {
        try { video.currentTime = 0; } catch (err4) {}
      }
      if (!userActivated()) {
        try {
          video.muted = true;
          video.dataset.fvMutedForPlay = '1';
          armUnmute(video);
        } catch (errMute) {}
      }
      var pending;
      try { pending = video.play(); } catch (err5) { pending = null; }
      if (pending && pending.catch) {
        pending.catch(function (err) {
          if (!err || err.name !== 'NotAllowedError' || video.dataset.fvMutedForPlay === '1') return;
          video.muted = true;
          video.dataset.fvMutedForPlay = '1';
          armUnmute(video);
          try { video.play(); } catch (err6) {}
        });
      }
    }

    function nudgePlayers() {
      var frames;
      try { frames = document.querySelectorAll('iframe'); } catch (err) { return; }
      var packet = JSON.stringify({ type: 'player:play', data: {} });
      for (var i = 0; i < frames.length; i++) {
        var src = '';
        try { src = String(frames[i].src || frames[i].getAttribute('src') || ''); } catch (err2) { src = ''; }
        if (!/rutube|vk\.com|vkvideo/i.test(src)) continue;
        try { frames[i].contentWindow.postMessage(packet, '*'); } catch (err3) {}
        try { frames[i].contentWindow.postMessage({ type: 'player:play', data: {} }, '*'); } catch (err4) {}
      }
    }

    function attemptLocalPlay() {
      askedToPlay = true;
      var video = primaryVideo();
      if (video && isMainVideo(video)) {
        startVideo(video);
        clickPlayButtons(playerShell(video));
      } else clickPlayButtons(document);
      nudgePlayers();
    }

    function attemptPlayback() {
      if (!wantsPlayback()) {
        stopResume();
        return;
      }
      if (Date.now() > resumeUntil) {
        stopResume();
        return;
      }
      var video = primaryVideo();
      if (video && isMainVideo(video)) {
        startVideo(video);
        clickPlayButtons(playerShell(video));
      } else clickPlayButtons(document);
      nudgePlayers();
      postToChildren({ source: MSG, kind: 'playlist-play', id: uid() });
      resumeTimer = setTimeout(attemptPlayback, 400);
    }

    function resumePlayback() {
      if (resumeStarted || !wantsPlayback()) return;
      resumeStarted = true;
      resumeUntil = Date.now() + 20000;
      attemptPlayback();
    }

    function openPlaylistItem(item, andGo) {
      if (!item) return;
      var same = false;
      try { same = pageIdentity(item.url) === pageIdentity(location.href); } catch (err) {}
      if (andGo) {
        resumeStarted = false;
        playbackAck = false;
        stopResume();
        var stamp = Date.now();
        playlist.currentId = item.id;
        playlist.playId = item.id;
        playlist.playAt = stamp;
        try {
          sessionStorage.setItem('fast-video-play', JSON.stringify({ id: item.id, url: item.url, at: stamp }));
        } catch (err2) {}
      }
      mutatePlaylist(function (list) {
        list.currentId = item.id;
        if (andGo) {
          list.playId = item.id;
          list.playAt = playlist.playAt || Date.now();
        }
        return list;
      }, function () {
        if (!andGo) return;
        var stillSame = false;
        try { stillSame = pageIdentity(item.url) === pageIdentity(location.href); } catch (err3) { return; }
        if (!stillSame) {
          navigateTo(playbackUrl(item.url));
          return;
        }
        if (advancing) {
          reloadPage();
          return;
        }
        resumePlayback();
      });
      if (!andGo) return;
      if (!same) navigateTo(playbackUrl(item.url));
      else if (advancing) reloadPage();
      else resumePlayback();
    }

    function syncPlayIntent() {
      if (isFramed()) return;
      var intent = intentMatchesPage();
      if (!intent) return;
      var aligned = playlist.currentId === intent.id && playlist.playId === intent.id;
      if (aligned) {
        resumePlayback();
        return;
      }
      var exists = false;
      for (var i = 0; i < playlist.items.length; i++) {
        if (playlist.items[i].id === intent.id) exists = true;
      }
      if (!exists) return;
      mutatePlaylist(function (list) {
        var ok = false;
        for (var n = 0; n < list.items.length; n++) {
          if (list.items[n].id === intent.id) ok = true;
        }
        if (!ok) return list;
        list.currentId = intent.id;
        list.playId = intent.id;
        list.playAt = Number(intent.at) || Date.now();
        return list;
      });
    }

    function handleEnded(timing, ad, played) {
      if (isFramed() || ad || advancing || !played) return;
      var seen = timing && timing.live ? Infinity : (timing ? timing.duration : null);
      var current = null;
      for (var i = 0; i < playlist.items.length; i++) {
        if (playlist.items[i].id === playlist.currentId) current = playlist.items[i];
      }
      if (!current || !durationsMatch(seen, current.live ? Infinity : current.duration)) return;
      var here = '';
      try { here = location.href; } catch (err) { return; }
      var next = playlistNext(playlist, here);
      if (!next) return;
      advancing = true;
      setTimeout(function () { advancing = false; }, 4000);
      openPlaylistItem(next, true);
    }

    function noteTiming(timing) {
      if (isFramed() || !timing) return;
      var idn = '';
      try { idn = pageIdentity(location.href); } catch (err) { return; }
      if (!idn) return;
      var changed = false;
      for (var i = 0; i < playlist.items.length; i++) {
        var row = playlist.items[i];
        if (pageIdentity(row.url) !== idn) continue;
        if (timing.live) {
          if (row.duration == null && !row.live) changed = true;
        } else if (timing.duration != null && (row.live || row.duration == null || timing.duration > row.duration + 1)) {
          changed = true;
        }
      }
      if (!changed) return;
      mutatePlaylist(function (list) {
        for (var n = 0; n < list.items.length; n++) {
          var item = list.items[n];
          if (pageIdentity(item.url) !== idn) continue;
          if (timing.live) {
            if (item.duration == null) item.live = true;
          } else if (timing.duration != null && (item.live || item.duration == null || timing.duration > item.duration + 1)) {
            item.duration = timing.duration;
            item.live = false;
          }
        }
        return list;
      });
    }

    function fillMissingPoster() {
      if (isFramed()) return;
      var idn = '';
      try { idn = pageIdentity(location.href); } catch (err) { return; }
      if (!idn || posterCheckedFor === idn) return;
      var missing = false;
      for (var i = 0; i < playlist.items.length; i++) {
        var row = playlist.items[i];
        if (pageIdentity(row.url) === idn && !row.poster && !knownPoster(row.url)) missing = true;
      }
      if (!missing) {
        posterCheckedFor = idn;
        return;
      }
      var shot = capturePoster(primaryVideo());
      if (!shot) return;
      posterCheckedFor = idn;
      mutatePlaylist(function (list) {
        for (var n = 0; n < list.items.length; n++) {
          if (pageIdentity(list.items[n].url) === idn && !list.items[n].poster) list.items[n].poster = shot;
        }
        return list;
      });
    }

    function onEnded(event) {
      var video = event.target;
      if (!isVideoElement(video)) return;
      var primary = primaryVideo();
      var primaryTiming = primary ? readMediaTiming(primary.duration) : null;
      var endedTiming = readMediaTiming(video.duration);
      if (primary && primary !== video && !primary.ended && primaryTiming && primaryTiming.duration && endedTiming.duration && primary.duration > video.duration + 1) return;
      var ad = videoLooksLikeAd(video);
      if (isFramed()) {
        postUp('playlist-ended', { duration: endedTiming.duration, live: endedTiming.live, ad: ad, played: playedPastStart });
        return;
      }
      handleEnded(endedTiming, ad, playedPastStart);
    }

    function onTiming(event) {
      var video = event.target;
      if (!isVideoElement(video) || videoLooksLikeAd(video)) return;
      var primary = primaryVideo();
      if (primary && primary !== video) return;
      var timing = readMediaTiming(video.duration);
      if (timing.duration == null && !timing.live) return;
      if (isFramed()) {
        postUp('playlist-timing', { duration: timing.duration, live: timing.live });
        return;
      }
      noteTiming(timing);
    }

    function onProgress(event) {
      var video = event.target;
      if (!isVideoElement(video) || video.paused || video.ended) return;
      if (!isFinite(video.duration) || video.duration <= 0.2) return;
      if (video.currentTime > 0.3 && video.currentTime < video.duration - 0.35) playedPastStart = true;
      if (video.currentTime > 0.25 && (wantsPlayback() || askedToPlay)) reportPlaybackStarted();
    }

    function syncEnqueueButton() {
      if (!dock || !dock.shadow) return;
      var button = dock.shadow.querySelector('[data-act="enqueue"]');
      if (!button) return;
      var here = '';
      try { here = pageIdentity(location.href); } catch (err) {}
      var on = enqueuedHere;
      if (!on && here && !isFramed()) {
        for (var i = 0; i < playlist.items.length; i++) {
          if (pageIdentity(playlist.items[i].url) === here) {
            on = true;
            break;
          }
        }
      }
      button.classList.toggle('on', !!on);
    }

    function pullPlaylist() {
      var store = options.playlistStore;
      if (isFramed() || !store || typeof store.load !== 'function' || playlistSaving || playlistQueueRunning) return;
      try {
        store.load(function (raw) {
          if (playlistSaving || playlistQueueRunning) return;
          applyPlaylist(raw);
        });
      } catch (err) {}
    }

    function applyPlaylist(raw) {
      if (isFramed() || playlistSaving || playlistQueueRunning) return;
      var next = normalizePlaylist(raw);
      if (JSON.stringify(next) === JSON.stringify(playlist)) return;
      playlist = next;
      renderPlaylist();
      syncPlayIntent();
      resumePlayback();
    }

    function fillPlaylist(body) {
      body.textContent = '';
      for (var i = 0; i < playlist.items.length; i++) {
        var item = playlist.items[i];
        var row = document.createElement('div');
        row.className = 'item';
        row.dataset.itemId = item.id;
        if (item.id === playlist.currentId) row.classList.add('current');
        var play = document.createElement('button');
        play.type = 'button';
        play.className = 'play';
        play.dataset.id = item.id;
        play.title = item.title;
        var poster = knownPoster(item.url) || item.poster;
        var shot = document.createElement('span');
        shot.className = 'shot';
        var thumb = document.createElement(poster ? 'img' : 'span');
        thumb.className = 'thumb';
        if (poster) {
          thumb.alt = '';
          thumb.draggable = false;
          thumb.addEventListener('error', function () {
            var blank = document.createElement('span');
            blank.className = 'thumb';
            if (thumb.parentNode) thumb.parentNode.replaceChild(blank, thumb);
          });
          thumb.src = poster;
        }
        var index = document.createElement('span');
        index.className = 'index';
        index.textContent = String(i + 1);
        shot.appendChild(thumb);
        shot.appendChild(index);
        var text = document.createElement('span');
        text.className = 'text';
        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = item.title;
        var time = document.createElement('span');
        time.className = 'time';
        if (item.live) time.textContent = 'эфир';
        else if (item.duration == null) time.textContent = '…';
        else time.textContent = formatDuration(item.duration);
        text.appendChild(name);
        text.appendChild(time);
        play.appendChild(shot);
        play.appendChild(text);
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'remove';
        remove.dataset.remove = item.id;
        remove.setAttribute('aria-label', 'Убрать из плейлиста');
        remove.title = 'Убрать';
        remove.textContent = '×';
        var handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'handle';
        handle.title = 'Перетащить';
        handle.setAttribute('aria-label', 'Перетащить');
        handle.innerHTML = '<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><circle cx="2" cy="2" r="1.2" fill="currentColor"/><circle cx="8" cy="2" r="1.2" fill="currentColor"/><circle cx="2" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="2" cy="14" r="1.2" fill="currentColor"/><circle cx="8" cy="14" r="1.2" fill="currentColor"/></svg>';
        row.appendChild(handle);
        row.appendChild(play);
        row.appendChild(remove);
        body.appendChild(row);
      }
    }

    function createPlaylistHost(root) {
      var host = document.createElement('fast-video-list');
      important(host, 'position', 'fixed');
      important(host, 'top', 'calc(10px + env(safe-area-inset-top))');
      important(host, 'right', 'calc(10px + env(safe-area-inset-right))');
      important(host, 'left', 'auto');
      important(host, 'bottom', 'auto');
      important(host, 'z-index', '2147483646');
      important(host, 'display', 'block');
      important(host, 'width', 'max-content');
      important(host, 'max-width', 'calc(100vw - 16px)');
      important(host, 'margin', '0');
      important(host, 'padding', '0');
      important(host, 'border', '0');
      important(host, 'background', 'transparent');
      important(host, 'pointer-events', 'auto');
      var shadow = host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = [
        '<style>',
        '.wrap{box-sizing:border-box;width:min(320px, calc(100vw - 20px));max-height:min(70vh, 520px);display:flex;flex-direction:column;padding:10px;border-radius:16px;background:rgba(18,18,18,.94);box-shadow:0 8px 28px rgba(0,0,0,.35);color:#fff;font-family:system-ui,-apple-system,sans-serif}',
        '.wrap.collapsed{width:max-content}',
        '.head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
        '.wrap.collapsed .body,.wrap.collapsed .note,.wrap.collapsed .clear{display:none}',
        '.toggle{display:flex;align-items:center;gap:6px;height:32px;padding:0 2px;font-weight:700}',
        '.count{color:#f0b429;font-variant-numeric:tabular-nums}',
        '.clear,.copy{height:28px;padding:0 8px;border-radius:8px;background:rgba(255,255,255,.08);font-size:12px;white-space:nowrap}',
        '.copy{color:#f0b429}',
        '.body{display:flex;flex-direction:column;gap:4px;margin-top:6px;overflow:auto;min-height:0;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}',
        '.item{display:flex;align-items:center;gap:2px;user-select:none}',
        '.item.dragging{opacity:.45}',
        '.handle{flex:none;width:28px;height:48px;padding:0;border-radius:8px;color:rgba(255,255,255,.55);cursor:grab;touch-action:none;display:flex;align-items:center;justify-content:center}',
        '.handle:active,.item.dragging .handle{cursor:grabbing}',
        '.play{flex:1;display:flex;align-items:center;gap:8px;min-width:0;min-height:48px;padding:4px 8px;border-radius:8px;text-align:left;cursor:pointer}',
        '.item.current .play{background:rgba(240,180,41,.2)}',
        '.shot{position:relative;flex:none;width:72px;height:40px}',
        '.thumb{display:block;width:72px;height:40px;border-radius:6px;object-fit:cover;background:#2c2c2c}',
        '.index{position:absolute;left:3px;bottom:3px;min-width:14px;padding:0 3px;border-radius:4px;background:rgba(0,0,0,.72);color:#fff;font-size:10px;line-height:14px;text-align:center}',
        '.text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
        '.name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600}',
        '.time{flex:none;color:rgba(255,255,255,.65);font-size:12px;font-variant-numeric:tabular-nums}',
        '.item.current .time{color:#f0b429}',
        '.remove{flex:none;width:44px;height:44px;border-radius:8px;color:rgba(255,255,255,.72);font-size:18px}',
        '.note{margin:8px 2px 0;color:rgba(255,255,255,.62);font-size:11px;line-height:1.35}',
        'button{appearance:none;border:0;background:transparent;color:#fff;font:600 13px/1.2 system-ui,-apple-system,sans-serif;touch-action:manipulation}',
        '.handle{touch-action:none}',
        '@media (hover:hover){.handle:hover,.play:hover,.remove:hover,.clear:hover,.copy:hover{background:rgba(255,255,255,.1)}}',
        '</style>',
        '<div class="wrap" id="wrap">',
        '<div class="head">',
        '<button type="button" class="toggle" data-toggle="1" aria-label="Плейлист"><span id="chev">▾</span><span>Плейлист</span><b class="count" id="count"></b></button>',
        '<button type="button" class="copy" data-copy="1" title="Скопировать ссылки. В Mimir нажмите «Из буфера»">В Mimir</button>',
        '<button type="button" class="clear" data-clear="1">Очистить</button>',
        '</div>',
        '<div class="body" id="body"></div>',
        '<p class="note" id="note"></p>',
        '</div>'
      ].join('');
      shadow.addEventListener('pointerdown', function (event) {
        event.stopPropagation();
        if (event.button != null && event.button !== 0) return;
        var handle = event.target.closest ? event.target.closest('.handle') : null;
        var row = handle && handle.closest ? handle.closest('.item') : null;
        if (!row) return;
        listDrag = { pointer: event.pointerId, y: event.clientY, moved: false, row: row };
      });
      shadow.addEventListener('pointermove', function (event) {
        if (!listDrag || listDrag.pointer !== event.pointerId || !playlistUi) return;
        if (!listDrag.moved && Math.abs(event.clientY - listDrag.y) < 6) return;
        if (!listDrag.moved) {
          try { listDrag.row.setPointerCapture(listDrag.pointer); } catch (err) {}
        }
        listDrag.moved = true;
        listDrag.row.classList.add('dragging');
        event.preventDefault();
        var rows = playlistUi.body.querySelectorAll('.item');
        var before = null;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] === listDrag.row) continue;
          var box = rows[i].getBoundingClientRect();
          if (event.clientY < box.top + box.height / 2) {
            before = rows[i];
            break;
          }
        }
        if (before) playlistUi.body.insertBefore(listDrag.row, before);
        else playlistUi.body.appendChild(listDrag.row);
        var badges = playlistUi.body.querySelectorAll('.index');
        for (var n = 0; n < badges.length; n++) badges[n].textContent = String(n + 1);
      }, { passive: false });
      function finishListDrag(event) {
        if (!listDrag || listDrag.pointer !== event.pointerId) return;
        var moved = listDrag.moved;
        listDrag.row.classList.remove('dragging');
        var ids = [];
        if (playlistUi && playlistUi.body) {
          var rows = playlistUi.body.querySelectorAll('.item');
          for (var i = 0; i < rows.length; i++) ids.push(rows[i].dataset.itemId);
        }
        listDrag = null;
        if (!moved) return;
        suppressPlaylistClick = true;
        reorderPlaylist(ids);
      }
      shadow.addEventListener('pointerup', finishListDrag);
      shadow.addEventListener('pointercancel', finishListDrag);
      window.addEventListener('pointerup', finishListDrag, true);
      window.addEventListener('pointercancel', finishListDrag, true);
      shadow.addEventListener('click', function (event) {
        if (suppressPlaylistClick) {
          suppressPlaylistClick = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        var button = event.target.closest ? event.target.closest('button') : null;
        var row = event.target.closest ? event.target.closest('.item') : null;
        if (!button && !row) return;
        event.preventDefault();
        event.stopPropagation();
        if (button && button.hasAttribute('data-toggle')) {
          var open = playlist.open === false;
          mutatePlaylist(function (list) {
            list.open = open;
            return list;
          });
          return;
        }
        if (button && button.hasAttribute('data-copy')) {
          copyPlaylistLinks(button);
          return;
        }
        if (button && button.hasAttribute('data-clear')) {
          clearPlaylist();
          return;
        }
        if (button && button.dataset.remove) {
          removePlaylistItem(button.dataset.remove);
          return;
        }
        if (button && button.classList.contains('handle')) return;
        var pickedId = row && row.dataset.itemId;
        if (!pickedId && button) pickedId = button.dataset.id;
        if (!pickedId) return;
        var picked = null;
        for (var i = 0; i < playlist.items.length; i++) {
          if (playlist.items[i].id === pickedId) picked = playlist.items[i];
        }
        openPlaylistItem(picked, true);
      });
      shadow.addEventListener('wheel', function (event) { event.stopPropagation(); }, { passive: true });
      shadow.addEventListener('touchmove', function (event) { event.stopPropagation(); }, { passive: true });
      root.appendChild(host);
      return {
        host: host,
        shadow: shadow,
        wrap: shadow.getElementById('wrap'),
        body: shadow.getElementById('body'),
        count: shadow.getElementById('count'),
        note: shadow.getElementById('note'),
        chevron: shadow.getElementById('chev'),
        signature: ''
      };
    }

    function renderPlaylist() {
      if (isFramed()) return;
      syncEnqueueButton();
      if (!playlistVisible()) {
        if (playlistUi && playlistUi.host.parentNode) playlistUi.host.parentNode.removeChild(playlistUi.host);
        playlistUi = null;
        return;
      }
      var root = document.documentElement || document.body;
      if (!root) return;
      if (!playlistUi || !playlistUi.host.isConnected) playlistUi = createPlaylistHost(root);
      playlistUi.wrap.classList.toggle('collapsed', playlist.open === false);
      playlistUi.count.textContent = String(playlist.items.length);
      playlistUi.chevron.textContent = playlist.open === false ? '▸' : '▾';
      playlistUi.note.textContent = playlistNote();
      var signature = playlistSignature();
      if (!listDrag && playlistUi.signature !== signature) {
        playlistUi.signature = signature;
        fillPlaylist(playlistUi.body);
      }
    }

    function createDock() {
      var host = document.createElement('fast-video-dock');
      important(host, 'display', 'block');
      important(host, 'margin', '0');
      important(host, 'padding', '0');
      important(host, 'border', '0');
      important(host, 'background', 'transparent');
      important(host, 'opacity', '0');
      important(host, 'transition', 'opacity .25s ease');
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
        '.panel{display:flex;flex-direction:column;align-items:center;font-family:system-ui,-apple-system,sans-serif;color:#fff}',
        '.panel.anchor-top .dock{order:-1}',
        '.panel.anchor-top .sheet{margin:8px 0 0}',
        '.panel.anchor-left{flex-direction:row;align-items:center}',
        '.panel.anchor-left .dock{order:-1}',
        '.panel.anchor-left .sheet{margin:0 0 0 8px}',
        '.panel.anchor-right{flex-direction:row;align-items:center}',
        '.panel.anchor-right .sheet{margin:0 8px 0 0}',
        '.dock{display:flex;align-items:flex-end;justify-content:center;height:calc(52px * var(--fv-scale, 1));pointer-events:none}',
        '.dock.vertical{height:auto;width:calc(52px * var(--fv-scale, 1));align-items:center}',
        '.dock.vertical .bar{flex-direction:column;width:100%;height:auto;max-width:none;overflow:hidden;transform:none;touch-action:manipulation}',
        '/* Вертикальная панель, кнопки 1 / 1,5 / 2 / 2,5, N× и пропуск: высота зоны нажатия */',
        '.dock.vertical .bar>button,.dock.vertical .rate{flex:0 0 auto;width:100%;min-width:0;height:calc(46px * var(--fv-scale, 1));min-height:calc(46px * var(--fv-scale, 1));padding:0 2px;font-size:calc(14px * var(--fv-scale, 1))}',
        '/* Вертикальная панель, − и +: высота круглой кнопки */',
        '.dock.vertical .bar>button.mark{height:calc(52px * var(--fv-scale, 1));min-height:calc(52px * var(--fv-scale, 1));font-size:calc(30px * var(--fv-scale, 1))}',
        '/* Общая плашка. Если шире окна, свайпается влево-вправо. --fv-room — ширина плеера или окна */',
        '.bar{display:flex;align-items:stretch;height:calc(52px * var(--fv-scale, 1));max-width:var(--fv-room, none);padding:0;border-radius:999px;background:rgba(18,18,18,var(--fv-opacity,1));box-shadow:0 8px 28px rgba(0,0,0,.35);overflow-x:auto;overflow-y:hidden;scrollbar-width:none;transform:none;pointer-events:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;touch-action:pan-x}',
        '.bar::-webkit-scrollbar{display:none;height:0}',
        '@media (hover:hover){.bar>button:hover{background:rgba(255,255,255,.12)}}',
        'button{appearance:none;border:0;background:transparent;color:#fff;font:600 16px/1 system-ui,-apple-system,sans-serif;touch-action:manipulation}',
        '/* Все кнопки панели: min-width — минимальная ширина зоны нажатия */',
        '.bar>button{display:flex;align-items:center;justify-content:center;flex:0 0 auto;min-width:calc(52px * var(--fv-scale, 1));height:100%;margin:0;padding:0 calc(8px * var(--fv-scale, 1));border-radius:999px;white-space:nowrap;color:#fff;font-size:calc(16px * var(--fv-scale, 1));transition:background-color .16s ease}',
        '.bar>button[hidden]{display:none}',
        '.bar>button:active,.bar>button.on{background:rgba(255,255,255,.1)}',
        '/* − и +: ширина круглой кнопки */',
        '.bar>button.mark{width:calc(52px * var(--fv-scale, 1));min-width:calc(52px * var(--fv-scale, 1));padding:0}',
        '/* Кнопки 1, 1,5, 2 и 2,5: ширина и размер цифр */',
        '.bar>button.preset{min-width:calc(52px * var(--fv-scale, 1));padding:0 calc(6px * var(--fv-scale, 1));font-size:calc(15px * var(--fv-scale, 1))}',
        '/* Пропуск: ширина кнопки и размер значка ⏭ */',
        '.bar>button.icon{width:calc(52px * var(--fv-scale, 1));min-width:calc(52px * var(--fv-scale, 1));padding:0;font-size:calc(22px * var(--fv-scale, 1))}',
        '/* − и +: размер значка на горизонтальной панели */',
        '.bar>button svg{display:block;width:calc(28px * var(--fv-scale, 1));height:calc(28px * var(--fv-scale, 1));flex:none}',
        '/* Шестерёнка: размер значка на горизонтальной панели. Это правило главнее .bar>button svg */',
        '.bar>button#gear svg{width:calc(28px * var(--fv-scale, 1));height:calc(28px * var(--fv-scale, 1))}',
        '/* − и +: размер значка на вертикальной панели, уже с учётом «Размер панели» */',
        '.dock.vertical .bar>button svg{width:calc(32px * var(--fv-scale, 1));height:calc(32px * var(--fv-scale, 1))}',
        '/* Шестерёнка: размер значка на вертикальной панели */',
        '.dock.vertical .bar>button#gear svg{width:calc(28px * var(--fv-scale, 1));height:calc(28px * var(--fv-scale, 1))}',
        '/* Кнопка текущей скорости N×. Скрывается, когда включены скорости 1, 1,5, 2 и 2,5 */',
        '.rate{min-width:calc(72px * var(--fv-scale, 1));padding:0 calc(12px * var(--fv-scale, 1));font-variant-numeric:tabular-nums}',
        '.chip{display:flex;align-items:center;justify-content:center;min-width:64px;height:44px;padding:0 14px;border-radius:999px;color:#fff;background:rgba(18,18,18,var(--fv-opacity,1));box-shadow:0 8px 28px rgba(0,0,0,.35);transform:scale(var(--fv-scale, 1));transform-origin:center bottom}',
        '.sheet{box-sizing:border-box;margin-bottom:8px;width:var(--fv-sheet-w, min(320px, calc(100vw - 20px)));max-height:var(--fv-sheet-h, calc(100vh - 80px));overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:12px;border-radius:16px;background:rgba(18,18,18,.94);box-shadow:0 8px 28px rgba(0,0,0,.35)}',
        '.sheet[hidden],.dock[hidden],.chip[hidden]{display:none}',
        '.title{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin:8px 0 4px}',
        '.hint{margin:6px 0 10px;color:rgba(255,255,255,.68);font-size:12px;line-height:1.35}',
        'input[type=range]{width:100%;accent-color:#f0b429}',
        '.sc{width:100%;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.06);margin-top:6px;border-radius:10px;padding:0 12px;height:36px}',
        '.check{display:flex;gap:8px;align-items:center;font-size:13px;margin-top:8px}',
        '.link{background:transparent;color:#f0b429;font-size:12px;height:32px;padding:0;margin-top:6px}',
        '.places{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
        '.places button{flex:1;height:32px;border-radius:8px;background:rgba(255,255,255,.08);font-size:12px}',
        '.places button.on{background:rgba(240,180,41,.28);color:#f0b429}',
        '</style>',
        '<div class="panel" id="panel">',
        '<div class="sheet" id="sheet" hidden>',
        '<div class="title"><span>Своя скорость</span><span id="pref-out">1.0×</span></div>',
        '<input id="pref" type="range" min="0.5" max="3" step="0.1" value="1" />',
        '<p class="hint">Средняя кнопка и D: не 1× возвращает 1×, уже 1× ставит свою скорость. + и − меняют шаг на 0.25, S и F на 0.1.</p>',
        '<div id="shortcuts"></div>',
        '<label class="check"><input id="block" type="checkbox" /> Не работать на этом сайте</label>',
        '<label class="check"><input id="place" type="checkbox" checked /> Панель в окне плеера</label>',
        '<div class="places">',
        '<button type="button" data-anchor="top">Сверху</button>',
        '<button type="button" data-anchor="bottom">Снизу</button>',
        '<button type="button" data-anchor="left">Слева</button>',
        '<button type="button" data-anchor="right">Справа</button>',
        '</div>',
        '<label class="check"><input id="presets" type="checkbox" checked /> Скорости 1, 1,5, 2 и 2,5</label>',
        '<div class="title"><span>Прозрачность панели</span><span id="fade-out">55%</span></div>',
        '<input id="fade" type="range" min="0" max="75" step="5" value="55" />',
        '<div class="title"><span>Прозрачность надписи</span><span id="hud-fade-out">55%</span></div>',
        '<input id="hud-fade" type="range" min="0" max="75" step="5" value="55" />',
        '<div class="title"><span>Размер панели</span><span id="scale-out">80%</span></div>',
        '<input id="scale" type="range" min="60" max="160" step="10" value="80" />',
        '<button type="button" class="link" id="reset">Сбросить к стандартным</button>',
        '</div>',
        '<div class="dock" id="full">',
        '<div class="bar">',
        '<!-- − : класс mark, шаг 0.25. Размер значка — .bar>button svg -->',
        '<button type="button" class="mark" data-act="slower" data-step="0.25" aria-label="Медленнее"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 10.5h16v3H4z"/></svg></button>',
        '<!-- 1, 1,5, 2, 2,5: класс preset -->',
        '<button type="button" class="preset" data-rate="1" aria-label="Скорость 1×">1</button>',
        '<button type="button" class="preset" data-rate="1.5" aria-label="Скорость 1,5×">1,5</button>',
        '<button type="button" class="preset" data-rate="2" aria-label="Скорость 2×">2</button>',
        '<button type="button" class="preset" data-rate="2.5" aria-label="Скорость 2,5×">2,5</button>',
        '<!-- N×: класс rate. Прячется, если пресеты включены -->',
        '<button type="button" class="rate" data-act="normal" id="rate" aria-label="1× или своя скорость">1.0×</button>',
        '<!-- + : класс mark, шаг 0.25. Размер значка — .bar>button svg -->',
        '<button type="button" class="mark" data-act="faster" data-step="0.25" aria-label="Быстрее"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.5 4h3v6.5H20v3h-6.5V20h-3v-6.5H4v-3h6.5z"/></svg></button>',
        '<!-- Пропуск: класс icon, размер значка — font-size у .bar>button.icon -->',
        '<button type="button" class="icon" data-act="skip" aria-label="Пропустить">⏭</button>',
        '<!-- В плейлист: класс icon, размер значка — .bar>button svg -->',
        '<button type="button" class="icon" data-act="enqueue" title="В плейлист" aria-label="Добавить в плейлист"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5h12v2H3V5zm0 6h12v2H3v-2zm0 6h8v2H3v-2zm13-1h2v3h3v2h-3v3h-2v-3h-3v-2h3v-3z"/></svg></button>',
        '<!-- Шестерёнка: #gear svg -->',
        '<button type="button" class="icon" id="gear" aria-label="Настройки"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg></button>',
        '</div>',
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
        place: shadow.getElementById('place'),
        presets: shadow.getElementById('presets'),
        fade: shadow.getElementById('fade'),
        fadeOut: shadow.getElementById('fade-out'),
        hudFade: shadow.getElementById('hud-fade'),
        hudFadeOut: shadow.getElementById('hud-fade-out'),
        scale: shadow.getElementById('scale'),
        scaleOut: shadow.getElementById('scale-out'),
        panel: shadow.getElementById('panel')
      };
      shadow.addEventListener('pointerdown', function (event) {
        if (!api.sheet.hidden) {
          var inSheet = event.target === api.sheet || (api.sheet.contains && api.sheet.contains(event.target));
          var gear = event.target.closest && event.target.closest('#gear');
          if (!inSheet && !gear) {
            api.sheet.hidden = true;
            if (settingsHold) {
              settingsHold = false;
              refreshDock();
            }
          }
        }
        event.stopPropagation();
      });
      shadow.addEventListener('wheel', function (event) {
        event.stopPropagation();
      }, { passive: true });
      shadow.addEventListener('touchmove', function (event) {
        event.stopPropagation();
      }, { passive: true });
      var bar = shadow.querySelector('.bar');
      var swipe = null;
      bar.addEventListener('pointerdown', function (event) {
        if (bar.scrollWidth <= bar.clientWidth + 2) return;
        swipe = { id: event.pointerId, x: event.clientX, left: bar.scrollLeft, moved: false };
      });
      bar.addEventListener('pointermove', function (event) {
        if (!swipe || swipe.id !== event.pointerId) return;
        var dx = event.clientX - swipe.x;
        if (Math.abs(dx) < 8) return;
        swipe.moved = true;
        bar.scrollLeft = swipe.left - dx;
      });
      function endSwipe(event) {
        if (!swipe || swipe.id !== event.pointerId) return;
        if (swipe.moved) bar.dataset.swiped = '1';
        swipe = null;
      }
      bar.addEventListener('pointerup', endSwipe);
      bar.addEventListener('pointercancel', endSwipe);
      shadow.addEventListener('click', function (event) {
        if (bar.dataset.swiped === '1') {
          bar.dataset.swiped = '';
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        var button = event.target.closest ? event.target.closest('button') : null;
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        if (button.dataset.anchor) {
          commit({ dockAnchor: button.dataset.anchor });
          return;
        }
        if (button.dataset.rate) {
          requestAction('set', { rate: Number(button.dataset.rate) });
          return;
        }
        if (button.dataset.act === 'enqueue') {
          requestEnqueue();
          syncEnqueueButton();
          return;
        }
        if (button.dataset.act) {
          var step = Number(button.dataset.step);
          requestAction(button.dataset.act, isFinite(step) && step > 0 ? { step: step } : null);
          return;
        }
        if (button.id === 'gear' || button.id === 'chip') {
          api.sheet.hidden = !api.sheet.hidden;
          if (api.sheet.hidden) {
            settingsHold = false;
            refreshDock();
          } else updateSheet();
          return;
        }
        if (button.dataset.record) {
          recording = button.dataset.record;
          shadow.getElementById('sc-' + recording).textContent = 'клавиша…';
          return;
        }
        if (button.id === 'reset') {
          recording = null;
          commit(defaultSettings());
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
      api.place.addEventListener('change', function () {
        commit({ dockPlace: api.place.checked ? 'player' : 'screen' });
      });
      api.presets.addEventListener('change', function () {
        commit({ showPresets: api.presets.checked });
      });
      api.fade.addEventListener('input', function () {
        api.fadeOut.textContent = api.fade.value + '%';
        commit({ dockOpacity: 1 - Number(api.fade.value) / 100 });
      });
      api.hudFade.addEventListener('input', function () {
        api.hudFadeOut.textContent = api.hudFade.value + '%';
        commit({ hudOpacity: 1 - Number(api.hudFade.value) / 100 });
      });
      api.scale.addEventListener('input', function () {
        api.scaleOut.textContent = api.scale.value + '%';
        commit({ dockScale: Number(api.scale.value) / 100 });
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
      document.addEventListener('ended', onEnded, true);
      document.addEventListener('durationchange', onTiming, true);
      document.addEventListener('loadedmetadata', onTiming, true);
      document.addEventListener('timeupdate', onProgress, true);
      document.addEventListener('pointerover', function (event) {
        if (settings.dockPlace !== 'player' || settingsHold || !hoverControls()) return;
        var inside = pointerHitsPlayer(event);
        if (inside === pointerInPlayer) return;
        pointerInPlayer = inside;
        refreshDock();
      }, true);
      document.addEventListener('pointerout', function (event) {
        if (!pointerInPlayer || event.relatedTarget) return;
        pointerInPlayer = false;
        refreshDock();
      }, true);
      document.addEventListener('pointerdown', function (event) {
        if (!dock || dock.sheet.hidden) return;
        var path = event.composedPath ? event.composedPath() : [];
        if (path.indexOf(dock.host) !== -1) return;
        dock.sheet.hidden = true;
        if (settingsHold) {
          settingsHold = false;
          refreshDock();
        }
      }, true);
      var dockFrame = 0;
      function scheduleDock() {
        if (dockFrame) return;
        dockFrame = requestAnimationFrame(function () {
          dockFrame = 0;
          refreshDock();
        });
      }
      window.addEventListener('resize', scheduleDock);
      window.addEventListener('scroll', scheduleDock, true);
      document.addEventListener('fullscreenchange', scheduleDock);
      setInterval(function () {
        noteChildVideos();
        refreshDock();
        pullPlaylist();
        fillMissingPoster();
        syncPlayIntent();
      }, 1000);
      if (!isFramed()) publishSettings();
      pullPlaylist();
      refreshDock();
    }

    function openSettings() {
      if (isFramed()) return;
      settingsHold = true;
      refreshDock();
      if (!dock) return;
      dock.sheet.hidden = false;
      updateSheet();
    }

    return {
      start: start,
      openSettings: openSettings,
      requestAction: requestAction,
      applySettings: applyIncomingSettings,
      applyPlaylist: applyPlaylist,
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
    readMediaTiming: readMediaTiming,
    formatDuration: formatDuration,
    pageIdentity: pageIdentity,
    normalizePlaylist: normalizePlaylist,
    playlistNext: playlistNext,
    playlistClipboard: playlistClipboard,
    durationsMatch: durationsMatch,
    youtubePoster: youtubePoster,
    rutubePoster: rutubePoster,
    knownPoster: knownPoster,
    reorderItems: reorderItems,
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

  function playlistLoad(done) {
    try {
      if (typeof GM_getValue === 'function') {
        var value = GM_getValue('playlist', null);
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
        Promise.resolve(GM.getValue('playlist', null)).then(done, function () { done(null); });
        return;
      }
    } catch (err) {}
    try {
      done(JSON.parse(localStorage.getItem('fast-video-playlist') || 'null'));
    } catch (err) {
      done(null);
    }
  }

  function playlistSave(playlist, done) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue('playlist', playlist);
    } catch (err) {}
    try {
      if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') GM.setValue('playlist', playlist);
    } catch (err) {}
    try {
      localStorage.setItem('fast-video-playlist', JSON.stringify(playlist));
    } catch (err) {}
    if (done) done();
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

  var controller = null;

  function boot() {
    loadSettings(function (stored) {
      var initial = stored && typeof stored === 'object' ? stored : {};
      if (initial.showTouchControls == null) initial.showTouchControls = true;
      controller = FastVideo.createController({
        initialSettings: initial,
        persist: persist,
        playlistStore: { load: playlistLoad, save: playlistSave }
      });
      controller.start();
    });
  }

  function registerMenu() {
    try { if (window.top !== window) return; } catch (err) { return; }
    var open = function () { if (controller) controller.openSettings(); };
    try {
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Настройки Fast Video', open);
        return;
      }
    } catch (err) {}
    try {
      if (typeof GM !== 'undefined' && typeof GM.registerMenuCommand === 'function') {
        GM.registerMenuCommand('Настройки Fast Video', open);
      }
    } catch (err) {}
  }

  registerMenu();

  if (document.documentElement) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
