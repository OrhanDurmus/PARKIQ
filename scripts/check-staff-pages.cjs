const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const pages = ['staff/index.html', 'staff/permissions/index.html', 'staff/capabilities/index.html'];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotapark-staff-check-'));
try {
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(([, attrs, body]) => !/\bsrc\s*=/.test(attrs) && body.trim());
    if (!scripts.length) throw new Error(page + ': no inline scripts found');
    scripts.forEach(([, , body], index) => {
      const file = path.join(dir, 'staff-' + index + '.mjs');
      fs.writeFileSync(file, body);
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    });
    console.log(page + ': ' + scripts.length + ' script(s) syntax valid');
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
