import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { build, ROOT, osmUrls } from '../site/build.mjs';
import { slugify, formatFrenchDate } from '../site/lib/content.mjs';
import { eventDates, postalAddress } from '../site/lib/jsonld.mjs';
import { withGeo } from '../site/lib/geocode.mjs';
import { renderStaticMap, ensureMapImage, mapImagePath, chooseStyle } from '../site/lib/staticmap.mjs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import {
  convertDocxToMarkdown,
  detectDocumentType,
  extractDocxUrls,
  parseDateFromString,
  htmlToMarkdown,
  parseIssueForm,
  processIssue,
  typeFromFormAnswer,
} from '../scripts/process-issue-docx.mjs';

// Map previews are drawn in the keyless ÖPNVKarte style unless a Thunderforest
// key is set; keep the tests independent of the environment.
delete process.env.THUNDERFOREST_API_KEY;

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
  'content/evenements/2025-08-25-ag.md':
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

/** A 256×256 tile of one colour, as PNG bytes. */
function solidTile([r, g, b]) {
  const png = new PNG({ width: 256, height: 256 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([r, g, b, 255], i);
  return PNG.sync.write(png);
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
  for (const page of ['index.html', 'statuts.html', 'activites.html', 'adhesion.html', 'contact.html']) {
    assert.ok(statSync(path.join(out, page)).size > 0, `${page} is not empty`);
  }
  for (const asset of ['static/css/style.css', 'static/js/main.js', 'static/images/logo-apecov.jpg', 'static/fonts/alegreya-sans-latin-400-normal.woff2', '.nojekyll']) {
    assert.ok(existsSync(path.join(out, asset)), `${asset} exists`);
  }
  const statuts = readFileSync(path.join(out, 'statuts.html'), 'utf8');
  assert.match(statuts, /Art\. 1\s:/);
  assert.match(statuts, /Art\. 14\s:/);
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

test('there is no news section; the home page lists recent activities', (t) => {
  const root = fixtureRoot(t);
  const out = path.join(root, '_site');
  build({ root, outDir: out, today: '2026-01-01' });
  assert.ok(!existsSync(path.join(out, 'nouvelles.html')));
  const index = readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.doesNotMatch(index, /nouvelles\.html|Actualités/);
  const [, recent] = index.split('Activités récentes');
  assert.match(recent, /Stand de l'Escalade/);
});

test('upcoming and past events are split on the build date', (t) => {
  const read = buildFixture(t, { today: '2025-12-01' });
  const [upcoming, past] = read('activites.html').split('Activités passées');
  assert.match(upcoming, /Stand de l'Escalade/);
  assert.match(past, /Café des parents/);
});

test('links in collection pages resolve from their subdirectory', (t) => {
  const html = buildFixture(t)('evenements/2025-08-25-ag.html');
  assert.match(html, /href="\.\.\/statuts\.html"/);
  assert.match(html, /href="\.\.\/static\/css\/style\.css"/);
  assert.doesNotMatch(html, /href="\/static/);
});

test('raw HTML in content is escaped', (t) => {
  const html = buildFixture(t)('evenements/2025-08-25-ag.html');
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

test('French punctuation gets a non-breaking space', (t) => {
  const index = buildFixture(t)('index.html');
  assert.match(index, /Rejoignez l'APECO\u00a0!/);
  assert.doesNotMatch(index, / [!?;:]</);
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
  assert.equal(typeFromFormAnswer('Activité'), 'event');
  assert.equal(typeFromFormAnswer('Événement à venir'), 'event');
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

/** The body of the issue form, as GitHub renders it. */
function formBody({ type = 'Activité', date = '11.12.2026', time = '', location = '', address = '', summary = '' } = {}) {
  return [
    ['Type de document', type],
    ['Date', date],
    ['Heure', time],
    ['Lieu', location],
    ['Adresse', address],
    ['Résumé', summary],
    ['Document Word (.docx)', '[annonce.docx](https://github.com/user-attachments/files/123/annonce.docx)'],
  ]
    .map(([label, value]) => `### ${label}\n\n${value || '_No response_'}`)
    .join('\n\n');
}

const ANNONCE = readFileSync(new URL('./fixtures/annonce.docx', import.meta.url));

test('a Word announcement becomes an activity page', async (t) => {
  const root = tempDir(t);
  const issue = {
    number: 42,
    title: "[Publication] : Stand de l'Escalade 2026",
    labels: [],
    body: formBody({ time: '16h00', location: 'Préau du CO des Voirets', address: 'Chemin des Voirets 22, 1228 Plan-les-Ouates' }),
  };
  const looked = [];
  const result = await processIssue(
    { issue },
    {
      root,
      fetchDocx: async () => ANNONCE,
      geocodeAddress: async (a) => (looked.push(a), { lat: 46.172859, lon: 6.116828 }),
      fetchTileImpl: async () => solidTile([200, 200, 200]),
    }
  );
  assert.equal(result.type, 'event');
  assert.equal(result.page, 'evenements/2026-12-11-stand-de-lescalade-2026.html');
  assert.deepEqual(looked, ['Chemin des Voirets 22, 1228 Plan-les-Ouates']);

  const { data, content } = (await import('gray-matter')).default(readFileSync(path.join(root, result.file), 'utf8'));
  assert.equal(data.title, "Stand de l'Escalade 2026");
  assert.equal(data.date, '2026-12-11');
  assert.equal(data.time, '16h00');
  assert.equal(data.location, 'Préau du CO des Voirets');
  assert.equal(data.address, 'Chemin des Voirets 22, 1228 Plan-les-Ouates');
  assert.deepEqual(data.geo, { lat: 46.172859, lon: 6.116828 });
  assert.ok(existsSync(path.join(root, 'static/images/cartes/46.172859_6.116828-opnvkarte.jpg')), 'map preview written');
  assert.equal(data.source_issue, '#42');
  // Salutation skipped; first real sentence used.
  assert.match(data.summary, /^L'APECO Voirets tiendra un stand/);
  // The heading repeating the title is dropped, others are demoted below the page h1.
  assert.doesNotMatch(content, /Stand de l'Escalade 2026/);
  assert.match(content, /^### Au programme$/m);
  assert.match(content, /^- +Soupe aux légumes ;$/m);
  assert.match(content, /^\| Heure \| Quoi \|$/m);
  assert.match(content, /^\| 17h30 \| Casse de la marmite \|$/m);
  assert.match(content, /!\[Affiche\]\(static\/images\/documents\/issue-42-1\.png\)/);
  assert.ok(existsSync(path.join(root, 'static/images/documents/issue-42-1.png')));
});

test('a form summary wins over the first paragraph', async (t) => {
  const root = tempDir(t);
  const issue = { number: 5, title: 'Escalade', labels: [], body: formBody({ summary: 'Stand de fin\nde trimestre.' }) };
  const result = await processIssue({ issue }, { root, fetchDocx: async () => ANNONCE });
  assert.match(readFileSync(path.join(root, result.file), 'utf8'), /^summary: "Stand de fin de trimestre\."$/m);
  assert.doesNotMatch(readFileSync(path.join(root, result.file), 'utf8'), /^(time|location):/m, 'empty fields are left out');
});

test('editing an issue replaces its page and images', async (t) => {
  const root = tempDir(t);
  const publish = (title, date) =>
    processIssue({ issue: { number: 42, title, labels: [], body: formBody({ date }) } }, { root, fetchDocx: async () => ANNONCE });
  const first = await publish("Stand de l'Escalade 2026", '11.12.2026');
  const second = await publish("Stand de l'Escalade", '12.12.2026');
  assert.ok(!existsSync(path.join(root, first.file)));
  assert.ok(existsSync(path.join(root, second.file)));
  const { readdirSync } = await import('node:fs');
  assert.deepEqual(readdirSync(path.join(root, 'content/evenements')), ['2026-12-12-stand-de-lescalade.md']);
  assert.deepEqual(readdirSync(path.join(root, 'static/images/documents')), ['issue-42-1.png']);
});

test('the published activity page renders the table and image', async (t) => {
  const root = fixtureRoot(t);
  const result = await processIssue(
    { issue: { number: 42, title: "Stand de l'Escalade 2026", labels: [], body: formBody({ time: '16h00' }) } },
    { root, fetchDocx: async () => ANNONCE }
  );
  build({ root, outDir: path.join(root, '_site'), today: '2026-10-11' });
  const html = readFileSync(path.join(root, '_site', result.page), 'utf8');
  assert.match(html, /<table>/);
  assert.match(html, /<img src="\.\.\/static\/images\/documents\/issue-42-1\.png" alt="Affiche">/);
  assert.match(html, /⏰<\/span> 16h00/);
  assert.match(readFileSync(path.join(root, '_site/activites.html'), 'utf8'), /Stand de l'Escalade 2026/);
});

test('Word tables without header row, multi-paragraph cells', () => {
  const md = htmlToMarkdown('<table><tr><td><p>A</p></td><td><p>B</p></td></tr><tr><td><p>1</p><p>2</p></td><td><p>x</p></td></tr></table>');
  assert.equal(md.replace(/ +\|/g, ' |'), '| A | B |\n| --- | --- |\n| 1 2 | x |');
});

function jsonLd(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

test('activity pages carry schema.org Event JSON-LD in the head', (t) => {
  const root = fixtureRoot(t);
  writeFileSync(
    path.join(root, 'content/evenements/2026-01-19-table-ronde.md'),
    [
      '---',
      'title: "Table ronde </script><b>"',
      'date: "2026-01-19"',
      'time: "19h30 - 21h"',
      'location: "MQ sous l\'Étoile"',
      'address: "Avenue des Communes-Réunies 73, 1212 Grand-Lancy"',
      'performer: "Marc-André Müller"',
      'co_organizers: [{ "name": "FAPEO", "url": "https://www.fapeo.ch/" }]',
      'summary: "Rencontre."',
      '---',
      '',
      '![Affiche](static/images/evenements/affiche.jpg)',
      '',
    ].join('\n')
  );
  const out = path.join(root, '_site');
  build({ root, outDir: out, today: '2026-10-11' });
  const html = readFileSync(path.join(out, 'evenements/2026-01-19-table-ronde.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.equal((head.match(/application\/ld\+json/g) || []).length, 1, 'JSON-LD is in the head');
  assert.doesNotMatch(head, /<\/script><b>/, 'values cannot close the script element');

  const data = jsonLd(head);
  assert.equal(data['@context'], 'https://schema.org');
  assert.equal(data['@type'], 'Event');
  assert.equal(data.name, 'Table ronde </script><b>');
  assert.equal(data.startDate, '2026-01-19T19:30:00+01:00');
  assert.equal(data.endDate, '2026-01-19T21:00:00+01:00');
  assert.deepEqual(data.location, {
    '@type': 'Place',
    name: "MQ sous l'Étoile",
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Avenue des Communes-Réunies 73',
      postalCode: '1212',
      addressLocality: 'Grand-Lancy',
      addressRegion: 'GE',
      addressCountry: 'CH',
    },
  });
  assert.deepEqual(data.organizer.map((o) => o.name), ['APECO Voirets', 'FAPEO']);
  assert.equal(data.performer.name, 'Marc-André Müller');
  assert.equal(data.image, 'https://www.apecov.ch/static/images/evenements/affiche.jpg');
  assert.equal(data.url, 'https://www.apecov.ch/evenements/2026-01-19-table-ronde.html');
  assert.match(head, /<link rel="canonical" href="https:\/\/www\.apecov\.ch\/evenements\/2026-01-19-table-ronde\.html">/);

  // Only activity pages: not the PV, not the top-level pages.
  assert.equal(jsonLd(readFileSync(path.join(out, 'pv/2025-08-25-pv.html'), 'utf8')), null);
  assert.equal(jsonLd(readFileSync(path.join(out, 'activites.html'), 'utf8')), null);
});

test('event times and addresses', () => {
  assert.deepEqual(eventDates('2026-07-01', '16h00 - 18h30'), {
    startDate: '2026-07-01T16:00:00+02:00',
    endDate: '2026-07-01T18:30:00+02:00',
  });
  assert.deepEqual(eventDates('2026-12-11', '9h'), { startDate: '2026-12-11T09:00:00+01:00' });
  assert.deepEqual(eventDates('2026-12-11', 'en soirée'), { startDate: '2026-12-11' });
  assert.deepEqual(eventDates('2026-12-11', ''), { startDate: '2026-12-11' });
  assert.equal(postalAddress('Rue sans NPA').streetAddress, 'Rue sans NPA');
});

test('activities with coordinates get a click-to-load OpenStreetMap map', (t) => {
  const root = fixtureRoot(t);
  const page = (name, extra) =>
    writeFileSync(
      path.join(root, 'content/evenements', name),
      ['---', 'title: "Café"', 'date: "2026-01-19"', 'location: "CO des Voirets"', ...extra, '---', '', 'Texte.', ''].join('\n')
    );
  page('2026-01-19-avec-carte.md', ['address: "Chemin des Voirets 22, 1228 Plan-les-Ouates"', 'geo: { "lat": 46.172859, "lon": 6.116828 }']);
  page('2026-01-20-sans-coordonnees.md', ['address: "Chemin des Voirets 22, 1228 Plan-les-Ouates"']);
  page('2026-01-21-sans-adresse.md', []);
  const out = path.join(root, '_site');
  build({ root, outDir: out, today: '2026-10-11' });
  const read = (p) => readFileSync(path.join(out, 'evenements', p), 'utf8');

  const html = read('2026-01-19-avec-carte.html');
  const { embed, page: osmPage } = osmUrls({ lat: 46.172859, lon: 6.116828 });
  assert.match(html, /<h2>Lieu<\/h2>/);
  assert.ok(html.includes(`data-map-src="${embed.replaceAll('&', '&amp;')}"`));
  assert.ok(html.includes(`href="${osmPage.replaceAll('&', '&amp;')}"`));
  assert.match(embed, /marker=46\.172859,6\.116828/);
  // Nothing is loaded from openstreetmap.org until the visitor clicks.
  assert.doesNotMatch(html, /<iframe/);
  assert.deepEqual(jsonLd(html).location.geo, { '@type': 'GeoCoordinates', latitude: 46.172859, longitude: 6.116828 });

  const noGeo = read('2026-01-20-sans-coordonnees.html');
  assert.match(noGeo, /Chemin des Voirets 22/);
  assert.doesNotMatch(noGeo, /event-map/);
  assert.doesNotMatch(read('2026-01-21-sans-adresse.html'), /event-place/);
});

test('geo is written next to the address in the frontmatter', () => {
  const text = '---\ntitle: "A"\naddress: "Rue 1, 1200 Genève"\ngeo: { "lat": 1, "lon": 2 }\ntype: "event"\n---\n\nTexte.\n';
  assert.equal(
    withGeo(text, { lat: 46.1, lon: 6.1 }),
    '---\ntitle: "A"\naddress: "Rue 1, 1200 Genève"\ngeo: { "lat": 46.1, "lon": 6.1 }\ntype: "event"\n---\n\nTexte.\n'
  );
});

test('the static map preview is assembled from the tiles around the point', async () => {
  const requested = [];
  // Each tile gets its own colour, so the output shows which tile is where.
  const colour = (x, y) => [(x * 37) % 256, (y * 53) % 256, 128];
  const image = await renderStaticMap({ lat: 46.172859, lon: 6.116828 }, { width: 960, height: 360, zoom: 16 }, async (z, x, y) => {
    requested.push([z, x, y]);
    return solidTile(colour(x, y));
  });
  const { width, height, data } = jpeg.decode(image);
  assert.deepEqual([width, height], [960, 360]);
  assert.ok(requested.length <= 15, `only the tiles in view (${requested.length})`);
  assert.ok(requested.every(([z]) => z === 16));
  // The centre pixel comes from the tile containing the point (33881/23269 at z16).
  const centre = (180 * 960 + 480) * 4;
  const [r, g, b] = colour(33881, 23269);
  assert.ok(Math.abs(data[centre] - r) < 12 && Math.abs(data[centre + 1] - g) < 12 && Math.abs(data[centre + 2] - b) < 12);
});

test('the preview is shown behind the map button, with the OSM credit', async (t) => {
  const root = fixtureRoot(t);
  const geo = { lat: 46.2, lon: 6.15 };
  writeFileSync(
    path.join(root, 'content/evenements/2026-01-19-carte.md'),
    ['---', 'title: "Café"', 'date: "2026-01-19"', 'address: "Chemin des Voirets 22, 1228 Plan-les-Ouates"', 'geo: { "lat": 46.2, "lon": 6.15 }', '---', '', 'Texte.', ''].join('\n')
  );
  const out = path.join(root, '_site');
  build({ root, outDir: out, today: '2026-10-11' });
  const before = readFileSync(path.join(out, 'evenements/2026-01-19-carte.html'), 'utf8');
  assert.doesNotMatch(before, /has-preview/, 'no preview image yet: plain button');

  await ensureMapImage(root, geo, { fetchTileImpl: async () => solidTile([10, 20, 30]) });
  build({ root, outDir: out, today: '2026-10-11' });
  const html = readFileSync(path.join(out, 'evenements/2026-01-19-carte.html'), 'utf8');
  assert.match(html, /class="event-map has-preview"/);
  assert.ok(html.includes(`background-image: url('../${mapImagePath(geo, 'opnvkarte')}')`));
  assert.ok(existsSync(path.join(out, mapImagePath(geo, 'opnvkarte'))), 'preview is published with the site');
  assert.match(html, /href="https:\/\/memomaps\.de\/"[^>]*>ÖPNVKarte</);
  assert.match(html, /href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*>© OpenStreetMap</);
  // The interactive map is the Transport map, and the TPG link is there.
  assert.match(html, /data-map-src="[^"]*layer=transportmap/);
  assert.match(html, /href="https:\/\/www\.tpg\.ch\/fr\/voyager\/planifier-votre-voyage\/itineraires"[^>]*>calculer votre itinéraire avec les TPG/);

  // A Thunderforest preview, matching the interactive map, is preferred when present.
  await ensureMapImage(root, geo, { style: 'transport', fetchTileImpl: async () => solidTile([1, 2, 3]) });
  build({ root, outDir: out, today: '2026-10-11' });
  const withTransport = readFileSync(path.join(out, 'evenements/2026-01-19-carte.html'), 'utf8');
  assert.ok(withTransport.includes(mapImagePath(geo, 'transport')));
  assert.match(withTransport, />Thunderforest</);
  assert.doesNotMatch(html, /tile\.openstreetmap\.org|<iframe/, 'nothing loaded from OSM before the click');
  assert.doesNotMatch(html, /aria-hidden="true">©/, '© stays readable for screen readers');
});

test('the preview style depends on the Thunderforest key', () => {
  assert.equal(chooseStyle({}), 'opnvkarte');
  assert.equal(chooseStyle({ THUNDERFOREST_API_KEY: 'x' }), 'transport');
});
