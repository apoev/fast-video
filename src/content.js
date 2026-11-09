(function () {
  'use strict';

  var controller = FastVideo.createController({
    initialSettings: FastVideo.defaultSettings(),
    persist: function (settings) {
      chrome.storage.local.set({ settings: settings });
    }
  });

  controller.start();

  chrome.storage.local.get('settings', function (data) {
    if (data && data.settings) controller.applySettings(data.settings);
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.settings) controller.applySettings(changes.settings.newValue);
  });

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || message.source !== 'fast-video') return;
    if (message.type === 'apply') {
      var framed = false;
      try { framed = window.top !== window; } catch (err) { framed = true; }
      if (!framed) controller.requestAction(message.action, { force: true });
    }
    if (message.type === 'status') sendResponse(controller.status());
  });
})();
