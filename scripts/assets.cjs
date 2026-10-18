'use strict';

const fs = require('node:fs');
const path = require('node:path');
const less = require('less');
const UglifyJS = require('uglify-js');
const CleanCSS = require('clean-css');
const pkg = require('../package.json');

const root = path.resolve(__dirname, '..');
// The theme's asset names differ from the npm package name.
const asset = 'hux-blog';

async function build(outputRoot = root) {
    const banner = `/*!\n * ${pkg.title} v${pkg.version} (${pkg.homepage})\n * Copyright ${new Date().getFullYear()} ${pkg.author}\n */\n`;
    const js = UglifyJS.minify(fs.readFileSync(path.join(root, 'js', `${asset}.js`), 'utf8'), {
        output: { comments: /^!/ }
    });
    if (js.error) throw js.error;
    const filename = path.join(root, 'less', `${asset}.less`);
    const css = await less.render(fs.readFileSync(filename, 'utf8'), {
        filename,
        paths: [path.join(root, 'css')],
        // Retain Less 3 arithmetic behavior for the existing theme.
        math: 'always'
    });
    const minified = new CleanCSS({ rebase: false }).minify(css.css);
    if (minified.errors.length) throw new Error(minified.errors.join('\n'));
    // Finish compilation before replacing any output files.
    const outputs = {
        [`js/${asset}.min.js`]: js.code + '\n',
        [`css/${asset}.css`]: css.css,
        [`css/${asset}.min.css`]: minified.styles + '\n'
    };
    for (const [file, content] of Object.entries(outputs)) {
        const target = path.join(outputRoot, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, banner + content);
    }
    console.log('Built hux-blog JavaScript and CSS.');
}

function watch() {
    let timer;
    let running = false;
    let pending = false;
    async function rebuild() {
        pending = true;
        if (running) return;
        running = true;
        while (pending) {
            pending = false;
            try { await build(); }
            catch (error) { console.error(error.message); }
        }
        running = false;
    }
    const watchers = ['js', 'less'].map(directory => fs.watch(
        path.join(root, directory), { recursive: true }, (_event, filename) => {
            if (!filename) return;
            if (directory === 'js' && filename !== `${asset}.js`) return;
            if (directory === 'less' && !filename.endsWith('.less')) return;
            clearTimeout(timer);
            timer = setTimeout(rebuild, 100);
        }
    ));
    function close() {
        clearTimeout(timer);
        watchers.forEach(watcher => watcher.close());
    }
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    console.log('Watching js/hux-blog.js and less/**/*.less.');
}

if (require.main === module) {
    build().then(() => {
        if (process.argv.includes('--watch')) watch();
    }).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { build };
