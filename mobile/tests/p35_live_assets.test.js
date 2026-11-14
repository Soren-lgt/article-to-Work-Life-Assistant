// P35：页面依赖不能缺——import 目标必须存在，SW 缓存要升版
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('mobile 的每个 import 在本地都指向真实文件', () => {
  const files = walk(join(root, 'mobile', 'js'));
  const missing = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const rel = m[1];
      if (!rel.startsWith('.')) continue;
      const abs = normalize(join(dirname(f), rel));
      if (!existsSync(abs)) missing.push(relative(root, f) + ' -> ' + rel);
    }
  }
  assert.deepEqual(missing, [], '缺失的 import：' + missing.join('; '));
});

test('页面主体脚本是 ES module，入口是 main.js', () => {
  const html = readFileSync(join(root, 'mobile', 'index.html'), 'utf8');
  assert.ok(html.includes('<script type="module" src="js/main.js"></script>'));
});

test('main.js 依赖的 app 侧文件都在仓库里（线上 404 曾让整页点不动）', () => {
  const need = [
    'app/js/lib/db.js', 'app/js/appstate.js', 'app/js/lib/utils.js',
    'app/js/lib/accounts.js', 'app/js/lib/group.js', 'app/js/ui/modal.js',
    'app/js/lib/theme.js', 'app/js/lib/ledger.js', 'app/js/lib/backup.js',
    'app/js/ui/toast.js', 'app/js/lib/quizvoice.js', 'app/js/lib/quizvoiceform.js',
  ];
  for (const rel of need) {
    assert.ok(existsSync(join(root, rel)), '缺文件：' + rel);
  }
});

test('SW 缓存版本已升到 v13，手机才会丢掉旧脚本', () => {
  const sw = readFileSync(join(root, 'mobile', 'sw.js'), 'utf8');
  const ver = sw.match(/worklife-mobile-v(\d+)/);
  assert.ok(ver && Number(ver[1]) >= 13, '缓存名已升版');
  assert.equal(sw.includes("'worklife-mobile-v12'"), false, '旧版本号不再出现');
});

test('上线自检脚本存在，发布后能一条命令全量核对', () => {
  assert.ok(existsSync(join(root, 'mobile', 'tools', 'check_live.py')));
});
