import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { escapeHtml, formatFrenchDate, loadCollection, readFrontmatter } from './lib/content.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

// Content collections: `content/<dir>/*.md` -> `<dir>/<slug>.html`, each
// detail page highlighting `nav` in the header and linking back to it.
const COLLECTIONS = {
  news: { dir: 'nouvelles', type: 'news', nav: 'nouvelles.html', back: 'Retour aux actualités' },
  events: { dir: 'evenements', type: 'event', nav: 'activites.html', back: 'Retour aux activités' },
  reports: { dir: 'pv', type: 'pv', nav: 'statuts.html', back: 'Retour aux statuts & PV' },
};

function depthPrefix(outRelPath) {
  const depth = outRelPath.split('/').length - 1;
  return depth === 0 ? '' : '../'.repeat(depth);
}

function isRelativeUrl(href) {
  return href && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(href);
}

function buildMarkdownRenderer() {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

  // Content is written with links relative to the site root (`statuts.html`,
  // `static/docs/x.pdf`) wherever the page ends up; rewrite them against
  // `env.base` so they also work from `nouvelles/…` and under the GitHub
  // Pages project path.
  md.core.ruler.push('site_relative_links', (state) => {
    const base = state.env.base || '';
    if (!base) return;
    for (const block of state.tokens) {
      for (const token of block.children || []) {
        const attr = token.type === 'link_open' ? 'href' : token.type === 'image' ? 'src' : null;
        if (!attr) continue;
        const value = token.attrGet(attr);
        if (isRelativeUrl(value)) token.attrSet(attr, base + value);
      }
    }
  });

  return md;
}

/** Replaces `{{site.a.b}}` with values from data/site.json. */
function fillSiteValues(text, site) {
  return text.replace(/\{\{\s*site\.([\w.]+)\s*\}\}/g, (whole, key) => {
    const value = key.split('.').reduce((obj, k) => (obj == null ? undefined : obj[k]), site);
    if (value === undefined) throw new Error(`Unknown placeholder ${whole}`);
    return escapeHtml(value);
  });
}

/** Replaces `{{name}}` with pre-rendered HTML components. */
function fillComponents(html, components) {
  return html.replace(/(?:<p>)?\{\{\s*([a-z_]+)\s*\}\}(?:<\/p>)?/g, (whole, name) => {
    if (!(name in components)) throw new Error(`Unknown component {{${name}}}`);
    return components[name];
  });
}

// --- Components --------------------------------------------------------------

function eventCard(event, base, { showLocation, showTime, linkLabel }) {
  const meta = [`<span class="badge badge-green">${escapeHtml(event.dateFormatted)}</span>`];
  if (showLocation && event.location) meta.push(`<span>📍 ${escapeHtml(event.location)}</span>`);
  if (showTime && event.time) meta.push(`<span>⏰ ${escapeHtml(event.time)}</span>`);
  const href = base + event.out;
  return `<div class="card">
  <div class="card-meta">${meta.join(' ')}</div>
  <h3 class="card-title"><a href="${href}">${escapeHtml(event.title)}</a></h3>
  <p>${escapeHtml(event.summary)}</p>
  <div style="margin-top: 1rem;"><a href="${href}" class="btn btn-sm btn-outline">${linkLabel} &rarr;</a></div>
</div>`;
}

function upcomingEventCard(event, base) {
  const href = base + event.out;
  const time = event.time ? `<span>⏰ ${escapeHtml(event.time)}</span>` : '';
  const location = event.location
    ? `<p style="font-size: 0.95rem; color: var(--color-text-muted); margin-bottom: 0.5rem;">📍 <strong>Lieu :</strong> ${escapeHtml(event.location)}</p>`
    : '';
  return `<div class="card" style="border-top: 4px solid var(--color-secondary);">
  <div class="card-meta"><span class="badge badge-green">${escapeHtml(event.dateFormatted)}</span> ${time}</div>
  <h3 class="card-title"><a href="${href}">${escapeHtml(event.title)}</a></h3>
  ${location}
  <p>${escapeHtml(event.summary)}</p>
  <div style="margin-top: 1rem;"><a href="${href}" class="btn btn-outline btn-sm">Détails de l'événement &rarr;</a></div>
</div>`;
}

function pastEventCard(event, base) {
  const href = base + event.out;
  const location = event.location ? `<span>📍 ${escapeHtml(event.location)}</span>` : '';
  return `<div class="card" style="background-color: var(--color-bg-alt);">
  <div class="card-meta"><span class="badge badge-blue">${escapeHtml(event.dateFormatted)}</span> ${location}</div>
  <h3 class="card-title"><a href="${href}">${escapeHtml(event.title)}</a></h3>
  <p>${escapeHtml(event.summary)}</p>
  <div style="margin-top: 0.75rem;"><a href="${href}" style="font-weight: 700; font-size: 0.95rem;">Voir le compte-rendu &rarr;</a></div>
</div>`;
}

function newsMeta(post, { withAuthor, categoryBadge = 'badge-green' }) {
  const meta = [`<span class="badge badge-blue">${escapeHtml(post.dateFormatted)}</span>`];
  if (post.category) meta.push(`<span class="badge ${categoryBadge}">${escapeHtml(post.category)}</span>`);
  if (withAuthor && post.author) meta.push(`<span>Par ${escapeHtml(post.author)}</span>`);
  return `<div class="card-meta">${meta.join(' ')}</div>`;
}

function newsCard(post, base, { heading, withAuthor, categoryBadge, linkLabel }) {
  const href = base + post.out;
  return `<article class="card">
  ${newsMeta(post, { withAuthor, categoryBadge })}
  <${heading} class="card-title"><a href="${href}">${escapeHtml(post.title)}</a></${heading}>
  <p>${escapeHtml(post.summary)}</p>
  <div style="margin-top: 1rem;"><a href="${href}" class="btn btn-outline btn-sm">${linkLabel} &rarr;</a></div>
</article>`;
}

function emptyCard(text) {
  return `<div class="card"><p>${text}</p></div>`;
}

function instagramCard(post, site) {
  const tags = post.tags?.length ? `<div class="ig-card-tags">${escapeHtml(post.tags.join(' '))}</div>` : '';
  return `<div class="ig-card">
  <div class="ig-card-header"><span>📷 @apeco_voirets</span><span>${escapeHtml(post.dateFormatted)}</span></div>
  <div class="ig-card-body">
    <p class="ig-card-caption">${escapeHtml(post.caption)}</p>
    ${tags}
  </div>
  <div class="ig-card-footer">
    <a href="${escapeHtml(post.permalink || site.social.instagram)}" target="_blank" rel="noopener noreferrer" style="font-weight:700; font-size:0.9rem;">Voir sur Instagram &nearr;</a>
  </div>
</div>`;
}

function buildComponents(data, base) {
  const { site, news, upcoming, past, reports, instagram } = data;
  return {
    upcoming_events_home: upcoming.length
      ? upcoming
          .slice(0, 3)
          .map((e) => eventCard(e, base, { showLocation: true, showTime: true, linkLabel: 'En savoir plus' }))
          .join('\n')
      : emptyCard('Aucun événement programmé pour le moment. Consultez nos actualités ou contactez le comité !'),

    latest_news_home: news
      .slice(0, 3)
      .map((p) => newsCard(p, base, { heading: 'h3', withAuthor: false, categoryBadge: 'badge-orange', linkLabel: 'Lire la suite' }))
      .join('\n'),

    upcoming_events: upcoming.length
      ? `<div class="grid-2">\n${upcoming.map((e) => upcomingEventCard(e, base)).join('\n')}\n</div>`
      : emptyCard(
          "Aucun événement n'est programmé dans l'immédiat. Rejoignez notre liste de diffusion ou notre Instagram pour ne rien manquer !"
        ),

    past_events: past.length
      ? `<section>\n<h2>🏛️ Activités passées & Archives</h2>\n<div class="grid-2">\n${past
          .map((e) => pastEventCard(e, base))
          .join('\n')}\n</div>\n</section>`
      : '',

    news_list: news.length
      ? `<div style="display: flex; flex-direction: column; gap: 1.5rem;">\n${news
          .map((p) => newsCard(p, base, { heading: 'h2', withAuthor: true, linkLabel: "Lire l'article complet" }))
          .join('\n')}\n</div>`
      : emptyCard('Aucun article publié pour le moment.'),

    meeting_reports: reports.length
      ? reports
          .map(
            (r) => `<div style="border-bottom: 1px solid var(--color-border); padding: 0.75rem 0;">
  <span class="badge badge-blue" style="font-size: 0.8rem;">${escapeHtml(r.dateFormatted)}</span>
  <h4 style="margin: 0.35rem 0 0.2rem 0; font-size: 1.05rem;"><a href="${base}${r.out}">${escapeHtml(r.title)}</a></h4>
  <p style="font-size: 0.88rem; color: var(--color-text-muted); margin-bottom: 0;">${escapeHtml(r.summary)}</p>
</div>`
          )
          .join('\n')
      : '<p style="font-size: 0.9rem;">Aucun PV archivé pour le moment.</p>',

    instagram_feed: `<div class="ig-feed-grid">\n${instagram
      .slice(0, 3)
      .map((p) => instagramCard(p, site))
      .join('\n')}\n</div>`,
  };
}

// --- Pages -------------------------------------------------------------------

function renderNav(site, currentNav, base) {
  return site.navigation
    .map((item) => {
      const classes = ['nav-link'];
      if (item.cta) classes.push('nav-cta');
      if (item.url === currentNav) classes.push('active');
      return `          <li><a href="${base}${item.url}" class="${classes.join(' ')}">${escapeHtml(item.label)}</a></li>`;
    })
    .join('\n');
}

function renderLayout(layout, { site, out, nav, title, description, content, year }) {
  const base = depthPrefix(out);
  const fullTitle = `${title ? `${title} - ` : ''}${site.title} | ${site.full_title}`;
  return fillSiteValues(layout, site)
    .replaceAll('{{TITLE}}', escapeHtml(fullTitle))
    .replaceAll('{{DESCRIPTION}}', escapeHtml(description || site.description))
    .replaceAll('{{BASE}}', base)
    .replaceAll('{{YEAR}}', String(year))
    .replace('{{NAV}}', renderNav(site, nav, base))
    .replace('{{CONTENT}}', () => content);
}

function detailHeader(item, collection) {
  const meta = [`<span class="badge badge-blue">${escapeHtml(item.dateFormatted)}</span>`];
  if (collection === 'news') {
    if (item.category) meta.push(`<span class="badge badge-green">${escapeHtml(item.category)}</span>`);
    if (item.author) meta.push(`<span>Par ${escapeHtml(item.author)}</span>`);
  } else {
    if (item.location) meta.push(`<span>📍 ${escapeHtml(item.location)}</span>`);
    if (item.category) meta.push(`<span class="badge badge-green">${escapeHtml(item.category)}</span>`);
  }
  return `<div style="margin-bottom: 1.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 1rem;">
  <div class="card-meta">${meta.join(' ')}</div>
  <h1 style="border-bottom: none; margin-bottom: 0.5rem; margin-top: 0.5rem;">${escapeHtml(item.title)}</h1>
</div>`;
}

function renderDetail(md, item, collection, base) {
  const { nav, back } = COLLECTIONS[collection];
  const body = md.render(item.markdown, { base });
  const footer =
    collection === 'news'
      ? `<div style="margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
  <a href="${base}nouvelles.html" class="btn btn-outline btn-sm">&larr; Retour à la liste</a>
  <a href="${base}adhesion.html" class="btn btn-secondary btn-sm">Rejoindre l'APECO (20 CHF) &rarr;</a>
</div>`
      : '';
  return `<div class="container">
  <div style="margin-bottom: 1.5rem;"><a href="${base}${nav}" style="font-weight: 700;">&larr; ${escapeHtml(back)}</a></div>
  <article class="markdown-body">
${detailHeader(item, collection)}
${body}
${footer}
  </article>
</div>`;
}

function writePage(outDir, out, html) {
  const outPath = path.join(outDir, out);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  console.log('wrote', out);
}

/**
 * Builds the whole site into `outDir`. `today` (YYYY-MM-DD) decides which
 * events count as upcoming; it defaults to the build date, which is why the
 * Pages workflow also rebuilds on a daily schedule.
 */
export function build({ root = ROOT, outDir = path.join(root, '_site'), today } = {}) {
  today ??= new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);

  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(path.join(root, 'static'), path.join(outDir, 'static'), { recursive: true });
  // Serve files as-is on GitHub Pages, without its Jekyll processing.
  writeFileSync(path.join(outDir, '.nojekyll'), '');

  const site = JSON.parse(readFileSync(path.join(root, 'data/site.json'), 'utf8'));
  const igPath = path.join(root, 'data/instagram_feed.json');
  const instagram = existsSync(igPath) ? JSON.parse(readFileSync(igPath, 'utf8')) : [];
  for (const post of instagram) post.dateFormatted = formatFrenchDate(post.date);

  const items = Object.fromEntries(
    Object.entries(COLLECTIONS).map(([key, c]) => [key, loadCollection(root, c.dir, c.type)])
  );
  const data = {
    site,
    instagram,
    news: items.news,
    reports: items.reports,
    upcoming: items.events.filter((e) => e.date >= today).reverse(), // soonest first
    past: items.events.filter((e) => e.date < today),
  };

  const md = buildMarkdownRenderer();
  const layout = readFileSync(path.join(root, 'site/templates/layout.html'), 'utf8');

  // Top-level pages: `pages/<name>.html` (raw HTML) or `pages/<name>.md`.
  const pagesDir = path.join(root, 'pages');
  for (const name of readdirSync(pagesDir).sort()) {
    const ext = path.extname(name);
    if (ext !== '.html' && ext !== '.md') continue;
    const out = name.replace(/\.md$/, '.html');
    const base = depthPrefix(out);
    const { data: fm, content } = readFrontmatter(path.join(pagesDir, name));
    let body = fillSiteValues(content, site).replaceAll('{{BASE}}', base);
    if (ext === '.md') body = md.render(body, { base });
    body = fillComponents(body, buildComponents(data, base));
    writePage(
      outDir,
      out,
      renderLayout(layout, { site, out, nav: fm.nav || out, title: fm.title, description: fm.description, content: body, year })
    );
  }

  for (const [collection, list] of Object.entries(items)) {
    for (const item of list) {
      const base = depthPrefix(item.out);
      writePage(
        outDir,
        item.out,
        renderLayout(layout, {
          site,
          out: item.out,
          nav: COLLECTIONS[collection].nav,
          title: item.title,
          description: item.summary,
          content: renderDetail(md, item, collection, base),
          year,
        })
      );
    }
  }

  console.log(`\nBuilt site into ${path.relative(process.cwd(), outDir) || '.'}/`);
}

// Only build when run directly (`node site/build.mjs`), not when imported by
// the tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  build();
}
