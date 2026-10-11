// A static preview of an activity's map, assembled once from map tiles and
// stored in static/images/cartes/. It is shown behind the « Afficher la carte »
// button, so a page shows a map without contacting any map server until the
// visitor asks for the interactive one.
//
// The preview uses a public-transport map, like the interactive map:
// - with a Thunderforest API key (THUNDERFOREST_API_KEY, free "hobby" plan),
//   Thunderforest's Transport map: the very style the interactive OSM embed
//   shows;
// - otherwise ÖPNVKarte (memomaps.de), a public-transport map that needs no key.
// Tile policies ask for an identifying User-Agent, no bulk downloads (a handful
// of tiles per place, fetched once and kept) and the attribution shown with
// the image (see `credit`).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const USER_AGENT = 'apecov-siteweb/1.0 (https://www.apecov.ch; apeco-voirets@fapeo.ch)';
const TILE = 256;

const OSM_CREDIT = { text: '© OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' };

export const STYLES = {
  transport: {
    tileUrl: (z, x, y, key) => `https://tile.thunderforest.com/transport/${z}/${x}/${y}.png?apikey=${key}`,
    credit: [{ text: 'Thunderforest', href: 'https://www.thunderforest.com/' }, OSM_CREDIT],
  },
  opnvkarte: {
    tileUrl: (z, x, y) => `https://tile.memomaps.de/tilegen/${z}/${x}/${y}.png`,
    credit: [{ text: 'ÖPNVKarte', href: 'https://memomaps.de/' }, OSM_CREDIT],
  },
};

/** Preferred first: the preview that matches the interactive map wins. */
const PREFERENCE = ['transport', 'opnvkarte'];

export const MAP_DIR = path.join('static', 'images', 'cartes');
export const MAP_SIZE = { width: 960, height: 360, zoom: 16 };

/** Site-relative path of the preview (shared by activities at the same place). */
export function mapImagePath({ lat, lon }, style) {
  return `${MAP_DIR.split(path.sep).join('/')}/${lat.toFixed(6)}_${lon.toFixed(6)}-${style}.jpg`;
}

/** The best existing preview for `geo`: `{ path, style, credit }`, or null. */
export function findMapImage(root, geo) {
  for (const style of PREFERENCE) {
    const rel = mapImagePath(geo, style);
    if (existsSync(path.join(root, rel))) return { path: rel, style, credit: STYLES[style].credit };
  }
  return null;
}

/** The style to draw with: Thunderforest's Transport map when a key is available. */
export function chooseStyle(env = process.env) {
  return env.THUNDERFOREST_API_KEY ? 'transport' : 'opnvkarte';
}

/** Web-Mercator pixel position of a point at `zoom`. */
function toPixels(lat, lon, zoom) {
  const scale = TILE * 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale,
  };
}

function tileFetcher(style, key) {
  return async (z, x, y) => {
    const response = await fetch(STYLES[style].tileUrl(z, x, y, key), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`${style} tile ${z}/${x}/${y}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
}

/**
 * Renders a `width`×`height` JPEG centred on the point (JPEG: a third of the
 * size of the PNG for a map this busy). `fetchTileImpl(z, x, y)` returns a
 * tile's PNG bytes.
 */
export async function renderStaticMap({ lat, lon }, { width, height, zoom } = MAP_SIZE, fetchTileImpl) {
  const centre = toPixels(lat, lon, zoom);
  const left = Math.round(centre.x - width / 2);
  const top = Math.round(centre.y - height / 2);
  const out = new PNG({ width, height });

  const max = 2 ** zoom - 1;
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height - 1) / TILE); ty++) {
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width - 1) / TILE); tx++) {
      if (ty < 0 || ty > max) continue;
      const tile = PNG.sync.read(await fetchTileImpl(zoom, ((tx % (max + 1)) + max + 1) % (max + 1), ty));
      // Intersection of this tile with the output window.
      const sx = Math.max(0, left - tx * TILE);
      const sy = Math.max(0, top - ty * TILE);
      const dx = Math.max(0, tx * TILE - left);
      const dy = Math.max(0, ty * TILE - top);
      const w = Math.min(TILE - sx, width - dx);
      const h = Math.min(TILE - sy, height - dy);
      PNG.bitblt(tile, out, sx, sy, w, h, dx, dy);
    }
  }
  return jpeg.encode({ data: out.data, width, height }, 82).data;
}

/**
 * Writes the preview for `geo` in the chosen style unless it exists (or
 * `force`); returns its site-relative path.
 */
export async function ensureMapImage(root, geo, { force = false, style = chooseStyle(), fetchTileImpl } = {}) {
  const rel = mapImagePath(geo, style);
  if (!force && existsSync(path.join(root, rel))) return rel;
  const image = await renderStaticMap(geo, MAP_SIZE, fetchTileImpl || tileFetcher(style, process.env.THUNDERFOREST_API_KEY));
  mkdirSync(path.join(root, MAP_DIR), { recursive: true });
  writeFileSync(path.join(root, rel), image);
  return rel;
}
