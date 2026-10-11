import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { build } from '../site/build.mjs';
import { slugify, formatFrenchDate } from '../site/lib/content.mjs';
import {
  convertDocxToMarkdown,
  detectDocumentType,
  extractDocxUrls,
  parseDateFromString,
  parseIssueForm,
  processIssue,
  typeFromFormAnswer,
} from '../scripts/process-issue-docx.mjs';
import { parseFeed, parseTagsFromCaption } from '../scripts/sync-instagram.mjs';

function tempDir(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'apeco-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function minimalDocx(paragraphs) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('');
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('build renders every page, asset and collection item', (t) => {
  const out = tempDir(t);
  build({ outDir: out, today: '2025-10-01' });

  for (const page of [
    'index.html',
    'statuts.html',
    'activites.html',
    'adhesion.html',
    'contact.html',
    'nouvelles.html',
    'evenements/2025-11-15-cafe-des-parents-automne.html',
    'pv/2025-08-25-pv-ag-constitutive.html',
    'static/css/style.css',
    'static/js/main.js',
    'static/images/logo.svg',
    'static/docs/Statuts_APECO_Voirets_Aout_2025.pdf',
  ]) {
    assert.ok(existsSync(path.join(out, page)), `${page} exists`);
    assert.ok(statSync(path.join(out, page)).size > 0, `${page} is not empty`);
  }
  assert.ok(existsSync(path.join(out, '.nojekyll')));

  const read = (p) => readFileSync(path.join(out, p), 'utf8');
  const index = read('index.html');
  assert.match(index, /APECO Voirets/);
  assert.match(index, /Devenir membre/);
  assert.match(index, /FAPEO/);
  assert.match(index, /Café des parents d’automne|Café des parents d'automne/);
  assert.doesNotMatch(index, /\{\{/, 'no unreplaced placeholders');

  const statuts = read('statuts.html');
  assert.match(statuts, /Art\. 1 :/);
  assert.match(statuts, /Art\. 14 :/);
  assert.match(statuts, /Procès-verbal/);

  const adhesion = read('adhesion.html');
  assert.match(adhesion, /20 CHF/);
  assert.match(adhesion, /BCGE/);
});

test('upcoming and past events are split on the build date', (t) => {
  const out = tempDir(t);
  build({ outDir: out, today: '2025-12-01' });
  const activites = readFileSync(path.join(out, 'activites.html'), 'utf8');
  const [upcoming, past] = activites.split('Activités passées');
  assert.match(upcoming, /Marmite de l'Escalade/);
  assert.match(past, /Café des parents d'automne/);
});

test('links in collection pages resolve from their subdirectory', (t) => {
  const out = tempDir(t);
  build({ outDir: out, today: '2025-10-01' });
  const html = readFileSync(path.join(out, 'nouvelles/2025-08-25-assemblee-constitutive.html'), 'utf8');
  assert.match(html, /href="\.\.\/statuts\.html"/);
  assert.match(html, /href="\.\.\/static\/css\/style\.css"/);
  assert.doesNotMatch(html, /href="\/static/);
});

test('slugify and French dates', () => {
  assert.equal(slugify('Café des Parents 2025 !'), 'cafe-des-parents-2025');
  assert.equal(slugify("Procès-verbal d'AG"), 'proces-verbal-dag');
  assert.equal(formatFrenchDate('2025-08-25'), '25 août 2025');
  assert.equal(formatFrenchDate(new Date('2025-12-01T00:00:00Z')), '1 décembre 2025');
});

test('date parsing', () => {
  assert.equal(parseDateFromString('Réunion du 2025-11-20 au cycle'), '2025-11-20');
  assert.equal(parseDateFromString('Séance du 15.09.2025'), '2025-09-15');
  assert.equal(parseDateFromString('Séance du 5.9.2025'), '2025-09-05');
  assert.equal(parseDateFromString('2025-02-31'), null);
  assert.equal(parseDateFromString('pas de date'), null);
});

test('document classification', () => {
  assert.equal(detectDocumentType('Invitation Café des Parents', [], ''), 'event');
  assert.equal(detectDocumentType('Procès-verbal réunion comité', [], ''), 'pv');
  assert.equal(detectDocumentType('PV Assemblée Générale', [], ''), 'pv');
  assert.equal(detectDocumentType('Divers', ['event'], ''), 'event');
  assert.equal(detectDocumentType('Divers', ['pv'], ''), 'pv');
  assert.equal(typeFromFormAnswer('Procès-verbal / Compte-rendu de réunion (Meeting report / PV)'), 'pv');
  assert.equal(typeFromFormAnswer('Événement futur (Upcoming event)'), 'event');
  assert.equal(typeFromFormAnswer('Actualité / Article général (News)'), 'news');
});

test('issue form parsing and attachment links', () => {
  const body = [
    '### Type de document',
    '',
    'Procès-verbal / Compte-rendu de réunion (Meeting report / PV)',
    '',
    '### Date concernée',
    '',
    '2025-11-20',
    '',
    '### Document Word (.docx)',
    '',
    '[pv.docx](https://github.com/user-attachments/files/123/pv.docx)',
    '',
    '### Précisions utiles (Lieu, horaires, résumé)',
    '',
    '_No response_',
  ].join('\n');
  const form = parseIssueForm(body);
  assert.equal(form['Date concernée'], '2025-11-20');
  assert.equal(form['Précisions utiles (Lieu, horaires, résumé)'], '');
  assert.deepEqual(extractDocxUrls(form['Document Word (.docx)']), [
    { label: 'pv.docx', url: 'https://github.com/user-attachments/files/123/pv.docx' },
  ]);
});

test('docx conversion', async () => {
  const md = await convertDocxToMarkdown(
    await minimalDocx(['Compte-rendu de reunion', "Discussion relative aux activites scolaires et aux projets d'eleves."])
  );
  assert.match(md, /Compte-rendu de reunion/);
  assert.match(md, /Discussion relative aux activites scolaires/);
});

test('processIssue writes a page from the form answers', async (t) => {
  const root = tempDir(t);
  const docx = await minimalDocx(['Texte du PV.']);
  const event = {
    issue: {
      number: 7,
      title: '[Publication] : AG "ordinaire": bilan',
      labels: [{ name: 'document' }],
      body: '### Type de document\n\nProcès-verbal / Compte-rendu\n\n### Date concernée\n\n2025-11-20\n\n### Document Word (.docx)\n\nhttps://github.com/user-attachments/files/1/pv.docx',
    },
  };
  const result = await processIssue(event, { root, fetchDocx: async () => docx });
  assert.equal(result.type, 'pv');
  assert.equal(result.file, path.join('content', 'pv', '2025-11-20-ag-ordinaire-bilan.md'));
  const written = readFileSync(path.join(root, result.file), 'utf8');
  assert.match(written, /^title: "AG \\"ordinaire\\": bilan"$/m);
  assert.match(written, /Texte du PV\./);
});

test('instagram tags and feed parsing', () => {
  assert.deepEqual(parseTagsFromCaption('Un super moment au cycle ! #apeco #voirets #genève'), ['#apeco', '#voirets', '#genève']);
  const posts = parseFeed(`<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>t</title><description>&lt;p&gt;Rentrée #apeco&lt;/p&gt;</description>
    <link>https://www.instagram.com/p/abc/</link><guid>abc</guid><pubDate>Thu, 18 Sep 2025 10:00:00 GMT</pubDate></item>
  </channel></rss>`);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].caption, 'Rentrée #apeco');
  assert.equal(posts[0].date, '2025-09-18');
  assert.deepEqual(posts[0].tags, ['#apeco']);
});
