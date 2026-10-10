// 번역 사전 빌드 — i18n/common.json, i18n/pages/<파일명>.json을 원본으로
// 브라우저가 <script>로 읽는 .dict.js 파일을 생성합니다. 사전(.json)을 고친 뒤 실행하세요.
//   node i18n/build.js
const fs = require('fs'), path = require('path');
const dir = __dirname;
const compact = f => JSON.stringify(JSON.parse(fs.readFileSync(f, 'utf8')));

fs.writeFileSync(path.join(dir, 'common.dict.js'),
  'window.I18N_COMMON = ' + compact(path.join(dir, 'common.json')) + ';\n');

const pagesDir = path.join(dir, 'pages');
let n = 0;
for (const f of fs.readdirSync(pagesDir).filter(f => f.endsWith('.json'))) {
  fs.writeFileSync(path.join(pagesDir, f.replace(/\.json$/, '.dict.js')),
    'window.I18N_PAGE = ' + compact(path.join(pagesDir, f)) + ';\n');
  n++;
}
console.log('common + ' + n + ' pages built');
