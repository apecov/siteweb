#!/usr/bin/env python3
"""
APECO Voirets - Static Site Generator
Renders Markdown content and Jinja2 templates into a static HTML website.
All code and architecture are written in English; user-facing content is in French.
"""

import argparse
import datetime
import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import frontmatter
import jinja2
import markdown

# French month names for human-readable date formatting
FRENCH_MONTHS = {
    1: "janvier",
    2: "février",
    3: "mars",
    4: "avril",
    5: "mai",
    6: "juin",
    7: "juillet",
    8: "août",
    9: "septembre",
    10: "octobre",
    11: "novembre",
    12: "décembre",
}


def format_french_date(date_str: str) -> str:
    """Format an ISO date string (YYYY-MM-DD) into French text (e.g., '25 août 2025')."""
    if not date_str:
        return ""
    try:
        dt = datetime.datetime.strptime(str(date_str)[:10], "%Y-%m-%d")
        month_name = FRENCH_MONTHS.get(dt.month, str(dt.month))
        return f"{dt.day} {month_name} {dt.year}"
    except (ValueError, TypeError):
        return str(date_str)


class SiteBuilder:
    """Static site builder for the APECO Voirets website."""

    def __init__(self, project_dir: Path, output_dir: Path, base_url: str = ""):
        self.project_dir = project_dir
        self.output_dir = output_dir
        self.base_url = base_url.rstrip("/")

        # Load site configuration
        config_path = self.project_dir / "data" / "site.json"
        if not config_path.exists():
            raise FileNotFoundError(f"Configuration file not found: {config_path}")
        with open(config_path, "r", encoding="utf-8") as f:
            self.site_config = json.load(f)

        if self.base_url:
            self.site_config["base_url"] = self.base_url
        else:
            self.site_config["base_url"] = self.site_config.get("base_url", "")

        # Load Instagram feed cache if available
        ig_path = self.project_dir / "data" / "instagram_feed.json"
        self.instagram_posts: List[Dict[str, Any]] = []
        if ig_path.exists():
            try:
                with open(ig_path, "r", encoding="utf-8") as f:
                    self.instagram_posts = json.load(f)
            except Exception as e:
                print(f"[WARN] Failed to load instagram_feed.json: {e}", file=sys.stderr)

        # Setup Jinja2 environment
        templates_dir = self.project_dir / "templates"
        self.jinja_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(templates_dir)),
            autoescape=jinja2.select_autoescape(["html", "xml"]),
        )
        self.jinja_env.filters["date_fr"] = format_french_date

        # Setup Markdown renderer
        self.md_renderer = markdown.Markdown(
            extensions=[
                "extra",
                "toc",
                "nl2br",
                "sane_lists",
            ],
            output_format="html5",
        )

    def render_markdown(self, text: str) -> str:
        """Convert markdown text to HTML string."""
        self.md_renderer.reset()
        return self.md_renderer.convert(text)

    def load_collection(self, subdir: str, item_type: str = "") -> List[Dict[str, Any]]:
        """Load and parse markdown files from a content sub-directory."""
        collection_dir = self.project_dir / "content" / subdir
        items = []
        if not collection_dir.exists():
            return items

        for file_path in sorted(collection_dir.glob("*.md")):
            try:
                post = frontmatter.load(file_path)
                data = dict(post.metadata)
                slug = file_path.stem
                # Clean URL and paths
                dest_dir = self.output_dir / subdir
                dest_file = dest_dir / f"{slug}.html"
                relative_url = f"{subdir}/{slug}.html"

                html_content = self.render_markdown(post.content)

                date_val = str(data.get("date", ""))
                formatted_date = format_french_date(date_val)

                item = {
                    "slug": slug,
                    "title": data.get("title", slug.replace("-", " ").title()),
                    "date": date_val,
                    "date_formatted": formatted_date,
                    "summary": data.get("summary", ""),
                    "category": data.get("category", ""),
                    "author": data.get("author", "APECO Voirets"),
                    "location": data.get("location", ""),
                    "time": data.get("time", ""),
                    "type": data.get("type", item_type),
                    "metadata": data,
                    "content": html_content,
                    "source_path": file_path,
                    "dest_path": dest_file,
                    "url": relative_url,
                }
                items.append(item)
            except Exception as e:
                print(f"[WARN] Error reading {file_path}: {e}", file=sys.stderr)

        # Sort collection by date descending
        items.sort(key=lambda x: str(x.get("date", "")), reverse=True)
        return items

    def write_html_file(self, dest_path: Path, html_content: str):
        """Ensure destination folder exists and write HTML file."""
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "w", encoding="utf-8") as f:
            f.write(html_content)

    def build(self):
        """Execute full static site build process."""
        print(f"[*] Starting site build into: {self.output_dir}")
        start_time = datetime.datetime.now()

        # Clean or prepare output directory
        if self.output_dir.exists():
            shutil.rmtree(self.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Copy static assets
        static_src = self.project_dir / "static"
        static_dest = self.output_dir / "static"
        if static_src.exists():
            shutil.copytree(static_src, static_dest)
            print(f"    Copied static assets from {static_src} -> {static_dest}")

        # Also copy statutes PDF if in root
        root_pdf = self.project_dir / "Statuts APECO Voirets, Août 2025.pdf"
        if root_pdf.exists():
            docs_dir = self.output_dir / "static" / "docs"
            docs_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root_pdf, docs_dir / "Statuts_APECO_Voirets_Aout_2025.pdf")

        # Load content collections
        news_items = self.load_collection("nouvelles", item_type="news")
        event_items = self.load_collection("evenements", item_type="event")
        pv_items = self.load_collection("pv", item_type="pv")

        # Separate upcoming vs past events
        today_str = datetime.date.today().isoformat()
        upcoming_events = [e for e in event_items if str(e.get("date", "")) >= today_str]
        past_events = [e for e in event_items if str(e.get("date", "")) < today_str]
        # If there are no future events, treat all as upcoming for demonstration/preview
        if not upcoming_events and event_items:
            upcoming_events = event_items
            past_events = []

        common_context = {
            "site": self.site_config,
            "base_url": self.site_config.get("base_url", ""),
            "current_year": datetime.date.today().year,
            "instagram_posts": self.instagram_posts,
        }

        # 1. Render Homepage (index.html)
        home_template = self.jinja_env.get_template("home.html")
        home_html = home_template.render(
            **common_context,
            current_page="index.html",
            page_title="Accueil",
            page_description=self.site_config.get("description"),
            latest_news=news_items,
            upcoming_events=upcoming_events,
            meeting_reports=pv_items,
        )
        self.write_html_file(self.output_dir / "index.html", home_html)
        print("    Rendered: index.html")

        # 2. Render Statuts & PV Page (statuts.html)
        statuts_template = self.jinja_env.get_template("statuts.html")
        statuts_html = statuts_template.render(
            **common_context,
            current_page="statuts.html",
            page_title="Statuts & Procès-verbaux d'AG",
            page_description="Statuts officiels et procès-verbaux de l'APECO Voirets.",
            meeting_reports=pv_items,
        )
        self.write_html_file(self.output_dir / "statuts.html", statuts_html)
        print("    Rendered: statuts.html")

        # 3. Render Activités & Agenda Page (activites.html)
        activites_template = self.jinja_env.get_template("activites.html")
        activites_html = activites_template.render(
            **common_context,
            current_page="activites.html",
            page_title="Activités & Agenda",
            page_description="Agenda des événements, cafés des parents et activités de l'APECO Voirets.",
            upcoming_events=upcoming_events,
            past_events=past_events,
        )
        self.write_html_file(self.output_dir / "activites.html", activites_html)
        print("    Rendered: activites.html")

        # 4. Render Adhésion Page (adhesion.html)
        adhesion_template = self.jinja_env.get_template("adhesion.html")
        adhesion_html = adhesion_template.render(
            **common_context,
            current_page="adhesion.html",
            page_title="Devenir membre",
            page_description="Formulaire d'adhésion à l'APECO Voirets (cotisation annuelle 20 CHF).",
        )
        self.write_html_file(self.output_dir / "adhesion.html", adhesion_html)
        print("    Rendered: adhesion.html")

        # 5. Render Contact Page (contact.html)
        contact_template = self.jinja_env.get_template("contact.html")
        contact_html = contact_template.render(
            **common_context,
            current_page="contact.html",
            page_title="Contact & Accès",
            page_description="Coordonnées, formulaire de contact et plan d'accès de l'APECO Voirets.",
        )
        self.write_html_file(self.output_dir / "contact.html", contact_html)
        print("    Rendered: contact.html")

        # 6. Render News List Page (nouvelles.html)
        news_template = self.jinja_env.get_template("news_list.html")
        news_html = news_template.render(
            **common_context,
            current_page="nouvelles.html",
            page_title="Actualités & Blog",
            page_description="Toutes les actualités et annonces de l'APECO Voirets.",
            news=news_items,
        )
        self.write_html_file(self.output_dir / "nouvelles.html", news_html)
        print("    Rendered: nouvelles.html")

        # 7. Render Individual News Detail Pages
        news_detail_template = self.jinja_env.get_template("news_detail.html")
        for item in news_items:
            detail_html = news_detail_template.render(
                **common_context,
                current_page="nouvelles.html",
                page_title=item["title"],
                page_description=item["summary"],
                **item,
            )
            self.write_html_file(item["dest_path"], detail_html)
            print(f"    Rendered: {item['url']}")

        # 8. Render Individual Events & PV Detail Pages
        page_template = self.jinja_env.get_template("page.html")
        for event in event_items:
            event_html = page_template.render(
                **common_context,
                current_page="activites.html",
                page_title=event["title"],
                page_description=event["summary"],
                back_url="activites.html",
                back_label="Retour aux activités",
                **event,
            )
            self.write_html_file(event["dest_path"], event_html)
            print(f"    Rendered: {event['url']}")

        for pv in pv_items:
            pv_html = page_template.render(
                **common_context,
                current_page="statuts.html",
                page_title=pv["title"],
                page_description=pv["summary"],
                back_url="statuts.html",
                back_label="Retour aux statuts & PV",
                **pv,
            )
            self.write_html_file(pv["dest_path"], pv_html)
            print(f"    Rendered: {pv['url']}")

        # 9. Render Any Custom Root Markdown Pages in content/
        content_dir = self.project_dir / "content"
        for md_file in content_dir.glob("*.md"):
            slug = md_file.stem
            # Skip if already rendered as a specialized page above
            if slug in ["index", "statuts", "activites", "adhesion", "contact", "nouvelles"]:
                continue
            post = frontmatter.load(md_file)
            rendered_content = self.render_markdown(post.content)
            page_html = page_template.render(
                **common_context,
                page_title=post.metadata.get("title", slug.title()),
                page_description=post.metadata.get("summary", ""),
                content=rendered_content,
            )
            self.write_html_file(self.output_dir / f"{slug}.html", page_html)
            print(f"    Rendered custom root page: {slug}.html")

        # Write .nojekyll to ensure GitHub Pages serves static files directly
        (self.output_dir / ".nojekyll").touch()

        duration = (datetime.datetime.now() - start_time).total_seconds()
        print(f"[✓] Build complete in {duration:.2f} seconds!")


def main():
    parser = argparse.ArgumentParser(description="APECO Voirets Static Site Generator")
    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Root directory of the project",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "_site",
        help="Destination directory for built static HTML files",
    )
    parser.add_argument(
        "--base-url",
        type=str,
        default="",
        help="Base URL prefix for links (useful for GitHub Pages project sites)",
    )
    args = parser.parse_args()

    builder = SiteBuilder(args.project_dir, args.output_dir, args.base_url)
    builder.build()


if __name__ == "__main__":
    main()
