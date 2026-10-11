# Review – APECO Voirets site

Review of the repository at commit `9260376` (after the move to the npm/markdown-it build), done on 2026-10-11.
It covers the French content of the site and the code (build, automation scripts, workflows, front-end JS).

Severity: 🔴 must fix before publishing · 🟠 should fix · 🟡 nice to have.

## Status (follow-up, 2026-10-11)

Done:
- **Removed**:
  - The invalid IBAN and all bank, Twint and QR-bill details. The membership page now says the committee will send the payment details.
  - The phone number.
  - The non-existent e-mail. `contact.email` is now `apeco-voirets@fapeo.ch`; if it is ever emptied, e-mail links are hidden and both forms show "bientôt disponible".
  - The wrong address. It is now the verified school address, Chemin des Voirets 22.
  - The broken ge.ch link and the unverified TPG lines.
  - The "Membre affilié de la FAPEO" claim.
  - The invented PV, and all sample events, news and Instagram posts.
  - The signed statutes PDF, both copies.
  - The generated logo and favicon. The real logo `logo-apecov.jpg` is used instead.
  - The whole Instagram integration (script, workflow, data, page sections, CSS, README).
- **Statutes**: Art. 7 now says ¾, and Art. 8 now says "article 2" (as adopted), followed by a short note.
- **French text**:
  - French capitalisation in headings, and "et" instead of "&".
  - "un astérisque".
  - The 7e primaire option in the form, and the full eligibility text on the home page.
  - No more "Adhérer en ligne", "liste de diffusion", "bourse aux livres / kermesses", "Pédibus" or "Voir le compte-rendu".
  - French-only options in the issue template.
- **Code**:
  - `content/` is rendered without raw HTML.
  - No `innerHTML` with user input in `main.js`.
  - The consent box is no longer pre-checked; the box and the phone number are now validated.
  - The fee and e-mail come from `site.json`, and unused `site.json` fields are gone.
  - The docx workflow no longer fails when there is nothing to commit, and it closes the issue after publishing.
  - Images from `.docx` files are saved as files.
  - Alegreya Sans is self-hosted (no Google Fonts).
  - Emoji are `aria-hidden`.
  - Open Graph tags added.
  - The empty state for "Dernières actualités" is fixed, and so is the header padding on mobile.

Still open (needs the committee or a decision):
- Confirm that `apeco-voirets@fapeo.ch` reaches the committee, and the association's postal address (FAPEO lists Chemin des Fraisiers 13, Grand-Lancy).
- The real PV of the constitutive AG, real events and news.
- An unsigned version of the statutes for download, if wanted. The signed scan is still in the git history (commit `d0f1b4e`); if the repository is public, removing it from history needs a rewrite.
- The Art. 7 / Art. 14 contradiction in the statutes (for the next AG).
- Which language the developer docs use (AGENTS.md vs README).
- Not done: a PR-based docx flow (needed only if branch protection is enabled), `404.html` (relative links need the final URL), sitemap and CNAME, and the `npm audit` warnings from gray-matter and mammoth (build-time only).

---

## 1. Blockers: facts on the site that are wrong or unverified

| # | Where | Problem | Evidence |
|---|---|---|---|
| 🔴 1.1 | `data/site.json` → `membership.bank_details.iban`, shown on `adhesion.html` | **The IBAN `CH76 0900 0000 1472 6701 5` is invalid**: its mod-97 checksum is 67, but a valid IBAN gives 1. Its clearing number `09000` is PostFinance, while the page says "BCGE Genève". Parents would be asked to pay into an account that doesn't exist. | Checksum computed locally |
| 🔴 1.2 | `site.json` → `contact.email` (`contact@apeco-voirets.ch`), used in the header, footer, contact page and **both forms** (`static/js/main.js` hard-codes it too) | The domain `apeco-voirets.ch` has no DNS records (no A, no MX), so **every message and membership request is lost**. | `dig MX/A apeco-voirets.ch` → empty |
| 🔴 1.3 | `site.json` → `contact.address` ("Rue de Pré-Long 1, 1228 Plan-les-Ouates") | The CO des Voirets is at **Chemin des Voirets 22, 1228 Plan-les-Ouates** (tél. 022 388 42 00). The FAPEO page gives the association's own address as **Chemin des Fraisiers 13, 1212 Grand-Lancy**. The committee needs to decide which address is the postal one. | [MEMENTO parents (edu.ge.ch)](https://edu.ge.ch/secondaire1/sites/default/files/inline-files/MEMENTO%20PARENTS%202023-2024.pdf), [fapeo.ch/ape-co/voirets](https://www.fapeo.ch/ape-co/voirets/) |
| 🔴 1.4 | `pages/index.html` (box "Établissement") | The link `https://www.ge.ch/ecole-genevoise/cycle-orientation-voirets` returns **404**. | WebFetch |
| 🔴 1.5 | `pages/statuts.md`, Art. 7 | The site says dissolution needs "**2/3** des membres". The signed PDF says "**¾** des membres". | PDF p. 2 |
| 🔴 1.6 | `pages/statuts.md`, Art. 8 | The site says "buts déterminés sous l'article **4**". The signed PDF says "article **2**". The site's version is the logical one (the aims are in Art. 4), but the site must reproduce the adopted text. Suggestion: keep "article 2" and add a note, then fix it at the next AG. | PDF p. 2 |
| 🔴 1.7 | `content/pv/2025-08-25-pv-ag-constitutive.md` | This "PV" looks **generated**, not taken from the real minutes: no names, start and end times (19h30 / 21h15), place "Grand-Lancy / Plan-les-Ouates" (the statutes say Lancy), an agenda item "Affiliation à la FAPEO" that isn't in the statutes, and an "Élection du Comité" that lists roles but no people. Publishing an invented PV as official minutes is a real risk. Replace it with the real PV or remove it. | |
| 🔴 1.8 | All of `content/` and `data/instagram_feed.json` | The events (café 15.11.2025, Escalade 05.12.2025), the news items and the Instagram posts are **sample content**. The site must not go live with them. | |
| 🟠 1.9 | `contact.html`, "Accès & Transports publics (TPG)" | "Tram 15 / 17 : Grand-Lancy, Pontets ou Palettes" and "Bus 22, 23, 42 : arrêts Voirets ou Commune" are unverified and probably wrong (tram 17 doesn't serve this area). Check against tpg.ch, or replace with a link to the TPG timetable. | |
| 🟠 1.10 | Top bar "Membre affilié de la FAPEO" | The (sample) PV only says the AG "approuve la démarche d'affiliation". Confirm that the affiliation is effective. | |
| 🟠 1.11 | `contact.html`, FAPEO card | "Rue de Saint-Jean 12, 1203 Genève · 022 344 22 55" is correct. ✅ | fapeo.ch |
| 🟠 1.12 | `site.json` → `contact.phone` (076 690 67 76) | It matches the FAPEO page, but it looks like a private mobile number. Make sure its owner agrees to have it on every page. | |

## 2. Statutes: other differences from the signed PDF

These are acceptable corrections of typos, but they should be a deliberate choice:

- Art. 7: PDF "tous les membre**s**" (typo in the original); the site corrects it.
- Art. 14: PDF "en cas de mi**s** en veille"; the site corrects it to "mise".
- Art. 5: the PDF has one sentence; the site has a bulleted list. Same content.
- Art. 13: PDF "20.-chf"; the site has "20.- CHF".
- Final formula: the PDF ends with "Lancy, 25.08.2025" and the co-presidents' signatures.

**Contradiction inside the statutes (for the committee, not the site):** Art. 7 requires 2/3 of the members present to amend the statutes and ¾ of the members to dissolve. Art. 14 says either decision is valid "à la majorité des membres présents". This should be resolved at the next AG.

**Privacy:** the published PDF is a phone photo that shows the co-presidents' handwritten signatures and names. Consider publishing an unsigned or retyped version, and keeping the signed copy in the archives.

The PDF is also committed twice (`Statuts APECO Voirets, Août 2025.pdf` at the root and `static/docs/…`; the files are identical). Remove the root copy.

## 3. French content: wording and consistency

### Factual inconsistencies between pages

- 🟠 **Membership eligibility**:
  - The statutes (Art. 6) cover 7e/8e primaire, CO pupils, and former pupils (< 2 years).
  - The form (`adhesion.html`, "Degré scolaire") has no option for **7e** primaire.
  - The home page ("ouverte à tous les parents … ou en fin de primaire (7e/8e Harmos)") leaves out the parents of former pupils.
- 🟠 **Payment reference**: the page says "Cotisation + Nom élève", but `site.json` says "Cotisation APECO [Nom de l'enfant / Classe]". Pick one.
- 🟠 **Payment methods**: "Twint" and "Bulletin de versement postal (QR-facture)" can be selected, but no Twint number or QR bill is given anywhere. Remove them, or add the details.
- 🟠 **Escalade event** (`2025-12-05-vente-escalade-solidaire.md`): the summary mentions "**vin chaud** / thé chaud" (alcohol at a school stand for pupils), while the body lists "Soupe chaude, thé à la cannelle et jus de pomme chaud". Remove "vin chaud".
- 🟠 **Instagram post 2**: "mardi 7 novembre à 19h30". 7 November 2025 was a **Friday**.
- 🟠 **Table ronde** news item (`2025-10-01`): no date or time is given. It points to "le formulaire d'inscription dans notre rubrique Activités", but no such form or event exists.
- 🟡 **"Réactivation" vs "constitutive"**: the news item says the association was "réactivée", and the AG is called "constitutive". FAPEO also says "réactivée". The wording is fine, but use it consistently.
- 🟡 `activites.html` mentions "bourse aux livres", "kermesses" and "soutien aux projets d'élèves". Check that these are real or planned activities.
- 🟡 Activities page: "Rejoignez notre **liste de diffusion**". There is no mailing list.
- 🟡 Past events are labelled "Voir le **compte-rendu**", but the link opens the original announcement.

### Language and typography

- 🟠 **Title case borrowed from English**: "Cafés des Parents", "Conférences & Tables Rondes", "Moments Festifs & Solidarité", "Écoute & Dialogue", "Rencontres & Cafés Parents", "Procès-Verbal de l'Assemblée Générale Constitutive". In French only the first word is capitalised: "Cafés des parents", "Conférences et tables rondes", etc.
- 🟡 **"&" in headings and navigation** ("Actualités & Blog", "Contact & Accès", "Statuts & PV d'AG"): this is acceptable in a menu, but "et" reads better in running headings.
- 🟡 **Inclusive writing is inconsistent**: "informé·es" and "venu·es" use the middle dot; "co-président-e-s" (copied from the statutes) uses hyphens; "le/la/les président(e)(s)" uses brackets. Pick one convention for the site's own text and leave the statutes text as adopted.
- 🟡 **Apostrophes**: the Markdown pages now get typographic apostrophes (’) from markdown-it, while the HTML pages keep straight ones ('). This is invisible to most readers.
- 🟡 "Blog" is an anglicism. "Actualités" alone is enough, since the page already says "Actualités, Blog & Informations".
- 🟡 Membership form: "Les champs marqués d'une astérisque". *Astérisque* is masculine, so it should be "d'**un** astérisque".
- 🟡 Home page: "Adhérer **en ligne**". Nothing is submitted online; the button only opens an e-mail. Use "Formulaire d'adhésion".
- 🟡 Issue template (`.github/ISSUE_TEMPLATE/proposer_document.yml`): the options are bilingual ("Événement futur (Upcoming event)"), but AGENTS.md says user-facing content is French only. The parsing code (`typeFromFormAnswer`) only looks at the French start, so the English part can be dropped safely. The template also says "ou insérez le lien du fichier joint", but only files uploaded to GitHub are accepted now.

### Documentation language

AGENTS.md says "all content should be in french", while README.md says "documentation: English". Decide which rule applies to README, REVIEW and commit messages.

## 4. Code

### Security

- 🟠 **Raw HTML in content Markdown**: markdown-it is configured with `html: true` for `content/` as well. A `.docx` whose text contains `<script>…` becomes raw HTML after the mammoth → turndown round-trip, and is published. Today the workflow only runs for owners, members and collaborators, which limits the risk. Still, rendering `content/` with `html: false` would close the hole (`pages/` needs HTML; `content/` doesn't).
- 🟡 **Self-XSS in `main.js`**: the membership confirmation puts `parentName`, `studentName` and `studentGrade` into `innerHTML` without escaping. Only the visitor's own input is used, so the risk is low, but `textContent` would avoid it.
- 🟡 `npm audit`: 5 moderate warnings from `sprintf-js`, pulled in by `gray-matter` (via js-yaml 3) and `mammoth` (via argparse). These are build-time only. Replacing gray-matter with a 20-line frontmatter parser would remove most of them.
- ✅ Fixed during the migration (listed here because they existed before):
  - The Python script sent `GITHUB_TOKEN` to any URL in the issue body. Downloads are now limited to GitHub hosts, and the token is only sent to github.com.
  - The commit message in the workflow used `${{ …doc_title }}`, so an issue title could inject shell commands. The values now go through environment variables.
  - Any GitHub user could publish to the site by opening an issue. The workflow now requires the `document` label and an author who is OWNER, MEMBER or COLLABORATOR.
  - Frontmatter was written as `title: "{title}"`, so a quote in the title broke the YAML. It is now written as JSON strings.

### Behaviour

- 🟠 **Forms depend on `mailto:`**: visitors who use webmail without a configured mail client can't send anything. Since the site is static, consider a form service (Formspree, Google Forms, or a "nouvelle adhésion" GitHub issue form) for membership requests.
- 🟠 **Pre-checked consent**: the "J'ai pris connaissance des statuts" checkbox is `checked` by default. The JS also doesn't check the box or the phone number, although both are marked required.
- 🟠 **Hard-coded values**:
  - "20 CHF" appears about 12 times in `pages/*`, `site/build.mjs` and `main.js`, even though `site.json` has `annual_fee_chf`. Use `{{site.membership.annual_fee_chf}}`.
  - `main.js` hard-codes `contact@apeco-voirets.ch`. Pass it in with a `data-` attribute.
- 🟠 **Unused data**: `site.json` has fields nothing reads: `base_url` (no longer needed), `language`, `geo_info`, `fapeo_instagram`, `fee_validity`, `payment_modes`, and `bank_details.beneficiary`, `.bank` and `.reference`. Meanwhile the page hard-codes "APECO Voirets", "BCGE Genève" and its own reference text. Either render from `site.json` or remove the fields.
- 🟠 **docx workflow edge cases**:
  - Adding a label to an already-processed issue re-runs the workflow. `git commit` then fails with "nothing to commit", and the run turns red.
  - The workflow doesn't close the issue after publishing.
  - Pushing straight to the default branch fails if branch protection is turned on. Opening a PR instead would also give the committee a review step.
- 🟠 **Images in `.docx` files**: mammoth inlines them as base64 `data:` URIs, so a single photo makes a Markdown file several MB in size. Save them under `static/images/` instead (mammoth's `convertImage` option).
- 🟠 **Instagram sync**:
  - The Instagram *Basic Display* API was shut down in December 2024. `graph.instagram.com/me/media` only works with a business or creator account using "Instagram API with Instagram Login", and its token expires after 60 days unless refreshed. Nothing refreshes it.
  - Public RSS bridges for Instagram (RSSHub, etc.) usually need cookies and break often.
  - In practice the cached feed will stay at the sample posts. Consider the Instagram embed widget, or a plain link to the profile.
- 🟡 Upcoming/past is decided at build time. The Pages workflow now rebuilds every night at 04:00 UTC, so an event can still be listed as upcoming for a few hours on its own day.
- 🟡 Relative-link rewriting only applies to Markdown links and images, not to raw `<a href>` inside `content/*.md`.
- 🟡 The home page's "Dernières nouvelles" has no empty state (other lists do).

### Privacy, accessibility, polish

- 🟡 **Google Fonts** are loaded from Google's servers, which sends visitors' IP addresses to Google (a recurring nLPD/GDPR point). Self-host Alegreya Sans in `static/`.
- 🟡 Emoji used as icons (📍 ⏰ ✉️ …) are read aloud by screen readers. Wrap them in `<span aria-hidden="true">`.
- 🟡 A real logo (`static/images/Logo_APECOV-e1475590342226.jpg`, untracked) has appeared. The site still uses a generated SVG (`logo.svg`) that has nothing to do with the association's identity.
- 🟡 Missing: a `404.html`, Open Graph tags (for sharing on WhatsApp), `sitemap.xml`, and a custom domain (`CNAME`) if one is planned.

---

## Suggested order

1. Ask the committee for the real IBAN, e-mail address, postal address, phone consent and the real PV (1.1–1.3, 1.7, 1.12).
2. Make the statutes page match the PDF (1.5, 1.6) and decide on the signed scan (§2).
3. Replace or remove the sample content (1.8) and fix the inconsistencies in §3.
4. Set `html: false` for `content/`, read the fee and e-mail from `site.json`, and choose a form solution.
5. Choose an Instagram approach that will keep working.
