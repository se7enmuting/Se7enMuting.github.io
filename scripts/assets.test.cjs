'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const CleanCSS = require('clean-css');
const { build } = require('./assets.cjs');
const root = path.resolve(__dirname, '..');

// Exercise document-ready callbacks and desktop scroll behavior without a browser.
function effects(code, width) {
    const calls = [];
    const document = {};
    const window = {};
    let scrollTop = 0;
    let scroll;
    const classes = new Map();
    function $(selector) {
        const key = selector === document ? 'document' : selector === window ? 'window' : selector;
        const api = {
            ready(callback) { callback($); return api; },
            width() { return width; },
            height() { return key === '.navbar-custom' ? 80 : 300; },
            scrollTop() { return scrollTop; },
            on(event, data, callback) { scroll = callback.bind(data); return api; },
            hasClass(name) { return (classes.get(key) || new Set()).has(name); }
        };
        for (const method of ['wrap', 'addClass', 'removeClass', 'show']) {
            api[method] = value => {
                calls.push([key, method, value]);
                const set = classes.get(key) || new Set();
                if (method === 'addClass' || method === 'removeClass') {
                    for (const name of value.split(' ')) {
                        if (method === 'addClass') set.add(name); else set.delete(name);
                    }
                    classes.set(key, set);
                }
                return api;
            };
        }
        return api;
    }
    vm.runInNewContext(code, { $, jQuery: $, document, window }, { timeout: 1000 });
    for (scrollTop of [0, 100, 400, 200, 0]) if (scroll) scroll();
    return calls;
}

test('builds the published assets with equivalent CSS and JavaScript behavior', async t => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-assets-'));
    t.after(() => fs.rmSync(output, { recursive: true, force: true }));
    await build(output);
    const read = file => fs.readFileSync(path.join(output, file), 'utf8');
    const expanded = read('css/hux-blog.css');
    const compressed = read('css/hux-blog.min.css');
    const js = read('js/hux-blog.min.js');
    for (const content of [expanded, compressed, js]) {
        assert.match(content, /^\/\*!\n \* Muting Blog v/);
        assert.equal(content.match(/\* Muting Blog v/g).length, 1);
    }
    const normalize = css => {
        const result = new CleanCSS({ rebase: false, level: 2 }).minify(css);
        assert.deepEqual(result.errors, []);
        return result.styles;
    };
    assert.equal(normalize(expanded), normalize(compressed));
    assert.ok(compressed.length < expanded.length);
    assert.match(expanded, /font-size: 16px/);
    assert.match(expanded, /font-family:[\s\S]*-apple-system[\s\S]*BlinkMacSystemFont[\s\S]*Helvetica Neue/);
    const original = fs.readFileSync(path.join(root, 'js/hux-blog.js'), 'utf8');
    for (const width of [375, 1440]) assert.deepEqual(effects(js, width), effects(original, width));
    assert.match(js, /Licensed under Apache 2\.0/);
    const first = [expanded, compressed, js];
    await build(output);
    assert.deepEqual(['css/hux-blog.css', 'css/hux-blog.min.css', 'js/hux-blog.min.js'].map(read), first);
});
