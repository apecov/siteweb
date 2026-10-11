import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { build, ROOT } from '../site/build.mjs';
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

function tempDir(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'apeco-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const FIXTURES = {
  'content/evenements/2025-11-15-cafe-des-parents.md':
    '---\ntitle: "Café des parents"\ndate: "2025-11-15"\nlocation: "Salle polyvalente"\nsummary: "Rencontre."\n---\n\nTexte.\n',
  'content/evenements/2025-12-05-escalade.md':
    '---\ntitle: "Stand de l\'Escalade"\ndate: "2025-12-05"\nsummary: "Stand."\n---\n\nTexte.\n',
  'content/nouvelles/2025-08-25-ag.md':
    '---\ntitle: "Assemblée générale"\ndate: "2025-08-25"\nsummary: "Résumé."\n---\n\nVoir les [statuts](statuts.html).\n\n<script>alert(1)</script>\n',
  'content/pv/2025-08-25-pv.md': '---\ntitle: "PV de l\'AG"\ndate: "2025-08-25"\nsummary: "PV."\n---\n\nTexte du PV.\n',
};

/** A copy of the site (pages, layout, static, data) with fixture content. */
function fixtureRoot(t, { email = '' } = {}) {
  const root = tempDir(t);
  for (const dir of ['pages', 'site', 'static', 'data']) cpSync(path.join(ROOT, dir), path.join(root, dir), { recursive: true });
  for (const [rel, text] of Object.entries(FIXTURES)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  const sitePath = path.join(root, 'data/site.json');
  const site = JSON.parse(readFileSync(sitePath, 'utf8'));
  site.contact.email = email;
  writeFileSync(sitePath, JSON.stringify(site));
  return root;
}

function buildFixture(t, options = {}) {
  const root = fixtureRoot(t, options);
  const out = path.join(root, '_site');
  build({ root, outDir: out, today: options.today || '2025-10-01' });
  return (p) => readFileSync(path.join(out, p), 'utf8');
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

test('the real site builds without sample content', (t) => {
  const out = tempDir(t);
  build({ outDir: out, today: '2025-10-01' });
  for (const page of ['index.html', 'statuts.html', 'activites.html', 'adhesion.html', 'contact.html', 'nouvelles.html']) {
    assert.ok(statSync(path.join(out, page)).size > 0, `${page} is not empty`);
  }
  for (const asset of ['static/css/style.css', 'static/js/main.js', 'static/images/logo-apecov.jpg', 'static/fonts/alegreya-sans-latin-400-normal.woff2', '.nojekyll']) {
    assert.ok(existsSync(path.join(out, asset)), `${asset} exists`);
  }
  const statuts = readFileSync(path.join(out, 'statuts.html'), 'utf8');
  assert.match(statuts, /Art\. 1 :/);
  assert.match(statuts, /Art\. 14 :/);
  assert.match(statuts, /par ¾ des membres/);
});

test('build renders pages and collection items', (t) => {
  const read = buildFixture(t);
  const index = read('index.html');
  assert.match(index, /APECO Voirets/);
  assert.match(index, /Devenir membre/);
  assert.match(index, /Café des parents/);
  assert.doesNotMatch(index, /\{\{/, 'no unreplaced placeholders');
  assert.doesNotMatch(index, /fonts\.googleapis/);
  assert.match(read('statuts.html'), /PV de l'AG/);
  assert.match(read('adhesion.html'), /20 CHF/);
  assert.match(read('pv/2025-08-25-pv.html'), /Texte du PV/);
});

test('upcoming and past events are split on the build date', (t) => {
  const read = buildFixture(t, { today: '2025-12-01' });
  const [upcoming, past] = read('activites.html').split('Activités passées');
  assert.match(upcoming, /Stand de l'Escalade/);
  assert.match(past, /Café des parents/);
});

test('links in collection pages resolve from their subdirectory', (t) => {
  const html = buildFixture(t)('nouvelles/2025-08-25-ag.html');
  assert.match(html, /href="\.\.\/statuts\.html"/);
  assert.match(html, /href="\.\.\/static\/css\/style\.css"/);
  assert.doesNotMatch(html, /href="\/static/);
});

test('raw HTML in content is escaped', (t) => {
  const html = buildFixture(t)('nouvelles/2025-08-25-ag.html');
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert/);
});

test('without a contact e-mail, mail links and forms are hidden', (t) => {
  const read = buildFixture(t);
  for (const page of ['index.html', 'contact.html', 'adhesion.html']) assert.doesNotMatch(read(page), /mailto:/, page);
  assert.match(read('contact.html'), /bientôt disponible/);
  assert.doesNotMatch(read('adhesion.html'), /membership-form/);
});

test('with a contact e-mail, forms point to it', (t) => {
  const read = buildFixture(t, { email: 'comite@example.org' });
  assert.match(read('contact.html'), /data-mailto="comite@example\.org"/);
  assert.match(read('adhesion.html'), /id="membership-form" data-mailto="comite@example\.org" data-fee="20"/);
  assert.doesNotMatch(read('adhesion.html'), /bientôt disponible/);
});

test('decorative emoji are hidden from screen readers', (t) => {
  const index = buildFixture(t)('index.html');
  assert.match(index, /<span aria-hidden="true">🤝<\/span>/);
  assert.match(index, /<span aria-hidden="true">🇨🇭<\/span>/);
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
  assert.equal(typeFromFormAnswer('Procès-verbal / Compte-rendu de réunion'), 'pv');
  assert.equal(typeFromFormAnswer('Événement à venir'), 'event');
  assert.equal(typeFromFormAnswer('Actualité / Article général'), 'news');
});

test('issue form parsing and attachment links', () => {
  const body = [
    '### Type de document',
    '',
    'Procès-verbal / Compte-rendu de réunion',
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
