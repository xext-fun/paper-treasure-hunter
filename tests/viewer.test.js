import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { parseKeywords, formatTerm, validateLibrary } from '../highlight/keyword-manager.js';

const root = resolve('.');
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.pdf':'application/pdf' };

test('literal and regex terms parse with case insensitive matching', () => {
  const terms = parseKeywords('intellectual property\nTermination :: /\\bterminat(?:e|ed|ion)\\b/i');
  assert.equal(terms[0].regex.test('INTELLECTUAL PROPERTY'), true);
  assert.equal(terms[1].regex.test('terminated'), true);
});

test('built-in term library covers dates, time, durations and legal variants', async () => {
  const library = validateLibrary(JSON.parse(await readFile(resolve(root, 'terms/default-terms.json'), 'utf8')));
  const terms = parseKeywords(library.groups.flatMap(group => group.terms.map(formatTerm)).join('\n'));
  const byName = name => terms.find(term => term.label === name).regex;
  assert.ok(byName('Dates').test('November 6, 2026'));
  assert.ok(byName('Times').test('10:30 AM'));
  assert.ok(byName('Durations').test('30 days'));
  assert.ok(byName('Termination').test('terminated'));
  assert.ok(byName('Intellectual property').test('INTELLECTUAL PROPERTY'));
});

test('multi-page PDF rendering, highlighting, navigation and clear', async () => {
  const server = createServer(async (req, res) => {
    try {
      const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
      if (!path.startsWith(root + '/')) throw new Error('Invalid path');
      const data = await readFile(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless:true, executablePath: chromium.executablePath() });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.chrome = { storage: { local: { get: async () => ({}), set: async () => {} } } }; });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/pdf/viewer.html`);
    await page.locator('#file').setInputFiles(resolve(root, 'fixtures/multi-page-text.pdf'));
    await page.waitForFunction(() => document.querySelectorAll('.page').length === 2 && document.querySelector('#status').textContent.startsWith('Ready'));
    assert.equal(await page.locator('#total-pages').textContent(), '2');
    const originalText = await page.locator('.page .textLayer').allTextContents();
    await page.locator('#keywords').fill('termination\nintellectual property\nArbitration :: /\\barbitrat(?:ion|ed)\\b/i\nDates :: /\\bNovember\\s+6,\\s+2026\\b/i\n$10,000');
    await page.locator('#highlight').click();
    await page.waitForFunction(() => Number(document.querySelector('#match-total').textContent) >= 7);
    const total = Number(await page.locator('#match-total').textContent());
    assert.ok(total >= 7, `Expected at least 7 matches, got ${total}`);
    const rows = await page.locator('#match-list li').allTextContents();
    assert.ok(rows.some(row => /intellectualproperty2$/i.test(row.replace(/\s+/g, ''))), `Split phrase count missing: ${rows}`);
    assert.ok(rows.some(row => /Termination2$/i.test(row.replace(/\s+/g, ''))), `Termination count missing: ${rows}`);
    assert.ok(await page.locator('.page:nth-of-type(2) mark.ht-highlight').count() >= 2);
    await page.locator('#highlight').click();
    assert.equal(Number(await page.locator('#match-total').textContent()), total);
    assert.ok(await page.locator('mark.ht-current').count() >= 1);
    await page.locator('#next').click();
    assert.ok(await page.locator('mark.ht-current').count() >= 1);
    await page.locator('#zoom-in').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('matches found'));
    assert.equal(Number(await page.locator('#match-total').textContent()), total);
    await page.locator('#clear').click();
    assert.equal(await page.locator('mark.ht-highlight').count(), 0);
    assert.equal(await page.locator('#match-total').textContent(), '0');
    assert.deepEqual(await page.locator('.page .textLayer').allTextContents(), originalText);
    await page.locator('#highlight').click();
    assert.equal(Number(await page.locator('#match-total').textContent()), total);
    await page.locator('#url').fill(`http://127.0.0.1:${server.address().port}/fixtures/multi-page-text.pdf`);
    await page.locator('#open-url').click();
    await page.waitForFunction(() => document.querySelectorAll('.page').length === 2 && document.querySelector('#status').textContent.startsWith('Ready'));
    await page.locator('#file').setInputFiles(resolve(root, 'fixtures/image-only.pdf'));
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'This PDF does not contain selectable text. OCR support is required.', { timeout: 5000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
