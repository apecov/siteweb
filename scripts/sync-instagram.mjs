// Refreshes data/instagram_feed.json from an Instagram RSS bridge (e.g.
// RSSHub) or the Instagram Graph API, and optionally turns the latest posts
// into news pages under content/nouvelles/.
//
//   INSTAGRAM_RSS_URL=... node scripts/sync-instagram.mjs [--create-posts]
//   INSTAGRAM_ACCESS_TOKEN=... node scripts/sync-instagram.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_URL = 'https://www.instagram.com/apeco_voirets/';

export function parseTagsFromCaption(caption) {
  return String(caption).match(/#[\p{L}\p{N}_]+/gu) || [];
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function toIsoDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

function toPost({ id, caption, date, permalink }) {
  const clean = stripHtml(caption);
  return {
    id: String(id),
    caption: clean.slice(0, 350),
    date: toIsoDate(date),
    permalink: permalink || PROFILE_URL,
    tags: parseTagsFromCaption(clean),
  };
}

/** Parses an RSS 2.0 or Atom document into feed posts (max 10). */
export function parseFeed(xml) {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml);
  const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const rssItems = asArray(doc.rss?.channel?.item).map((item) =>
    toPost({
      id: item.guid?.['#text'] ?? item.guid ?? item.link,
      caption: item.description || item.title,
      date: item.pubDate,
      permalink: item.link,
    })
  );
  const atomItems = asArray(doc.feed?.entry).map((entry) =>
    toPost({
      id: entry.id,
      caption: entry.summary?.['#text'] ?? entry.summary ?? entry.content?.['#text'] ?? entry.title,
      date: entry.published || entry.updated,
      permalink: asArray(entry.link)[0]?.href,
    })
  );
  return [...rssItems, ...atomItems].slice(0, 10);
}

async function fetchFromRss(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);
  return parseFeed(await response.text());
}

async function fetchFromGraphApi(token) {
  const url = new URL('https://graph.instagram.com/me/media');
  url.searchParams.set('fields', 'id,caption,media_type,media_url,permalink,timestamp');
  url.searchParams.set('access_token', token);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Instagram API HTTP ${response.status}`);
  const { data = [] } = await response.json();
  return data
    .slice(0, 10)
    .map((item) => toPost({ id: item.id, caption: item.caption, date: item.timestamp, permalink: item.permalink }));
}

function writeNewsPosts(posts, root) {
  const dir = path.join(root, 'content', 'nouvelles');
  mkdirSync(dir, { recursive: true });
  for (const post of posts.slice(0, 3)) {
    const id = post.id.slice(-12).replace(/[^\w-]/g, '');
    const file = path.join(dir, `${post.date}-instagram-${id}.md`);
    if (existsSync(file)) continue;
    const firstSentence = post.caption.includes('.') ? post.caption.split('.')[0] : post.caption.slice(0, 60);
    const fm = {
      title: `Sur Instagram : ${firstSentence}`,
      date: post.date,
      category: 'Instagram',
      author: 'APECO Voirets',
      summary: post.caption.length > 160 ? `${post.caption.slice(0, 160)}…` : post.caption,
    };
    const frontmatter = Object.entries(fm)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n');
    writeFileSync(
      file,
      `---\n${frontmatter}\n---\n\n${post.caption}\n\n[Voir la publication originale sur Instagram](${post.permalink})\n`
    );
    console.log(`Generated news post ${path.relative(root, file)}`);
  }
}

export async function syncInstagram({ root = ROOT, rssUrl, token, createPosts = false } = {}) {
  const dataFile = path.join(root, 'data', 'instagram_feed.json');
  let posts = [];

  if (token) {
    try {
      posts = await fetchFromGraphApi(token);
    } catch (err) {
      console.warn(`Graph API failed: ${err.message}`);
    }
  }
  if (posts.length === 0 && rssUrl) {
    try {
      posts = await fetchFromRss(rssUrl);
    } catch (err) {
      console.warn(`RSS failed: ${err.message}`);
    }
  }
  if (posts.length === 0) {
    console.log('No live posts fetched; keeping the cached feed.');
    return existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : [];
  }

  writeFileSync(dataFile, `${JSON.stringify(posts, null, 2)}\n`);
  console.log(`Saved ${posts.length} posts to data/instagram_feed.json`);
  if (createPosts) writeNewsPosts(posts, root);
  return posts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      'rss-url': { type: 'string' },
      token: { type: 'string' },
      'create-posts': { type: 'boolean', default: false },
    },
  });
  await syncInstagram({
    rssUrl: values['rss-url'] || process.env.INSTAGRAM_RSS_URL,
    token: values.token || process.env.INSTAGRAM_ACCESS_TOKEN,
    createPosts: values['create-posts'],
  });
}
