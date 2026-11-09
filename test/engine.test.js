const assert = require('assert');
const fv = require('../src/engine.js');

assert.strictEqual(fv.nextRate(1, 'faster', 1), 1.1);
assert.strictEqual(fv.nextRate(1, 'slower', 1), 0.9);
assert.strictEqual(fv.nextRate(0.1, 'slower', 1), 0.1);
assert.strictEqual(fv.nextRate(9.9, 'faster', 1), 9.9);
assert.strictEqual(fv.nextRate(1.26, 'faster', 1), 1.4);
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
assert.strictEqual(fv.isHostBlocked(settings.disabledHosts, 'm.youtube.com'), true);
assert.strictEqual(fv.isHostBlocked(settings.disabledHosts, 'notyoutube.com'), false);
assert.strictEqual(fv.sameShortcut(settings.shortcuts.faster, {
  code: 'KeyL', alt: true, ctrl: false, shift: true, meta: false
}), true);

console.log('engine tests passed');
