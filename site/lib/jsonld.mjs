// schema.org JSON-LD for activity pages, emitted in the page <head> so search
// engines and calendar tools can read the event's date, place and organiser.

const TIME_ZONE = 'Europe/Zurich';

/** "19h30" -> "19:30"; "16h" -> "16:00"; anything else -> null. */
function clock(text) {
  const m = String(text).match(/^\s*(\d{1,2})\s*[h:]\s*(\d{2})?\s*$/i);
  if (!m || Number(m[1]) > 23) return null;
  return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
}

/** Geneva's UTC offset on that day, e.g. "+01:00" in winter, "+02:00" in summer. */
function zurichOffset(isoDate) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${isoDate}T12:00:00Z`))
    .find((part) => part.type === 'timeZoneName').value; // "GMT+01:00"
  return name === 'GMT' ? '+00:00' : name.slice(3);
}

/**
 * Turns the free-text `time` ("19h30", "16h00 - 18h30") into schema.org
 * start/end date-times; without a usable time, the plain date is used.
 */
export function eventDates(date, time) {
  const [start, end] = String(time || '').split(/\s*[-–à]\s*/);
  const at = (t) => (clock(t) ? `${date}T${clock(t)}:00${zurichOffset(date)}` : null);
  const startDate = (start && at(start)) || date;
  const endDate = end ? at(end) : null;
  return endDate ? { startDate, endDate } : { startDate };
}

/** "Avenue des Communes-Réunies 73, 1212 Grand-Lancy" -> PostalAddress. */
export function postalAddress(text) {
  const m = String(text).match(/^(.*),\s*(\d{4})\s+(.+)$/);
  if (!m) return { '@type': 'PostalAddress', streetAddress: text, addressRegion: 'GE', addressCountry: 'CH' };
  return { '@type': 'PostalAddress', streetAddress: m[1], postalCode: m[2], addressLocality: m[3], addressRegion: 'GE', addressCountry: 'CH' };
}

function absolute(site, rel) {
  return new URL(rel, site.url).href;
}

/** The first image of the page (e.g. the flyer), as an absolute URL. */
function firstImage(markdown, site) {
  const m = String(markdown).match(/!\[[^\]]*\]\(([^)\s]+)/);
  return m ? absolute(site, m[1]) : null;
}

export function eventJsonLd(item, site) {
  const organizer = {
    '@type': 'Organization',
    name: site.title,
    alternateName: site.full_title,
    url: site.url,
    ...(site.contact.email ? { email: site.contact.email } : {}),
  };
  const coOrganizers = item.coOrganizers.map((o) =>
    typeof o === 'string' ? { '@type': 'Organization', name: o } : { '@type': 'Organization', ...o }
  );
  const location = {
    '@type': 'Place',
    name: item.location || site.contact.school_name,
    ...(item.address ? { address: postalAddress(item.address) } : {}),
  };
  const image = firstImage(item.markdown, site);

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: item.title,
    ...(item.summary ? { description: item.summary } : {}),
    ...eventDates(item.date, item.time),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    inLanguage: 'fr-CH',
    location,
    organizer: coOrganizers.length ? [organizer, ...coOrganizers] : organizer,
    ...(item.performer ? { performer: { '@type': 'Person', name: item.performer } } : {}),
    image: image || absolute(site, 'static/images/logo-apecov.jpg'),
    url: absolute(site, item.out),
  };
}

/** A <script> element; `<` is escaped so no value can close the script early. */
export function jsonLdScript(data) {
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}
