import crypto from 'node:crypto';
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
const OPN = path.resolve('node_modules/@reyka/openpolotno/src');
// Targets: (none) = Claude artifact → dist/ ; "web" = Firebase website → dist-web/ ; "webtest" = web with a fake Firebase
const TARGET = process.argv[2] || 'artifact';
const WEB = TARGET === 'web' || TARGET === 'webtest';
const OUT = TARGET === 'artifact' ? 'dist' : TARGET === 'web' ? 'dist-web' : 'dist-webtest';
const FAKE_FB = path.resolve('test/fake-firebase');
const common = {
  bundle: true, target: ['es2020'], jsx: 'automatic', legalComments: 'none', logLevel: 'warning',
  minify: !process.env.NOMIN,
  loader: { '.js': 'jsx', '.ts': 'ts', '.tsx': 'tsx', '.svg': 'dataurl', '.png': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.eot': 'dataurl', '.txt': 'text' },
  alias: {
    opn: OPN,
    '@platform': path.resolve(WEB ? 'src/web/platform.js' : 'src/platform-none.js'),
    ...(TARGET === 'webtest' ? {
      'firebase/app': FAKE_FB + '/app.js', 'firebase/auth': FAKE_FB + '/auth.js',
      'firebase/firestore': FAKE_FB + '/firestore.js', 'firebase/database': FAKE_FB + '/database.js',
    } : {}),
  },
  define: { 'process.env.NODE_ENV': '"production"', global: 'window', __TARGET__: JSON.stringify(WEB ? 'web' : 'artifact'), __FAKE_FB__: TARGET === 'webtest' ? 'true' : 'false',
    // The Claude artifact cannot see its own claude.ai address; only that build needs it (for magic links).
    __ARTIFACT_URL__: JSON.stringify(WEB ? '' : (process.env.ARTIFACT_URL || 'https://claude.ai/artifact/3S8SK1e9ZDr6SJZUHNcMvd')) },
};
fs.mkdirSync('build', { recursive: true });
// 1) standalone player embedded into exported presentations
await esbuild.build({ ...common, entryPoints: ['src/export-entry.js'], outfile: 'build/player.txt', format: 'iife' });
// 2) the app
await esbuild.build({ ...common, entryPoints: { app: 'src/main.jsx' }, outdir: OUT, format: 'iife' });
// A content hash in the file links, so browsers load the new version right after each deploy.
const ver = (f) => crypto.createHash('sha1').update(fs.readFileSync(`${OUT}/${f}`)).digest('hex').slice(0, 10);
fs.writeFileSync(`${OUT}/index.html`, `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Morph — slide editor</title>
${WEB ? '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23d3e3fd%22/%3E%3Cpath d=%22M8 22 L14 14 L18 18 L24 10%22 stroke=%22%230b57d0%22 stroke-width=%223%22 fill=%22none%22 stroke-linecap=%22round%22/%3E%3C/svg%3E">' : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="app.css?v=${ver('app.css')}">
</head>
<body>
<div id="root"></div>
<script src="app.js?v=${ver('app.js')}"></script>
</body>
</html>
`);
// 3) MathJax for the equation editor, loaded only when the Equation panel opens.
fs.mkdirSync(`${OUT}/mathjax/input/tex/extensions`, { recursive: true });
fs.copyFileSync('node_modules/mathjax/es5/tex-svg-full.js', `${OUT}/mathjax/tex-svg-full.js`);
fs.copyFileSync('node_modules/mathjax/es5/input/tex/extensions/physics.js', `${OUT}/mathjax/input/tex/extensions/physics.js`);
if (WEB) fs.writeFileSync(`${OUT}/.nojekyll`, '');
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log(TARGET, '| player', kb('build/player.txt'), '| app.js', kb(`${OUT}/app.js`), '| app.css', kb(`${OUT}/app.css`));
