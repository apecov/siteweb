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
  - **Accueil (Home):** Welcome message, core pillars, latest news and upcoming events.
  - **Statuts et PV:** The 14 articles of the APECO Voirets statutes adopted on 25 August 2025, and the archive of General Assembly minutes (PV).
  - **Activités:** Overview and dates of parents' cafés, roundtables and other events.
  - **Devenir membre:** Membership form that prepares an e-mail to the committee (the fee comes from `data/site.json`).
  - **Actualités:** Chronological news feed.
  - **Contact:** Coordinates and contact form.
- **Word Document (.docx) Automation via GitHub Issues:**
  - Create a GitHub issue using the provided template and attach a `.docx` file.
  - GitHub Actions runs `scripts/process-issue-docx.mjs`, converts the document with `mammoth` + `turndown` into Markdown with frontmatter, files it as an event, meeting report (PV) or news item according to the form, commits it, redeploys the site and comments back on the issue.

---

## Rendering the site with npm

The site is rendered by `site/build.mjs`, a plain Node.js script (no framework, no bundler):

1. Every file in `pages/` becomes a top-level page (`pages/statuts.md` → `statuts.html`).
   - `.md` pages are rendered with [markdown-it](https://github.com/markdown-it/markdown-it) (raw HTML allowed).
   - `.html` pages are HTML fragments, used for pages that are mostly layout (home, forms).
   - Both start with a frontmatter block (`title`, `description`).
2. Every `content/<collection>/*.md` file becomes a detail page (`content/nouvelles/x.md` → `nouvelles/x.html`).
3. Each page is wrapped in `site/templates/layout.html` (header, navigation, footer).
4. `static/` is copied as-is to `_site/static/`.

Placeholders available in pages and in the layout:

| Placeholder | Replaced by |
| --- | --- |
| `{{site.contact.email}}` (any path) | The value from `data/site.json` |
| `{{#if site.x}}…{{/if}}`, `{{#unless site.x}}…{{/unless}}` | Kept only when the value is set / empty (not nestable) |
| `{{BASE}}` | Relative prefix to the site root (`""` or `"../"`), so links work under the GitHub Pages project path |
| `{{upcoming_events}}`, `{{upcoming_events_home}}`, `{{past_events}}` | Event cards from `content/evenements/` |
| `{{news_list}}`, `{{latest_news_home}}` | News cards from `content/nouvelles/` |
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
│   ├── nouvelles/                   # Blog articles and announcements (Markdown)
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

### Adding a News Article manually
Create a new file in `content/nouvelles/YYYY-MM-DD-your-slug.md`:
```markdown
---
title: "Titre de l'actualité"
date: "2025-10-15"
category: "Actualités"
author: "Comité APECO"
summary: "Court résumé pour la page d'accueil."
---

Votre texte en Markdown ici...
```

### Adding an Event manually
Create a new file in `content/evenements/YYYY-MM-DD-your-slug.md`:
```markdown
---
title: "Café des parents"
date: "2025-11-20"
time: "09h30 - 11h30"
location: "Salle polyvalente du CO des Voirets"
type: "event"
summary: "Moment d'échange sur les devoirs et le rythme scolaire."
---

Détails de l'événement...
```

### Publishing via Word (.docx) Document
1. Open an issue on GitHub using the template **Publier un document Word (.docx)**.
2. Select whether it is an upcoming event, a meeting report (PV) or a news item, and give its date.
3. Drag and drop the `.docx` file into the attachment field.
4. Submit the issue: the GitHub Action converts the document, publishes it, redeploys the site and closes the issue. Images in the document are saved under `static/images/documents/`.

Only issues carrying the `document` label (added by the template; create the label in the repository once) and opened by an owner, member or collaborator of the repository are processed.

A local file can be converted the same way:

```bash
npm run docx -- --file compte-rendu.docx --title "PV de l'AG" --type pv --date 2025-11-20
```
