// The RSS feed (rss.xml): one item per activity, activity « en projet » and
// PV, so families can follow the site in a feed reader.
//
// An item's publication date is when its file was first committed: a new
// activity shows up as new even when it took place earlier (a past activity
// written up afterwards). Without git history (a shallow clone, the tests),
// the activity's own date is used.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { escapeHtml } from './content.mjs';

/** `{ "content/…/x.md": Date }`: when each content file was first committed. */
export function firstCommitDates(root) {
  const dates = new Map();
  let log;
  try {
    log = execFileSync('git', ['log', '--relative', '--diff-filter=A', '--format=%x00%cI', '--name-only', '--', 'content'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return dates; // not a git checkout
  }
  // Newest commit first: keep overwriting, so the oldest (first) addition wins.
  for (const entry of log.split('\0').slice(1)) {
    const [date, ...files] = entry.trim().split('\n');
    for (const file of files) if (file) dates.set(file, new Date(date));
  }
  return dates;
}

const xml = escapeHtml;

/** The item's text: when and where, then the summary. */
function describe(item) {
  if (item.provisional) return `En projet (${item.dateFormatted}). ${item.summary}`;
  const when = [item.dateFormatted, item.time].filter(Boolean).join(', ');
  return [[when, item.location].filter(Boolean).join(' · '), item.summary].filter(Boolean).join('. ');
}

/**
 * The RSS 2.0 document for `items` (`{ item, file, category }`, with `file`
 * the content file relative to the root). `fallbackDate` dates the items that
 * have neither a commit date nor a date of their own.
 */
export function rssFeed({ site, entries, dates = new Map(), fallbackDate }) {
  const absolute = (rel) => new URL(rel, site.url).href;
  const items = entries
    .map(({ item, file, category }) => ({
      item,
      category,
      published: dates.get(file) || new Date(`${item.date || fallbackDate}T00:00:00Z`),
    }))
    .sort((a, b) => b.published - a.published || a.item.title.localeCompare(b.item.title, 'fr'));

  const body = items
    .map(
      ({ item, category, published }) => `    <item>
      <title>${xml(item.title)}</title>
      <link>${xml(absolute(item.out))}</link>
      <guid isPermaLink="true">${xml(absolute(item.out))}</guid>
      <pubDate>${published.toUTCString()}</pubDate>
      <category>${xml(category)}</category>
      <description>${xml(describe(item))}</description>
    </item>`
    )
    .join('\n');
  // The newest item, not the build time: the nightly rebuild leaves an
  // unchanged feed unchanged.
  const lastBuild = items.length ? items[0].published : new Date(`${fallbackDate}T00:00:00Z`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(site.title)} – activités</title>
    <link>${xml(site.url)}</link>
    <atom:link href="${xml(absolute(FEED_PATH))}" rel="self" type="application/rss+xml"/>
    <description>${xml(`Les activités, projets et procès-verbaux de l'${site.title}.`)}</description>
    <language>fr-CH</language>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
    <image>
      <url>${xml(absolute('static/images/logo-apecov.png'))}</url>
      <title>${xml(site.title)} – activités</title>
      <link>${xml(site.url)}</link>
    </image>
${body}
  </channel>
</rss>
`;
}

export const FEED_PATH = 'rss.xml';

/** Content file of a collection item, as git names it. */
export function contentFile(dir, item) {
  return path.posix.join('content', dir, `${item.slug}.md`);
}
