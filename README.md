# APECO Voirets - Static Website

Official static website for the **Association des parents d'élèves du cycle d'orientation des Voirets (APECO Voirets)** in Geneva, Switzerland.

The site is built with a small Node.js build script (`markdown-it` plus plain HTML templates, the same setup as [sib-swiss/sparql-training](https://github.com/sib-swiss/sparql-training)) and published for free on GitHub Pages. The design is inspired by the [FAPEO (Fédération des Associations de Parents d'Élèves de l'Enseignement Obligatoire)](https://www.fapeo.ch/) visual identity, simplified into clean and modern CSS.

> **Language Conventions:**
> - **Codebase, scripts, architecture, templates, workflows, and documentation:** English
> - **User-facing website content, copy, navigation, forms, and pages:** French

---

## Features

- **Static & Fast:** Pure HTML/CSS output generated in milliseconds by one Node script, no framework.
- **Markdown-Driven:** Announcements, upcoming activities and meeting minutes are Markdown files with frontmatter.
- **FAPEO-Inspired Styling:** Clean typography (`Alegreya Sans`, self-hosted in `static/fonts/`), signature blue (`#008ac5`) and green (`#9ac331`) palette, custom bullet points, and responsive card layouts.
- **Association Sections:**
  - **Accueil (Home):** Welcome message, core pillars, upcoming and recent activities.
  - **Statuts et PV:** The 14 articles of the APECO Voirets statutes adopted on 25 August 2025, and the archive of General Assembly minutes (PV).
  - **Activités:** Overview and dates of parents' cafés, roundtables and other events.
  - **Devenir membre:** Membership form that prepares an e-mail to the committee (the fee comes from `data/site.json`).
  - **Contact:** Coordinates and contact form.
- **Word Document (.docx) Automation via GitHub Issues:**
  - Create a GitHub issue using the provided form and attach a `.docx` file.
  - GitHub Actions runs `scripts/process-issue-docx.mjs`, converts the document with `mammoth` + `turndown` (tables via the GFM plugin) into Markdown with frontmatter, files it as an activity or meeting report (PV), commits it, redeploys the site and comments back on the issue. Editing the issue recreates the page.

---

## Rendering the site with npm

The site is rendered by `site/build.mjs`, a plain Node.js script (no framework, no bundler):

1. Every file in `pages/` becomes a top-level page (`pages/statuts.md` → `statuts.html`).
   - `.md` pages are rendered with [markdown-it](https://github.com/markdown-it/markdown-it) (raw HTML allowed).
   - `.html` pages are HTML fragments, used for pages that are mostly layout (home, forms).
   - Both start with a frontmatter block (`title`, `description`).
2. Every `content/<collection>/*.md` file becomes a detail page (`content/evenements/x.md` → `evenements/x.html`).
3. Each page is wrapped in `site/templates/layout.html` (header, navigation, footer).
4. `static/` is copied as-is to `_site/static/`.

Placeholders available in pages and in the layout:

| Placeholder | Replaced by |
| --- | --- |
| `{{site.contact.email}}` (any path) | The value from `data/site.json` |
| `{{#if site.x}}…{{/if}}`, `{{#unless site.x}}…{{/unless}}` | Kept only when the value is set / empty (not nestable) |
| `{{BASE}}` | Relative prefix to the site root (`""` or `"../"`), so links work under the GitHub Pages project path |
| `{{upcoming_events}}`, `{{upcoming_events_home}}`, `{{past_events}}`, `{{past_events_home}}` | Event cards from `content/evenements/` |
| `{{meeting_reports}}` | PV list from `content/pv/` |

Relative links inside Markdown (e.g. `[statuts](statuts.html)`) are written relative to the site root and rewritten automatically for pages in sub-directories.

Markdown in `content/` is rendered **without raw HTML** (it may come from converted Word documents); `pages/` may contain HTML.

### Contact e-mail

`contact.email` in `data/site.json` is empty until the association has a working address. While it is empty, e-mail links are hidden and the contact and membership pages say the form will be available soon. Setting it enables both forms, which open a pre-filled e-mail in the visitor's mail client.

Events dated on or after the build day are "upcoming", older ones are "past". The Pages workflow therefore also rebuilds the site every night.

### npm scripts

Requires Node.js 22 or later.

```bash
npm install        # once
npm run build      # render the site into _site/
npm run watch      # rebuild on every change and serve _site/ on http://localhost:3000
npm run serve      # serve an existing _site/ build
npm test           # build + script tests (node:test)
npm run geocode    # add map coordinates to new activities (see "Maps")
```

---

## Directory Structure

```text
siteweb/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── proposer_document.yml    # Issue form for uploading Word documents
│   └── workflows/
│       ├── pages.yml                # Builds and deploys to GitHub Pages (push, daily, manual)
│       └── process_issue_docx.yaml  # Converts docx issue attachments to Markdown
├── pages/                           # Top-level pages (index, statuts, activites, ...)
├── content/
│   ├── evenements/                  # Upcoming and past school events (Markdown)
│   └── pv/                          # General Assembly minutes (PV AG)
├── data/
│   └── site.json                    # Association metadata, navigation, fee
├── static/                          # CSS, JS, fonts and images, copied as-is
├── site/
│   ├── build.mjs                    # Static site generator
│   ├── watch.mjs                    # `npm run watch`: rebuild + serve
│   ├── lib/content.mjs              # Frontmatter, dates, slugs (shared with scripts/)
│   └── templates/layout.html        # Page layout with header & footer
├── scripts/
│   └── process-issue-docx.mjs       # Word (.docx) to Markdown converter
├── tests/site.test.mjs
└── package.json
```

---

## Publishing Content

### Adding an Event manually
Create a new file in `content/evenements/YYYY-MM-DD-your-slug.md`:
```markdown
---
title: "Café des parents"
date: "2025-11-20"
time: "09h30 - 11h30"
location: "Salle polyvalente du CO des Voirets"
address: "Chemin des Voirets 22, 1228 Plan-les-Ouates"   # optional
geo: { "lat": 46.172859, "lon": 6.116828 }             # added by `npm run geocode`
performer: "Nom de l'intervenant·e"                     # optional
co_organizers: [{ "name": "FAPEO", "url": "https://www.fapeo.ch/" }]   # optional
type: "event"
summary: "Moment d'échange sur les devoirs et le rythme scolaire."
---

Détails de l'événement...
```

Every activity page gets a [schema.org `Event`](https://schema.org/Event) in JSON-LD in its `<head>` (`site/lib/jsonld.mjs`), so search engines and calendar tools can read it:

- `startDate`/`endDate` from `date` and `time` (`19h30`, `16h00 - 18h30`), with Geneva's UTC offset for that day; the plain date when `time` is missing or free text;
- `location` from `location`, with a structured `PostalAddress` when `address` has the form `street, NPA locality`, and `GeoCoordinates` from `geo`;
- `organizer`: APECO Voirets plus any `co_organizers`; `performer` when given;
- `image`: the first image of the page (e.g. the flyer), otherwise the logo; absolute URLs use `url` in `data/site.json` (`https://www.apecov.ch/`), which also gives every page its canonical URL.

### Maps

An activity with an `address` gets a « Lieu » section at the end of its page. With coordinates (`geo`) it also shows an [OpenStreetMap](https://www.openstreetmap.org/) map:

- a **static preview** (`static/images/cartes/<lat>_<lon>-<style>.jpg`, 960×360, zoom 16) of a public-transport map, with a marker and the tile credits, shown as soon as the page opens;
- the **interactive map**: OpenStreetMap's *Transport Map* layer, loaded only when the visitor clicks « Afficher la carte interactive », so opening a page sends nothing to a map server;
- a « Voir sur OpenStreetMap » link (also with the Transport layer), which works without JavaScript;
- a link to the TPG itinerary planner (`transport` in `data/site.json`) to plan the trip by public transport.

The preview style is [ÖPNVKarte](https://memomaps.de/) (public transport, no key needed). With a free [Thunderforest](https://www.thunderforest.com/) API key in `THUNDERFOREST_API_KEY` (locally, and as a repository secret for the Word-document workflow), previews use Thunderforest's Transport style instead, exactly like the interactive map; a Thunderforest preview is preferred when both exist.

Coordinates and previews are made once and committed, so the build never needs the network and OpenStreetMap's servers are only asked once per place (as their [tile](https://operations.osmfoundation.org/policies/tiles/) and [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) usage policies require):

```bash
npm run geocode            # adds missing `geo` (from `address`) and missing map previews
npm run geocode -- --all   # looks every address up again and redraws every preview
THUNDERFOREST_API_KEY=… npm run geocode -- --all   # previews in the Transport style
```

Activities published from a Word document get coordinates and a preview automatically when the « Adresse » field is filled in. The build prints a warning for an activity with an address but no coordinates, or coordinates but no preview. If Nominatim finds the wrong place, correct `geo` by hand (right-click → « Show address » on openstreetmap.org gives the coordinates).

### Publishing an activity from a Word (.docx) document

1. On GitHub, open **Issues → New issue → Publier un document Word (.docx)**.
2. Replace `[Publication] : ` in the issue title with the page title, e.g. `Stand de l'Escalade 2026`.
3. Fill in the form:
   - **Type de document**: *Activité* (upcoming or past) or *Procès-verbal*.
   - **Date** (required, `11.12.2026` or `2026-12-11`), and optionally **Heure**, **Lieu** and **Résumé** (shown on the activity cards; without it the first sentence of the document is used).
   - **Document Word (.docx)**: drag and drop the file.
4. Submit. The *Publish a Word document from an issue* workflow:
   - checks that the author has write access to the repository (anyone else gets a comment explaining that a committee member must publish it);
   - converts the document (headings, bold/italic, lists, tables, links and images; images are saved under `static/images/documents/`);
   - drops a first heading that only repeats the title, and puts the page under `content/evenements/` (or `content/pv/`);
   - builds the site, commits, redeploys, and comments on the issue with the link to the new page.
5. To correct the page, **edit the issue** (title, fields or a new document): the page is recreated and the old version removed. Close the issue when the page is right.

If something goes wrong (no `.docx` attached, unreadable file), the workflow comments on the issue with a link to the run.

A local file can be converted the same way:

```bash
npm run docx -- --file compte-rendu.docx --title "PV de l'AG" --type pv --date 2025-11-20
```
