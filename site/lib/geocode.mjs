// Geocoding with OpenStreetMap's Nominatim, used once per address when an
// activity is added (never during the site build). Nominatim's usage policy
// asks for an identifying User-Agent and at most one request per second:
// https://operations.osmfoundation.org/policies/nominatim/
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'apecov-siteweb/1.0 (https://www.apecov.ch; apeco-voirets@fapeo.ch)';

let lastRequest = 0;

/** Returns `{ lat, lon }` for a Swiss address, or null when nothing is found. */
export async function geocode(address, { fetchImpl = fetch } = {}) {
  const wait = lastRequest + 1100 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequest = Date.now();

  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ q: address, format: 'jsonv2', limit: '1', countrycodes: 'ch' });
  const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  const [hit] = await response.json();
  if (!hit) return null;
  // 6 decimals is ~10 cm: more than enough, and keeps the frontmatter short.
  return { lat: Number(Number(hit.lat).toFixed(6)), lon: Number(Number(hit.lon).toFixed(6)) };
}

/** The frontmatter line `geo: { "lat": …, "lon": … }`. */
export function geoLine(geo) {
  return `geo: ${JSON.stringify(geo).replace(/^\{/, '{ ').replace(/\}$/, ' }').replace(/,/, ', ').replace(/":/g, '": ')}`;
}

/**
 * Adds a `geo` line right after the `address` line of a Markdown file's
 * frontmatter, replacing an existing one.
 */
export function withGeo(text, geo) {
  const lines = text.split('\n');
  const end = lines.indexOf('---', 1);
  const front = lines.slice(1, end).filter((l) => !l.startsWith('geo:'));
  const at = front.findIndex((l) => l.startsWith('address:'));
  front.splice(at === -1 ? front.length : at + 1, 0, geoLine(geo));
  return ['---', ...front, ...lines.slice(end)].join('\n');
}
