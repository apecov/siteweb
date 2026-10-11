// `npm run geocode`: adds coordinates (`geo`) to every activity that has an
// `address` but no `geo` yet, using OpenStreetMap's Nominatim, and makes the
// static map preview (static/images/cartes/) for every activity with `geo`.
// The build itself never contacts OpenStreetMap, so it stays fast and works
// offline.
//
//   npm run geocode            # only what is missing
//   npm run geocode -- --all   # look every address up and redraw every map
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFrontmatter } from '../site/lib/content.mjs';
import { geocode, withGeo } from '../site/lib/geocode.mjs';
import { ensureMapImage } from '../site/lib/staticmap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { all: { type: 'boolean', default: false } } });

const dir = path.join(ROOT, 'content', 'evenements');
let failures = 0;
for (const name of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md')).sort() : []) {
  const file = path.join(dir, name);
  const { data } = readFrontmatter(file);
  let geo = data.geo;
  if (data.address && (!geo || values.all)) {
    geo = await geocode(data.address);
    if (!geo) {
      console.warn(`${name}: address not found: ${data.address}`);
      failures++;
      continue;
    }
    writeFileSync(file, withGeo(readFileSync(file, 'utf8'), geo));
    console.log(`${name}: ${geo.lat}, ${geo.lon}`);
  }
  if (geo) console.log(`${name}: map ${await ensureMapImage(ROOT, geo, { force: values.all })}`);
}
process.exitCode = failures ? 1 : 0;
