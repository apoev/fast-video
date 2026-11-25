const assert = require('assert');
const fv = require('../src/engine.js');

assert.strictEqual(fv.nextRate(1, 'faster', 1), 1.1);
assert.strictEqual(fv.nextRate(1, 'slower', 1), 0.9);
assert.strictEqual(fv.nextRate(0.1, 'slower', 1), 0.1);
assert.strictEqual(fv.nextRate(9.9, 'faster', 1), 9.9);
assert.strictEqual(fv.nextRate(1.26, 'faster', 1), 1.4);
assert.strictEqual(fv.nextRate(1, 'faster', 1, 0.25), 1.25);
assert.strictEqual(fv.nextRate(1.25, 'slower', 1, 0.25), 1);
assert.strictEqual(fv.nextRate(9.8, 'faster', 1, 0.25), 9.9);
assert.strictEqual(fv.formatRate(2.25), '2.25');
assert.strictEqual(fv.formatRate(1.5), '1.5');
assert.strictEqual(fv.nextRate(2, 'normal', 1.5), 1);
assert.strictEqual(fv.nextRate(1, 'normal', 1.5), 1.5);
assert.strictEqual(fv.nextRate(1.02, 'normal', 1.8), 1.8);

const settings = fv.normalizeSettings({
  preferredRate: 1.75,
  shortcuts: {
    faster: { code: 'KeyL', alt: true, ctrl: false, shift: true, meta: false }
  },
  disabledHosts: ['www.YouTube.com', 'youtube.com', '']
});

assert.strictEqual(settings.preferredRate, 1.8);
assert.strictEqual(settings.shortcuts.slower.code, 'KeyS');
assert.strictEqual(settings.shortcuts.faster.code, 'KeyL');
assert.deepStrictEqual(settings.disabledHosts, ['youtube.com']);
assert.strictEqual(fv.matchShortcut(settings, {
  code: 'KeyL', altKey: true, ctrlKey: false, shiftKey: true, metaKey: false
}), 'faster');
assert.strictEqual(fv.matchShortcut(settings, {
  code: 'KeyL', altKey: false, ctrlKey: false, shiftKey: false, metaKey: false
}), null);
assert.strictEqual(fv.shortcutLabel(settings.shortcuts.faster), 'Alt + Shift + L');
assert.strictEqual(settings.dockPlace, 'player');
assert.strictEqual(fv.defaultSettings().dockPlace, 'player');
assert.strictEqual(fv.defaultSettings().dockAnchor, 'bottom');
assert.strictEqual(fv.defaultSettings().preferredRate, 1);
assert.deepStrictEqual(fv.defaultSettings().disabledHosts, []);
assert.strictEqual(fv.normalizeSettings({ dockPlace: 'player' }).dockPlace, 'player');
assert.strictEqual(fv.normalizeSettings({}).dockAnchor, 'bottom');
assert.strictEqual(fv.normalizeSettings({ dockAnchor: 'left' }).dockAnchor, 'left');
assert.strictEqual(fv.normalizeSettings({ dockAnchor: 'top' }).dockAnchor, 'top');
assert.strictEqual(fv.normalizeSettings({ dockAnchor: 'center' }).dockAnchor, 'top');
assert.strictEqual(fv.normalizeSettings({ dockAnchor: 'nope' }).dockAnchor, 'bottom');
assert.strictEqual(fv.normalizeSettings({ dockPlace: 'screen' }).dockPlace, 'screen');
assert.strictEqual(fv.normalizeSettings({ dockPlace: 'nope' }).dockPlace, 'player');
assert.strictEqual(fv.normalizeSettings({}).dockOpacity, 0.45);
assert.strictEqual(fv.normalizeSettings({}).hudOpacity, 0.45);
assert.strictEqual(fv.normalizeSettings({ hudOpacity: 0.42 }).hudOpacity, 0.4);
assert.strictEqual(fv.normalizeSettings({ dockOpacity: 0.33 }).dockOpacity, 0.35);
assert.strictEqual(fv.normalizeSettings({ dockOpacity: 2 }).dockOpacity, 1);
assert.strictEqual(fv.normalizeSettings({}).dockScale, 0.8);
assert.strictEqual(fv.normalizeSettings({ dockScale: 1.24 }).dockScale, 1.2);
assert.strictEqual(fv.normalizeSettings({ dockScale: 3 }).dockScale, 1.6);
assert.strictEqual(fv.normalizeSettings({}).showTouchControls, true);
assert.strictEqual(fv.normalizeSettings({ showTouchControls: false }).showTouchControls, true);
assert.strictEqual(fv.normalizeSettings({}).showPresets, true);
assert.strictEqual(fv.normalizeSettings({ showPresets: false }).showPresets, false);
assert.strictEqual(fv.isHostBlocked(settings.disabledHosts, 'm.youtube.com'), true);
assert.strictEqual(fv.isHostBlocked(settings.disabledHosts, 'notyoutube.com'), false);
assert.strictEqual(fv.sameShortcut(settings.shortcuts.faster, {
  code: 'KeyL', alt: true, ctrl: false, shift: true, meta: false
}), true);

assert.deepStrictEqual(fv.readMediaTiming(65.4), { duration: 65, live: false });
assert.deepStrictEqual(fv.readMediaTiming(Infinity), { duration: null, live: true });
assert.deepStrictEqual(fv.readMediaTiming(NaN), { duration: null, live: false });
assert.deepStrictEqual(fv.readMediaTiming(0.1), { duration: null, live: false });
assert.strictEqual(fv.formatDuration(65), '1:05');
assert.strictEqual(fv.formatDuration(5), '0:05');
assert.strictEqual(fv.formatDuration(3661), '1:01:01');
assert.strictEqual(fv.formatDuration(Infinity), 'эфир');
assert.strictEqual(fv.formatDuration(null), '');

assert.strictEqual(
  fv.pageIdentity('https://www.youtube.com/watch?v=abc&t=10s'),
  fv.pageIdentity('https://youtu.be/abc')
);
assert.strictEqual(fv.pageIdentity('https://m.youtube.com/shorts/abc'), 'yt:abc');
assert.strictEqual(
  fv.pageIdentity('https://example.com/v?x=1#t'),
  fv.pageIdentity('https://example.com/v?x=1')
);
assert.notStrictEqual(
  fv.pageIdentity('https://example.com/a'),
  fv.pageIdentity('https://example.com/b')
);

assert.deepStrictEqual(fv.normalizePlaylist(null), { items: [], currentId: '', open: true, playId: '', playAt: 0 });
assert.strictEqual(fv.normalizePlaylist({ open: false, items: [] }).open, false);
const armed = fv.normalizePlaylist({
  currentId: 'a',
  playId: 'a',
  playAt: 123,
  items: [{ id: 'a', url: 'https://example.com/a', title: 'A', duration: 20 }]
});
assert.strictEqual(armed.playId, 'a');
assert.strictEqual(armed.playAt, 123);
assert.strictEqual(fv.normalizePlaylist({
  playId: 'gone',
  playAt: 123,
  items: [{ id: 'a', url: 'https://example.com/a', title: 'A' }]
}).playId, '');
assert.strictEqual(
  fv.youtubePoster('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
);
assert.strictEqual(fv.youtubePoster('https://example.com/a'), '');
assert.strictEqual(
  fv.rutubePoster('https://rutube.ru/video/3eac3b4561676c17df9132a9a1e62e3e/'),
  'https://rutube.ru/api/video/3eac3b4561676c17df9132a9a1e62e3e/thumbnail/?redirect=1'
);
assert.strictEqual(
  fv.knownPoster('https://rutube.ru/play/embed/a10e53b86e8f349080f718582ce4c661'),
  'https://rutube.ru/api/video/a10e53b86e8f349080f718582ce4c661/thumbnail/?redirect=1'
);
assert.strictEqual(
  fv.pageIdentity('https://rutube.ru/video/3eac3b4561676c17df9132a9a1e62e3e/?autoplay=1'),
  fv.pageIdentity('https://rutube.ru/video/3eac3b4561676c17df9132a9a1e62e3e/')
);
var longPoster = 'https://sun9-1.userapi.com/' + 'a'.repeat(900) + '.jpg';
assert.strictEqual(fv.normalizePlaylist({
  items: [{ id: 'a', url: 'https://vk.com/video-1_2', title: 'V', poster: longPoster }]
}).items[0].poster, longPoster);
assert.strictEqual(fv.normalizePlaylist({
  items: [{ id: 'a', url: 'https://vk.com/video-1_2', title: 'V', poster: '//' + 'sun9-1.userapi.com/thumb.jpg' }]
}).items[0].poster, 'https://sun9-1.userapi.com/thumb.jpg');
assert.strictEqual(fv.normalizePlaylist({
  items: [{ id: 'a', url: 'https://example.com/a', title: 'A', poster: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' }]
}).items[0].poster, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
assert.strictEqual(fv.normalizePlaylist({
  items: [{ id: 'a', url: 'https://example.com/a', title: 'A', poster: 'javascript:alert(1)' }]
}).items[0].poster, '');
assert.deepStrictEqual(fv.reorderItems(
  [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  ['c', 'a']
).map(function (item) { return item.id; }), ['c', 'a', 'b']);

const playlist = fv.normalizePlaylist({
  currentId: 'b',
  items: [
    { id: 'a', url: 'https://youtu.be/aaa', title: 'A', duration: 120 },
    { id: 'b', url: 'https://example.com/two', title: 'B', duration: 30 },
    { id: 'c', url: 'javascript:alert(1)', title: 'no' },
    { id: 'd', url: 'https://example.com/three', title: 'C', duration: Infinity }
  ]
});
assert.strictEqual(playlist.items.length, 3);
assert.strictEqual(playlist.currentId, 'b');
assert.strictEqual(playlist.items[0].duration, 120);
assert.strictEqual(playlist.items[2].live, true);
assert.strictEqual(playlist.items[2].duration, null);
assert.strictEqual(fv.playlistNext(playlist, 'https://example.com/two').id, 'd');
assert.strictEqual(fv.playlistNext(playlist, 'https://youtu.be/aaa'), null);
assert.strictEqual(fv.playlistNext(playlist, 'https://example.com/three'), null);
const replay = fv.normalizePlaylist({
  currentId: 'a',
  items: [
    { id: 'a', url: 'https://example.com/a', title: 'A', duration: 10 },
    { id: 'a2', url: 'https://example.com/a?utm_source=mail', title: 'A again' },
    { id: 'b', url: 'https://example.com/b', title: 'B', duration: 10 }
  ]
});
assert.strictEqual(fv.playlistNext(replay, 'https://example.com/a').id, 'b');
assert.strictEqual(fv.playlistNext(Object.assign({}, playlist, { currentId: 'd' }), 'https://example.com/three'), null);
assert.strictEqual(
  fv.playlistClipboard(playlist),
  'https://youtu.be/aaa\nhttps://example.com/two\nhttps://example.com/three'
);
assert.strictEqual(
  fv.playlistClipboard(replay),
  'https://example.com/a\nhttps://example.com/b'
);
assert.strictEqual(fv.playlistClipboard(null), '');
assert.strictEqual(fv.durationsMatch(120.4, 120), true);
assert.strictEqual(fv.durationsMatch(103, 100), true);
assert.strictEqual(fv.durationsMatch(110, 100), false);
assert.strictEqual(fv.durationsMatch(15, 120), false);
assert.strictEqual(fv.durationsMatch(Infinity, 120), false);
assert.strictEqual(fv.durationsMatch(10, null), false);

const many = [];
for (let i = 0; i < 105; i++) many.push({ id: 'i' + i, url: 'https://example.com/' + i, title: String(i) });
const capped = fv.normalizePlaylist({ items: many, currentId: 'i0' });
assert.strictEqual(capped.items.length, 100);
assert.strictEqual(capped.items[0].id, 'i5');
assert.strictEqual(capped.items[99].id, 'i104');
assert.strictEqual(capped.currentId, 'i5');

console.log('engine tests passed');
