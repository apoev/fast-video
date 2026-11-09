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
