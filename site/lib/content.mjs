// Shared helpers used by the site build and the automation scripts, so they
// agree on one way to read frontmatter, format dates and build slugs.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "Café des Parents 2025 !" -> "cafe-des-parents-2025" */
export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[-\s]+/g, '-');
}

// YAML turns an unquoted `date: 2025-11-15` into a Date; normalise every date
// back to the plain `YYYY-MM-DD` string the rest of the build compares on.
export function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value ? String(value).slice(0, 10) : '';
}

const FRENCH_DATE = new Intl.DateTimeFormat('fr-CH', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2025-08-25" -> "25 août 2025"; anything unparseable is returned as-is. */
export function formatFrenchDate(value) {
  const iso = isoDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : FRENCH_DATE.format(date);
}

export function readFrontmatter(filePath) {
  const { data, content } = matter(readFileSync(filePath, 'utf8'));
  return { data, content };
}

/**
 * Loads every `*.md` file of `content/<subdir>/` as an item with its
 * frontmatter, sorted by date, newest first. The body is left as markdown;
 * the build renders it.
 */
export function loadCollection(root, subdir, defaultType) {
  const dir = path.join(root, 'content', subdir);
  if (!existsSync(dir)) return [];

  const items = readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const slug = name.replace(/\.md$/, '');
      const { data, content } = readFrontmatter(path.join(dir, name));
      const date = isoDate(data.date);
      return {
        slug,
        title: data.title || slug.replace(/-/g, ' '),
        date,
        dateFormatted: formatFrenchDate(date),
        summary: data.summary || '',
        category: data.category || '',
        author: data.author || 'APECO Voirets',
        location: data.location || '',
        time: data.time || '',
        type: data.type || defaultType,
        markdown: content,
        out: `${subdir}/${slug}.html`,
      };
    });

  items.sort((a, b) => b.date.localeCompare(a.date));
  return items;
}
