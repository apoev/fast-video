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
