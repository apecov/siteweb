# APECO Voirets - Static Website

Official static website for the **Association des parents d'élèves du cycle d'orientation des Voirets (APECO Voirets)** in Geneva, Switzerland.

The site is built with a lightweight Python-based static site generator, designed to run for free on GitHub Pages. The design is inspired by the [FAPEO (Fédération des Associations de Parents d'Élèves de l'Enseignement Obligatoire)](https://www.fapeo.ch/) visual identity, simplified into clean and modern CSS.

> **Language Conventions:**
> - **Codebase, scripts, architecture, templates, workflows, and documentation:** English
> - **User-facing website content, copy, navigation, forms, and pages:** French

---

## Features

- **Static & Fast:** Pure HTML/CSS output generated in milliseconds without heavy frameworks or bloated dependencies.
- **Markdown-Driven:** Easy editing of announcements, upcoming activities, and meeting minutes.
- **FAPEO-Inspired Styling:** Clean typography (`Alegreya Sans`), signature blue (`#008ac5`) and green (`#9ac331`) palette, custom bullet points, and responsive card layouts.
- **Association Sections:**
  - **Accueil (Home):** Welcome message, core pillars, latest news, upcoming events, and Instagram feed.
  - **Statuts & PV d'AG:** Complete 14 articles of the APECO Voirets statutes adopted on 25 August 2025, link to the signed official PDF, and archive of General Assembly minutes (PV).
  - **Activités & Agenda:** Overview and dates of Cafés des Parents, roundtables, and school events.
  - **Devenir membre:** Online membership application with instant summary, bank transfer details (IBAN 20 CHF/year), and clipboard utilities.
  - **Actualités & Blog:** Chronological news feed.
  - **Contact & Accès:** Coordinates, public transport access (TPG), and contact form.
- **Word Document (.docx) Automation via GitHub Issues:**
  - Create a GitHub issue using the provided template and attach a `.docx` file.
  - GitHub Actions runs `scripts/process_issue_docx.py`, parses the document with `mammoth`, converts it into clean Markdown with frontmatter, assigns it to either upcoming events or meeting minutes, commits it to the repository, and comments back on the issue!
- **Instagram Feed Monitoring:**
  - `scripts/sync_instagram.py` monitors public Instagram updates (via RSS bridge or Graph API token) and updates `data/instagram_feed.json`.
  - A scheduled GitHub Action runs daily to pull the latest news into the site.

---

## Directory Structure

```text
siteweb/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── proposer_document.yml    # Issue form for uploading Word documents
│   └── workflows/
│       ├── publish_github_pages.yaml # Deploys static site to GitHub Pages
│       ├── process_issue_docx.yaml  # Converts docx issue attachments to Markdown
│       └── sync_instagram.yaml      # Scheduled Instagram feed synchronizer
├── content/
│   ├── evenements/                  # Upcoming and past school events (Markdown)
│   ├── nouvelles/                   # Blog articles and announcements (Markdown)
│   └── pv/                          # General Assembly minutes (PV AG)
├── data/
│   ├── site.json                    # Association metadata, links, bank details
│   └── instagram_feed.json          # Cached Instagram posts
├── static/
│   ├── css/
│   │   └── style.css                # FAPEO-inspired simplified stylesheet
│   ├── js/
│   │   └── main.js                  # Navigation toggle, clipboard, form handlers
│   ├── images/
│   │   ├── logo.svg                 # APECO emblem
│   │   └── favicon.svg              # Site favicon
│   └── docs/
│       └── Statuts_APECO_Voirets_Aout_2025.pdf # Official signed statutes PDF
├── templates/
│   ├── base.html                    # Base HTML layout with header & footer
│   ├── home.html                    # Landing page
│   ├── statuts.html                 # Statutes and meeting reports template
│   ├── activites.html               # Activities agenda template
│   ├── adhesion.html                # Membership application template
│   ├── contact.html                 # Contact and access template
│   ├── news_list.html               # Blog listing template
│   ├── news_detail.html             # Article detail template
│   └── page.html                    # Generic Markdown page template
├── scripts/
│   ├── process_issue_docx.py        # Word (.docx) to Markdown converter
│   └── sync_instagram.py            # Instagram feed synchronizer
├── build.py                         # Main static site generator
├── serve.py                         # Local preview development server
├── requirements.txt                 # Python dependencies
└── .gitignore
```

---

## Local Development & Installation

### 1. Requirements
- Python 3.9+ (Python 3.11+ recommended)

### 2. Setup Virtual Environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Build the Site
```bash
python build.py
```
This renders the entire website into the `_site/` directory in less than a second.

### 4. Run Local Development Server
```bash
python serve.py
```
Open [http://localhost:8000](http://localhost:8000) in your web browser.

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
2. Select whether it is an upcoming event or a meeting report (PV).
3. Drag and drop the `.docx` file into the description box.
4. Submit the issue: the GitHub Action automatically converts the document and publishes it to the site!

---

## Instagram Feed Configuration

To sync Instagram posts automatically:
1. Provide an RSS bridge URL in `INSTAGRAM_RSS_URL` repository secret (or directly in `data/site.json`).
2. Alternatively, set `INSTAGRAM_ACCESS_TOKEN` for the Instagram Basic Display API.
3. The `.github/workflows/sync_instagram.yaml` action will automatically update `data/instagram_feed.json` and rebuild the site.
