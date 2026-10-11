// Converts a Word document (.docx) attached to a GitHub issue into a Markdown
// page under content/evenements/, content/pv/ or content/nouvelles/.
//
//   node scripts/process-issue-docx.mjs --event-path "$GITHUB_EVENT_PATH"
//   node scripts/process-issue-docx.mjs --file doc.docx --title "Titre" --type event --date 2025-11-20
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { slugify } from '../site/lib/content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = {
  event: { dir: 'evenements', category: 'Événements' },
  pv: { dir: 'pv', category: 'PV AG' },
  news: { dir: 'nouvelles', category: 'Actualités' },
};

// Attachments are only downloaded from GitHub itself, so an issue cannot make
// the workflow fetch (or send its token to) an arbitrary server.
const ALLOWED_HOSTS = ['github.com', 'objects.githubusercontent.com', 'user-images.githubusercontent.com'];

/**
 * Splits a GitHub issue-form body into `{ "Heading": "answer" }`. Issue forms
 * render each field as `### <label>` followed by the answer.
 */
export function parseIssueForm(body) {
  const fields = {};
  const parts = String(body || '').split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const [heading, ...rest] = part.split('\n');
    const value = rest.join('\n').trim();
    fields[heading.trim()] = value === '_No response_' ? '' : value;
  }
  return fields;
}

/** Returns `[{ label, url }]` for every .docx link in the text, in order. */
export function extractDocxUrls(text) {
  const results = [];
  const seen = new Set();
  for (const m of String(text || '').matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+?\.docx[^\s)]*)\)/gi)) {
    results.push({ label: m[1], url: m[2] });
    seen.add(m[2]);
  }
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s)<>]+?\.docx[^\s)<>]*/gi)) {
    if (!seen.has(m[0])) {
      results.push({ label: 'Document', url: m[0] });
      seen.add(m[0]);
    }
  }
  return results;
}

/** Maps the issue form's "Type de document" answer to event / pv / news. */
export function typeFromFormAnswer(answer) {
  const a = String(answer || '').toLowerCase();
  if (a.startsWith('événement') || a.startsWith('evenement')) return 'event';
  if (a.startsWith('procès-verbal') || a.startsWith('proces-verbal')) return 'pv';
  if (a.startsWith('actualité') || a.startsWith('actualite')) return 'news';
  return null;
}

/** Fallback classification from labels, title and text when the form gives no type. */
export function detectDocumentType(title, labels, text) {
  const lbls = labels.map((l) => l.toLowerCase());
  const t = title.toLowerCase();
  const body = text.toLowerCase().slice(0, 1500);

  if (lbls.some((l) => ['event', 'evenement', 'activité', 'activite'].includes(l))) return 'event';
  if (lbls.some((l) => ['pv', 'meeting-report', 'compte-rendu', 'proces-verbal'].includes(l))) return 'pv';
  if (lbls.some((l) => ['nouvelle', 'news', 'actualite', 'actualité'].includes(l))) return 'news';

  const has = (s, words) => words.some((w) => s.includes(w));
  if (has(t, ['procès-verbal', 'proces-verbal', 'pv ', 'pv:', 'compte-rendu', 'cr de réunion', 'assemblée générale'])) return 'pv';
  if (has(t, ['invitation', 'café des parents', 'table ronde', 'conférence', 'fête', 'bourse', 'agenda'])) return 'event';
  if (has(body, ['ordre du jour', 'procès-verbal', 'procès verbal', 'étaient présents', 'décharge des comptes'])) return 'pv';
  if (has(body, ['au programme', 'vous invite', 'inscription', 'rendez-vous le'])) return 'event';
  return 'event';
}

function isValidIsoDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Finds the first YYYY-MM-DD or DD.MM.YYYY date in `text`; null if none. */
export function parseDateFromString(text) {
  const iso = String(text).match(/\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/);
  if (iso && isValidIsoDate(`${iso[1]}-${iso[2]}-${iso[3]}`)) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = String(text).match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  if (fr) {
    const candidate = `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
    if (isValidIsoDate(candidate)) return candidate;
  }
  return null;
}

// Images in the document are written to static/images/documents/ (instead of
// mammoth's default base64 data URIs, which make multi-MB Markdown files).
export const IMAGE_DIR = path.join('static', 'images', 'documents');

export async function convertDocxToMarkdown(buffer, { root = ROOT, imagePrefix } = {}) {
  const options = {};
  if (imagePrefix) {
    let count = 0;
    options.convertImage = mammoth.images.imgElement(async (image) => {
      const ext = (image.contentType.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace(/[^\w]/g, '');
      const rel = path.join(IMAGE_DIR, `${imagePrefix}-${++count}.${ext}`);
      mkdirSync(path.join(root, IMAGE_DIR), { recursive: true });
      writeFileSync(path.join(root, rel), await image.readAsBuffer());
      return { src: rel.split(path.sep).join('/') };
    });
  }
  const result = await mammoth.convertToHtml({ buffer }, options);
  for (const msg of result.messages) console.error(`[mammoth] ${msg.type}: ${msg.message}`);
  const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '*' });
  return turndown.turndown(result.value).trim();
}

async function download(url, token) {
  const { hostname, protocol } = new URL(url);
  if (protocol !== 'https:' || !ALLOWED_HOSTS.includes(hostname)) {
    throw new Error(`Refusing to download from ${hostname}: only GitHub attachments are accepted`);
  }
  const headers = { 'User-Agent': 'APECO-Voirets-Docx-Processor/1.0' };
  if (token && hostname === 'github.com') headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, redirect: 'follow' });
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function summaryFrom(markdown) {
  const line = markdown
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  const summary = (line || "Document d'information de l'APECO Voirets.").replace(/[*_`]/g, '');
  return summary.length > 200 ? `${summary.slice(0, 197)}...` : summary;
}

/** Writes the Markdown page and returns its path (relative to `root`). */
export function writePage({ root = ROOT, title, date, type, markdown, extra = {} }) {
  const { dir, category } = TARGETS[type];
  const slug = slugify(title) || 'document';
  const rel = path.join('content', dir, `${date}-${slug}.md`);
  // JSON strings are valid double-quoted YAML scalars, so titles containing
  // quotes or colons cannot break the frontmatter.
  const fm = { title, date, type, category, summary: summaryFrom(markdown), author: 'APECO Voirets', ...extra };
  const frontmatter = Object.entries(fm)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  mkdirSync(path.join(root, 'content', dir), { recursive: true });
  writeFileSync(path.join(root, rel), `---\n${frontmatter}\n---\n\n${markdown}\n`);
  console.log(`Created ${rel}`);
  return rel;
}

export async function processIssue(event, { root = ROOT, token, fetchDocx = download } = {}) {
  const issue = event.issue;
  if (!issue) throw new Error("No 'issue' object in event payload");

  const title = String(issue.title || '')
    .replace(/^\[Publication\]\s*:?\s*/i, '')
    .trim();
  const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name || ''));
  const form = parseIssueForm(issue.body);

  const links = extractDocxUrls(form['Document Word (.docx)'] || issue.body);
  if (links.length === 0) {
    console.log(`No .docx attachment found in issue #${issue.number}`);
    return null;
  }

  const markdown = await convertDocxToMarkdown(await fetchDocx(links[0].url, token), { root, imagePrefix: `issue-${issue.number}` });
  const type = typeFromFormAnswer(form['Type de document']) || detectDocumentType(title, labels, markdown);
  const date =
    parseDateFromString(form['Date concernée'] || '') ||
    parseDateFromString(`${title} ${markdown.slice(0, 300)}`) ||
    new Date().toISOString().slice(0, 10);

  const file = writePage({ root, title: title || `Document ${issue.number}`, date, type, markdown, extra: { source_issue: `#${issue.number}` } });
  return { file, type, title, issueNumber: issue.number };
}

function setOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) return;
  for (const [key, value] of Object.entries(outputs)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${String(value).replace(/[\r\n]+/g, ' ')}\n`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      'event-path': { type: 'string' },
      file: { type: 'string' },
      title: { type: 'string' },
      type: { type: 'string', default: 'event' },
      date: { type: 'string' },
    },
  });

  if (values.file) {
    if (!TARGETS[values.type]) throw new Error(`--type must be one of ${Object.keys(TARGETS).join(', ')}`);
    const title = values.title || path.basename(values.file, '.docx').replace(/-/g, ' ');
    const markdown = await convertDocxToMarkdown(readFileSync(values.file), { imagePrefix: slugify(title) || 'document' });
    const date = values.date || parseDateFromString(`${title} ${markdown.slice(0, 300)}`) || new Date().toISOString().slice(0, 10);
    writePage({ title, date, type: values.type, markdown });
    return;
  }

  const eventPath = values['event-path'] || process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('Pass --event-path (or set GITHUB_EVENT_PATH) or --file');
  const result = await processIssue(JSON.parse(readFileSync(eventPath, 'utf8')), { token: process.env.GITHUB_TOKEN });
  if (result) {
    setOutputs({ created_file: result.file, doc_type: result.type, doc_title: result.title, issue_number: result.issueNumber });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
