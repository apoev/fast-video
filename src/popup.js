(function () {
  var settings = FastVideo.defaultSettings();
  var recording = null;
  var tabId = null;
  var host = null;

  var statusNode = document.getElementById('status');
  var actionsNode = document.getElementById('actions');
  var shortcutsNode = document.getElementById('shortcuts');
  var pref = document.getElementById('pref');
  var prefOut = document.getElementById('pref-out');
  var block = document.getElementById('block');
  var blockLabel = document.getElementById('block-label');
  var touch = document.getElementById('touch');

  FastVideo.ACTIONS.forEach(function (action) {
    var button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = FastVideo.ACTION_TITLE[action] + '<small></small>';
    button.addEventListener('click', function () { send({ type: 'apply', action: action }); });
    actionsNode.appendChild(button);

    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'sc';
    row.dataset.action = action;
    row.innerHTML = '<span>' + FastVideo.ACTION_TITLE[action] + '</span><span></span>';
    row.addEventListener('click', function () {
      recording = action;
      render();
    });
    shortcutsNode.appendChild(row);
  });

  function send(message) {
    if (tabId == null) return;
    chrome.tabs.sendMessage(tabId, Object.assign({ source: 'fast-video' }, message), function (response) {
      void chrome.runtime.lastError;
      if (message.type === 'status') renderStatus(response);
      if (message.type === 'apply') setTimeout(refreshStatus, 180);
    });
  }

  function refreshStatus() {
    send({ type: 'status' });
  }

  function renderStatus(info) {
    if (!host) {
      statusNode.textContent = 'На этой странице расширение не запускается.';
      return;
    }
    if (!info) {
      statusNode.textContent = 'Обновите вкладку, если кнопки молчат.';
      return;
    }
    if (info.disabled) {
      statusNode.textContent = 'Клавиши выключены на ' + host + '. Кнопки выше всё ещё работают.';
      return;
    }
    if (info.videos > 0 && info.rate) {
      statusNode.textContent = FastVideo.formatRate(info.rate) + '× · видео на странице: ' + info.videos;
      return;
    }
    if (info.embedded) {
      statusNode.textContent = 'Плеер во фрейме. Клавиши S D F E управляют им.';
      return;
    }
    statusNode.textContent = 'Видео пока не видно. Клавиши заработают, когда ролик появится.';
  }

  function render() {
    var buttons = actionsNode.querySelectorAll('button');
    var rows = shortcutsNode.querySelectorAll('button');
    FastVideo.ACTIONS.forEach(function (action, index) {
      var shortcut = settings.shortcuts[action];
      buttons[index].querySelector('small').textContent = FastVideo.shortcutLabel(shortcut);
      var value = rows[index].querySelector('span:last-child');
      value.textContent = recording === action ? 'нажмите клавишу' : FastVideo.shortcutLabel(shortcut);
      rows[index].classList.toggle('armed', recording === action);
    });
    var shown = Math.min(3, Math.max(0.5, settings.preferredRate));
    if (document.activeElement !== pref) pref.value = String(shown);
    prefOut.textContent = FastVideo.formatRate(settings.preferredRate) + '×';
    block.disabled = !host;
    block.checked = !!(host && FastVideo.isHostBlocked(settings.disabledHosts, host));
    blockLabel.textContent = host ? 'Не работать на ' + host : 'Не работать на этом сайте';
    touch.checked = settings.showTouchControls === true;
  }

  function save() {
    chrome.storage.local.set({ settings: settings });
  }

  function commit(next) {
    settings = FastVideo.normalizeSettings(next);
    save();
    render();
  }

  pref.addEventListener('input', function () {
    prefOut.textContent = FastVideo.formatRate(pref.value) + '×';
    commit({
      preferredRate: Number(pref.value),
      shortcuts: settings.shortcuts,
      disabledHosts: settings.disabledHosts,
      showTouchControls: settings.showTouchControls
    });
  });

  block.addEventListener('change', function () {
    if (!host) return;
    var hosts = settings.disabledHosts.filter(function (item) { return item !== host; });
    if (block.checked) hosts.push(host);
    commit({
      preferredRate: settings.preferredRate,
      shortcuts: settings.shortcuts,
      disabledHosts: hosts,
      showTouchControls: settings.showTouchControls
    });
  });

  touch.addEventListener('change', function () {
    commit({
      preferredRate: settings.preferredRate,
      shortcuts: settings.shortcuts,
      disabledHosts: settings.disabledHosts,
      showTouchControls: touch.checked
    });
  });

  document.getElementById('reset').addEventListener('click', function () {
    recording = null;
    commit({
      preferredRate: 1,
      shortcuts: {
        slower: { code: 'KeyS', alt: false, ctrl: false, shift: false, meta: false },
        normal: { code: 'KeyD', alt: false, ctrl: false, shift: false, meta: false },
        faster: { code: 'KeyF', alt: false, ctrl: false, shift: false, meta: false },
        skip: { code: 'KeyE', alt: false, ctrl: false, shift: false, meta: false }
      },
      disabledHosts: settings.disabledHosts,
      showTouchControls: null
    });
  });

  window.addEventListener('keydown', function (event) {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (/^(Shift|Control|Alt|Meta)/.test(event.code)) return;
    var action = recording;
    recording = null;
    if (event.code === 'Escape') {
      render();
      return;
    }
    var shortcut = {
      code: event.code,
      alt: event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      meta: event.metaKey
    };
    var shortcuts = FastVideo.normalizeSettings(settings).shortcuts;
    FastVideo.ACTIONS.forEach(function (name) {
      if (name !== action && FastVideo.sameShortcut(shortcuts[name], shortcut)) {
        shortcuts[name] = { code: '', alt: false, ctrl: false, shift: false, meta: false };
      }
    });
    shortcuts[action] = shortcut;
    commit({
      preferredRate: settings.preferredRate,
      shortcuts: shortcuts,
      disabledHosts: settings.disabledHosts,
      showTouchControls: settings.showTouchControls
    });
  }, true);

  chrome.storage.local.get('settings', function (data) {
    if (data && data.settings) settings = FastVideo.normalizeSettings(data.settings);
    render();
  });

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab) return;
    tabId = tab.id;
    try {
      var url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') host = FastVideo.hostKey(url.hostname);
    } catch (err) {}
    render();
    refreshStatus();
  });
})();
