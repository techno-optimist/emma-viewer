// Headless-browser tests. The viewer is loaded from file:// and from a local
// http server. Every request the page makes is counted; opening a fixture must
// make none. Needs the Playwright dev dependency: npm install.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { manifest, vectorsDir, viewerPath, viewerHTML, sha256, loadCore } from './helpers.mjs';

const core = loadCore();
const current = manifest();
const openable = current.vectors.filter(v => v.expect === 'open');
const refused = current.vectors.filter(v => v.expect !== 'open');
let browser, server, serverHits = [];
const fileURL = pathToFileURL(viewerPath).href;
let httpURL;

before(async () => {
  browser = await chromium.launch();
  server = http.createServer((request, response) => {
    serverHits.push(request.url);
    if (request.url === '/emma-viewer.html') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(viewerHTML()); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  httpURL = `http://127.0.0.1:${server.address().port}/emma-viewer.html`;
});
after(async () => { await browser?.close(); server?.close(); });

async function openPage(url, options = {}) {
  const context = await browser.newContext({ acceptDownloads: true, ...options });
  const page = await context.newPage();
  const requests = [], consoleErrors = [], downloads = [];
  page.on('request', request => { if (request.url() !== url) requests.push(request.url()); });
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  page.on('download', download => downloads.push(download));
  await page.goto(url);
  return { context, page, requests, consoleErrors, downloads };
}
const externalRequests = requests => requests.filter(u => !u.startsWith('blob:') && !u.startsWith('data:'));

async function unlock(page, vector) {
  await page.setInputFiles('#file-input', join(vectorsDir, vector.file));
  await page.waitForSelector('#facts-panel:not([hidden])', { timeout: 10000 });
  await page.fill('#passphrase', vector.passphrase);
  await page.click('#unlock-button');
}

for (const url of ['file', 'http']) {
  for (const vector of openable) {
    test(`${url}: ${vector.file} opens with zero requests and matching plain copy`, async () => {
      serverHits = [];
      const { context, page, requests, consoleErrors, downloads } = await openPage(url === 'file' ? fileURL : httpURL);
      try {
        await unlock(page, vector);
        await page.waitForSelector('#vault-panel:not([hidden])', { timeout: 30000 });
        assert.equal(await page.locator('#memories article.memory').count(), vector.counts.memories, 'memory cards');
        assert.equal(await page.locator('#removed article.memory').count(), vector.counts.removed, 'removed cards');
        assert.equal(await page.locator('#people li').count(), vector.counts.people, 'people');
        assert.equal(await page.locator('#documents section.document').count(), vector.counts.identityDocuments, 'documents');
        assert.equal(await page.locator('#passphrase').inputValue(), '', 'passphrase field cleared after unlock');
        assert.equal(await page.locator('#progress').isVisible(), false, 'progress indicator hidden after unlock');
        assert.equal(await page.locator('#pick-panel').isVisible(), false, 'file chooser steps aside while reading');
        if (vector.kind === 'legacy') assert.match(await page.locator('#notices').textContent(), /Legacy EMMA 1\.0 file\. Its header was not authenticated/);
        if (vector.file === 'web-v3.emma') {
          assert.equal(await page.locator('#memories img[src^="blob:"]').count(), 1);
          assert.equal(await page.locator('#memories audio[src^="blob:"]').count(), 1);
          assert.equal(await page.locator('#memories video[src^="blob:"]').count(), 1);
          const exact = page.locator('#memories article.memory', { hasText: 'Exactness check' }).locator('.text');
          const opened = await core.open(new Uint8Array(readFileSync(join(vectorsDir, vector.file))), vector.passphrase);
          const expected = opened.reading.memories.find(m => m.title === 'Exactness check').text;
          assert.equal(await exact.evaluate(node => node.textContent), expected, 'text is byte-exact in the DOM');
          assert.equal(await page.locator('#removed-section').evaluate(node => node.open), false, 'Trash starts collapsed');
          assert.match(await page.locator('#removed-summary').textContent(), /Removed by the owner \(1\)/);
        }
        if (vector.file === 'native-v5.emma') {
          const pills = await page.locator('#memories .pill').allTextContents();
          for (const label of ['Then', 'Now', 'Someday', 'Aspiration, not prediction', 'agent-assisted', 'Written by Mira Fixture', 'Written by family', "Another person's words"]) assert.ok(pills.includes(label), label);
          assert.equal(await page.locator('#memories h3').count(), 0, 'no generated mirror titles');
        }
        // Plain copy: two downloads, byte-exact plaintext and the recorded reading.
        await page.click('#export-button');
        const deadline = Date.now() + 15000;
        while (downloads.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(downloads.length, 2, 'two downloads');
        const byName = {};
        for (const download of downloads) byName[download.suggestedFilename()] = readFileSync(await download.path());
        assert.equal(sha256(byName['vault.json']), vector.sha256.plaintext, 'vault.json is the decrypted payload byte for byte');
        assert.equal(sha256(byName['memories.md']), vector.sha256.reading, 'memories.md is the recorded canonical reading');
        // Close: nothing left on screen.
        await page.click('#close-button');
        await page.waitForSelector('#vault-panel[hidden]', { state: 'attached' });
        assert.equal(await page.locator('#memories article').count(), 0);
        assert.equal(await page.locator('#pick-panel').isVisible(), true, 'file chooser is back after closing');
        assert.deepEqual(externalRequests(requests), [], 'no network requests');
        if (url === 'http') assert.deepEqual(serverHits, ['/emma-viewer.html'], 'the server saw only the page itself');
        assert.deepEqual(consoleErrors, [], 'no console errors or CSP violations');
      } finally { await context.close(); }
    });
  }
}

for (const vector of refused) {
  test(`file: ${vector.file} is refused with the fixed sentence (${vector.expect})`, async () => {
    const { context, page, requests, consoleErrors } = await openPage(fileURL);
    try {
      await page.setInputFiles('#file-input', join(vectorsDir, vector.file));
      if (vector.expect === 'notEmma') {
        await page.waitForSelector('#file-error:not([hidden])', { timeout: 10000 });
        assert.equal(await page.locator('#file-error').textContent(), core.ERRORS.notEmma);
        assert.equal(await page.locator('#facts-panel').isHidden(), true, 'no passphrase prompt for a refused header');
      } else {
        await page.waitForSelector('#facts-panel:not([hidden])', { timeout: 10000 });
        await page.fill('#passphrase', vector.passphrase);
        await page.click('#unlock-button');
        await page.waitForSelector('#unlock-error:not([hidden])', { timeout: 30000 });
        assert.equal(await page.locator('#unlock-error').textContent(), core.ERRORS[vector.expect]);
      }
      assert.equal(await page.locator('#vault-panel').isHidden(), true);
      assert.equal(await page.locator('#memories article').count(), 0, 'nothing shown');
      assert.deepEqual(externalRequests(requests), []);
      assert.deepEqual(consoleErrors, []);
    } finally { await context.close(); }
  });
}

test('file: a wrong passphrase can be corrected without choosing the file again', async () => {
  const vector = openable.find(v => v.file === 'web-v3.emma');
  const { context, page } = await openPage(fileURL);
  try {
    await unlock(page, { ...vector, passphrase: 'not-the-fixture-passphrase' });
    await page.waitForSelector('#unlock-error:not([hidden])', { timeout: 30000 });
    assert.equal(await page.locator('#unlock-error').textContent(), core.ERRORS.cannotUnlock);
    await page.fill('#passphrase', vector.passphrase);
    await page.click('#unlock-button');
    await page.waitForSelector('#vault-panel:not([hidden])', { timeout: 30000 });
    assert.equal(await page.locator('#memories article.memory').count(), vector.counts.memories);
  } finally { await context.close(); }
});

test('file: the page follows the system colour scheme', async () => {
  const light = await openPage(fileURL, { colorScheme: 'light' });
  const dark = await openPage(fileURL, { colorScheme: 'dark' });
  try {
    const background = page => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    assert.notEqual(await background(light.page), await background(dark.page));
    assert.equal(await light.page.evaluate(() => getComputedStyle(document.body).fontSize), '18px');
  } finally { await light.context.close(); await dark.context.close(); }
});
