const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('next'))('sharp');

const root = path.resolve(__dirname, '..');
const catalog = require('../lib/materials/catalog.json');
const carouselMaterials = require('../lib/materials/carousel.json').map(selection => {
  const product = catalog.find(item => item.id === selection.materialId);
  return { title: selection.title ?? product.title, image: product.image.slice(1).replace(/\.webp$/, '') };
});
const source = fs.readFileSync(path.join(root, 'components/materials/MaterialsCarousel.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

// Event/animation fakes exercise lifecycle logic, not browser rendering or real touch physics.
function target(extra = {}) {
  const listeners = new Map();
  return { ...extra, listeners,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
    fire(name, event = {}) { listeners.get(name)?.(event); },
  };
}

function mount({ reduced = false, keyboard = false, width = 2920 } = {}) {
  const effects = [], observers = [], sizeObservers = [], animations = [], state = [reduced, keyboard];
  const group = { getBoundingClientRect: () => ({ width }) };
  const viewport = target({ scrollLeft: 0, capture: null,
    contains: () => false,
    setPointerCapture(id) { this.capture = id; },
    hasPointerCapture(id) { return this.capture === id; },
    releasePointerCapture() { this.capture = null; },
  });
  const track = { firstElementChild: group, animate(keyframes, options) {
    const animation = { keyframes, options, currentTime: 0, playState: 'running',
      play() { this.playState = 'running'; }, pause() { this.playState = 'paused'; },
      cancel() { this.playState = 'idle'; },
    }; animations.push(animation); return animation;
  } };
  const refs = [{ current: viewport }, { current: track }, { current: 0 }];
  const preference = target({ matches: reduced });
  const doc = target({ hidden: false, activeElement: null });
  const win = target({ matchMedia: () => preference });
  let refIndex = 0, stateIndex = 0;
  const react = {
    useRef: () => refs[refIndex++],
    useState: () => { const i = stateIndex++; return [state[i], value => { state[i] = value; }]; },
    useEffect: callback => effects.push(callback),
  };
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(compiled, {
    exports, require: name => name === 'react' ? react : name === '@/lib/materials/catalog' ? { carouselMaterials } : { jsx, jsxs: jsx },
    window: win, document: doc, performance: { now: () => 1000 }, HTMLElement: class {},
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; sizeObservers.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    },
  });
  const tree = exports.MaterialsCarousel();
  const cleanup = effects.map(callback => callback());
  return { tree, viewport, track, animations, doc, win, preference, state,
    visible(value) { observers[0].callback([{ isIntersecting: value }]); },
    resize(value) { width = value; sizeObservers[0].callback(); },
    unmount() { cleanup.forEach(callback => callback?.()); }, observers, sizeObservers };
}

function elements(node, type) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => elements(child, type));
  return [...(node.type === type ? [node] : []), ...elements(node.props?.children, type)];
}

test('same ten covers, titles, links and responsive sources; copies excluded from keyboard', () => {
  const h = mount();
  const links = elements(h.tree, 'a');
  const images = elements(h.tree, 'img');
  assert.equal(links.length, 20);
  assert.equal(images.length, 20);
  assert.equal(new Set(images.map(i => i.props.src)).size, 10);
  links.forEach((link, i) => {
    assert.equal(link.props.href, '/materiais');
    assert.equal(link.props.tabIndex, i < 10 ? undefined : -1);
  });
  for (let i = 0; i < 10; i++) {
    assert.equal(images[i].props.src, images[i + 10].props.src);
    assert.ok(images[i].props.alt);
    assert.equal(images[i].props.sizes, '260px');
    assert.equal(images[i].props.loading, 'lazy');
    assert.equal(images[i].props.srcSet.split(', ').length, 3);
  }
  h.unmount();
});

test('structural layout survives missing carousel CSS: fixed portrait cards in one clipped row', () => {
  const h = mount();
  assert.equal(h.tree.props.style.maxWidth, '100%');
  assert.equal(h.tree.props.style.overflowX, 'hidden');
  const track = h.tree.props.children;
  assert.equal(track.props.style.display, 'flex');
  assert.equal(track.props.style.flexFlow, 'row nowrap');
  for (const group of track.props.children) {
    assert.equal(group.props.style.display, 'flex');
    assert.equal(group.props.style.flexFlow, 'row nowrap');
    assert.equal(group.props.style.flex, '0 0 auto');
    assert.equal(group.props.style.gap, group.props.style.paddingRight);
  }
  for (const card of elements(h.tree, 'a')) {
    assert.equal(card.props.style.width, 260);
    assert.equal(card.props.style.flex, '0 0 260px');
    assert.equal(card.props.children[0].props.style.height, 330);
  }
  for (const image of elements(h.tree, 'img')) {
    assert.equal(image.props.style.width, '100%');
    assert.equal(image.props.style.height, '100%');
    assert.equal(image.props.style.objectFit, 'cover');
  }
  h.unmount();
});

test('manual layout hides the duplicate and allows native horizontal scrolling without CSS', () => {
  const h = mount({ reduced: true });
  assert.equal(h.tree.props.style.overflowX, 'auto');
  assert.equal(h.tree.props.children.props.children[1].props.style.display, 'none');
  h.unmount();
});

test('loop travels exactly one group including the last gap', () => {
  const h = mount();
  const a = h.animations[0];
  assert.equal(a.keyframes[1].transform, 'translate3d(-2920px, 0, 0)');
  assert.equal(a.options.duration, 35000);
  assert.equal(a.options.iterations, Infinity);
  assert.equal(a.options.easing, 'linear');
  h.unmount();
});

test('offscreen and hidden tabs pause; phase survives pause and resume', () => {
  const h = mount(), a = h.animations[0];
  assert.equal(a.playState, 'paused');
  h.visible(true); assert.equal(a.playState, 'running');
  a.currentTime = 23456;
  h.visible(false); assert.equal(a.playState, 'paused');
  h.visible(true); assert.equal(a.currentTime, 23456);
  h.doc.hidden = true; h.doc.fire('visibilitychange'); assert.equal(a.playState, 'paused');
  h.doc.hidden = false; h.doc.fire('visibilitychange'); assert.equal(a.playState, 'running');
  h.unmount();
});

test('desktop hover pauses; touch pointerenter does not leave animation stuck', () => {
  const h = mount(), a = h.animations[0]; h.visible(true);
  h.viewport.fire('pointerenter', { pointerType: 'mouse' }); assert.equal(a.playState, 'paused');
  h.viewport.fire('pointerleave', { pointerType: 'mouse' }); assert.equal(a.playState, 'running');
  h.viewport.fire('pointerenter', { pointerType: 'touch' }); assert.equal(a.playState, 'running');
  h.unmount();
});

test('horizontal touch drag wraps without blanks and prevents accidental navigation', () => {
  const h = mount(), a = h.animations[0]; h.visible(true);
  h.viewport.fire('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: 100 });
  assert.equal(a.playState, 'paused');
  let prevented = false;
  h.viewport.fire('pointermove', { pointerId: 1, clientX: 7000, clientY: 105, preventDefault() { prevented = true; } });
  assert.ok(prevented); assert.equal(h.viewport.capture, 1);
  assert.ok(a.currentTime >= 0 && a.currentTime < 35000);
  h.win.fire('pointerup', { pointerId: 1 }); assert.equal(a.playState, 'running');
  assert.equal(h.viewport.capture, null);
  let clickPrevented = false;
  h.viewport.fire('click', { preventDefault() { clickPrevented = true; }, stopPropagation() {} });
  assert.ok(clickPrevented);
  h.unmount();
});

test('vertical touch gesture is not prevented; cancellation resumes animation', () => {
  const h = mount(), a = h.animations[0]; h.visible(true);
  h.viewport.fire('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: 100 });
  h.viewport.fire('pointermove', { pointerId: 1, clientX: 103, clientY: 250, preventDefault() { assert.fail('must allow vertical scrolling'); } });
  assert.equal(h.viewport.capture, null);
  h.win.fire('pointercancel', { pointerId: 1 }); assert.equal(a.playState, 'running');
  h.unmount();
});

test('ordinary tap keeps the material link actionable', () => {
  const h = mount();
  h.viewport.fire('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: 100 });
  h.win.fire('pointerup', { pointerId: 1 });
  h.viewport.fire('click', { preventDefault() { assert.fail('tap must navigate'); } });
  h.unmount();
});

test('resize preserves animation phase and updates loop distance', () => {
  const h = mount(); h.animations[0].currentTime = 10000;
  h.resize(3100);
  assert.equal(h.animations[0].playState, 'idle');
  assert.equal(h.animations[1].currentTime, 10000);
  assert.equal(h.animations[1].keyframes[1].transform, 'translate3d(-3100px, 0, 0)');
  h.unmount();
});

test('reduced motion and keyboard mode use a non-animated accessible list', () => {
  for (const option of [{ reduced: true }, { keyboard: true }]) {
    const h = mount(option);
    assert.equal(h.animations.length, 0);
    assert.equal(h.tree.props['data-manual'], true);
    assert.equal(elements(h.tree, 'a').filter(a => a.props.tabIndex !== -1).length, 10);
    h.unmount();
  }
});

test('preference changes are subscribed and all listeners/observers are cleaned up', () => {
  const h = mount();
  h.preference.matches = true; h.preference.fire('change'); assert.equal(h.state[0], true);
  h.unmount();
  for (const element of [h.viewport, h.win, h.doc, h.preference]) assert.equal(element.listeners.size, 0);
  assert.ok(h.observers[0].disconnected); assert.ok(h.sizeObservers[0].disconnected);
  assert.equal(h.animations[0].playState, 'idle');
});

test('all responsive images exist, retain aspect ratio and reduce bytes', async () => {
  const names = carouselMaterials.map(item => item.image);
  assert.equal(names.length, 10);
  for (const name of names) {
    const original = path.join(root, 'public', name + '.webp');
    const originalInfo = await sharp(original).metadata();
    for (const width of [260, 520, 780]) {
      const file = path.join(root, 'public/materials-covers', `${name}-${width}.webp`);
      const info = await sharp(file).metadata();
      assert.equal(info.width, width);
      assert.equal(info.format, 'webp');
      assert.ok(Math.abs(info.height - width * originalInfo.height / originalInfo.width) <= 1);
      assert.ok(fs.statSync(file).size < fs.statSync(original).size / 2);
    }
  }
});
