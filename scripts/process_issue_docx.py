#!/usr/bin/env python3
"""
Convert Word Documents (.docx) attached in GitHub Issues into Markdown pages.
Determines whether the document represents an upcoming event or a meeting report (PV),
and places the resulting Markdown file in the appropriate directory.

All code and architecture are written in English; user-facing content is in French.
"""

import argparse
import datetime
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse

import mammoth
import requests


def slugify(text: str) -> str:
    """Generate a clean URL slug from text."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text.lower()).strip()
    return re.sub(r"[-\s]+", "-", text)


def extract_docx_urls_from_body(body: str) -> List[Tuple[str, str]]:
    """
    Find all .docx file URLs in the issue markdown text.
    Returns a list of tuples: (file_label, download_url)
    """
    if not body:
        return []

    results = []
    # Match markdown links: [Label](url.docx)
    markdown_link_pattern = re.compile(r"\[([^\]]+)\]\((https?://[^\s\)]+?\.docx[^\s\)]*)\)", re.IGNORECASE)
    for label, url in markdown_link_pattern.findall(body):
        results.append((label, url))

    # Match raw URLs if not already matched
    raw_url_pattern = re.compile(r"(https?://[^\s\)\<\>]+?\.docx[^\s\)\<\>]*)", re.IGNORECASE)
    existing_urls = {r[1] for r in results}
    for match in raw_url_pattern.findall(body):
        if match not in existing_urls:
            results.append(("Document", match))
            existing_urls.add(match)

    return results


def download_file(url: str, dest_path: Path, token: Optional[str] = None):
    """Download a remote file to a destination path."""
    headers = {"User-Agent": "APECO-Voirets-Docx-Processor/1.0"}
    if token:
        headers["Authorization"] = f"token {token}"
        headers["Accept"] = "application/octet-stream"

    response = requests.get(url, headers=headers, stream=True, allow_redirects=True)
    if response.status_code != 200:
        raise RuntimeError(f"Failed to download file from {url}: HTTP {response.status_code}")

    with open(dest_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)


def convert_docx_to_markdown(docx_path: Path) -> str:
    """Convert a .docx file to a clean Markdown string using mammoth."""
    with open(docx_path, "rb") as docx_file:
        result = mammoth.convert_to_markdown(docx_file)
        markdown_text = result.value
        messages = result.messages
        if messages:
            for msg in messages:
                print(f"[mammoth] {msg}", file=sys.stderr)
        # Clean unnecessarily escaped hyphens and periods from mammoth markdown output
        cleaned_text = re.sub(r"\\([-.])", r"\1", markdown_text)
        return cleaned_text.strip()


def detect_document_type(title: str, labels: List[str], text_sample: str) -> str:
    """
    Classify whether the document is:
    - 'event': future upcoming event
    - 'pv': meeting report / minutes of a past meeting
    - 'news': general announcement or article
    """
    labels_lower = [lbl.lower() for lbl in labels]
    title_lower = title.lower()
    text_lower = text_sample.lower()[:1500]

    # Explicit labels
    if any(l in ["event", "evenement", "activité", "activite"] for l in labels_lower):
        return "event"
    if any(l in ["pv", "meeting-report", "compte-rendu", "proces-verbal"] for l in labels_lower):
        return "pv"
    if any(l in ["nouvelle", "news", "actualite", "actualité"] for l in labels_lower):
        return "news"

    # Title heuristics
    if any(k in title_lower for k in ["procès-verbal", "proces-verbal", "pv ", "pv:", "compte-rendu", "cr de réunion", "assemblée générale"]):
        return "pv"
    if any(k in title_lower for k in ["invitation", "café des parents", "table ronde", "conférence", "fête", "bourse", "agenda"]):
        return "event"

    # Text content heuristics
    if any(k in text_lower for k in ["ordre du jour", "procès-verbal", "procès verbal", "étaient présents", "décharge des comptes"]):
        return "pv"
    if any(k in text_lower for k in ["au programme", "vous invite", "inscription", "rendez-vous le"]):
        return "event"

    return "event"  # Default to event if ambiguous


def parse_date_from_string(text: str) -> str:
    """Try to extract a date (YYYY-MM-DD) from text, otherwise return today's ISO date."""
    # Match YYYY-MM-DD
    iso_match = re.search(r"\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b", text)
    if iso_match:
        y, m, d = iso_match.groups()
        return f"{y}-{m}-{d}"

    # Match DD.MM.YYYY
    fr_match = re.search(r"\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](20\d{2})\b", text)
    if fr_match:
        d, m, y = fr_match.groups()
        return f"{y}-{m}-{d}"

    return datetime.date.today().isoformat()


def process_issue(event_path: Path, project_root: Path, token: Optional[str] = None) -> Optional[Path]:
    """Process a GitHub Issue event JSON payload."""
    with open(event_path, "r", encoding="utf-8") as f:
        event = json.load(f)

    issue = event.get("issue")
    if not issue:
        print("[ERROR] No 'issue' object found in event payload.", file=sys.stderr)
        return None

    issue_number = issue.get("number")
    issue_title = issue.get("title", "").strip()
    issue_body = issue.get("body", "") or ""
    issue_labels = [l.get("name", "") if isinstance(l, dict) else str(l) for l in issue.get("labels", [])]

    print(f"[*] Processing Issue #{issue_number}: {issue_title}")
    print(f"    Labels: {issue_labels}")

    docx_links = extract_docx_urls_from_body(issue_body)
    if not docx_links:
        print(f"[!] No .docx attachment found in issue #{issue_number}.")
        return None

    # Use the first attached docx file
    doc_label, doc_url = docx_links[0]
    print(f"[*] Found .docx attachment: {doc_label} -> {doc_url}")

    temp_docx = project_root / f"temp_issue_{issue_number}.docx"
    try:
        download_file(doc_url, temp_docx, token=token)
        markdown_body = convert_docx_to_markdown(temp_docx)
    finally:
        if temp_docx.exists():
            temp_docx.unlink()

    doc_type = detect_document_type(issue_title, issue_labels, markdown_body)
    date_str = parse_date_from_string(issue_title + " " + markdown_body[:300])

    # Generate a clean summary
    lines = [l.strip() for l in markdown_body.splitlines() if l.strip() and not l.startswith("#")]
    summary = lines[0] if lines else "Document d'information de l'APECO Voirets."
    if len(summary) > 200:
        summary = summary[:197] + "..."

    # Determine destination directory
    if doc_type == "event":
        dest_dir = project_root / "content" / "evenements"
        category = "Événements"
    elif doc_type == "pv":
        dest_dir = project_root / "content" / "pv"
        category = "PV AG"
    else:
        dest_dir = project_root / "content" / "nouvelles"
        category = "Actualités"

    dest_dir.mkdir(parents=True, exist_ok=True)
    slug = slugify(issue_title)
    if not slug:
        slug = f"doc-issue-{issue_number}"

    filename = f"{date_str}-{slug}.md"
    target_file = dest_dir / filename

    # Build Frontmatter
    frontmatter_content = [
        "---",
        f'title: "{issue_title}"',
        f'date: "{date_str}"',
        f'type: "{doc_type}"',
        f'category: "{category}"',
        f'summary: "{summary}"',
        f'author: "APECO Voirets"',
        f'source_issue: "#{issue_number}"',
        "---",
        "",
        markdown_body,
        "",
    ]

    with open(target_file, "w", encoding="utf-8") as f:
        f.write("\n".join(frontmatter_content))

    print(f"[✓] Successfully created page: {target_file}")

    # Set GitHub Actions output parameters if available
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a", encoding="utf-8") as f:
            f.write(f"created_file={target_file}\n")
            f.write(f"doc_type={doc_type}\n")
            f.write(f"doc_title={issue_title}\n")
            f.write(f"issue_number={issue_number}\n")

    return target_file


def process_local_file(
    file_path: Path,
    title: str,
    doc_type: str,
    project_root: Path,
    date_str: Optional[str] = None,
) -> Path:
    """Manually convert a local .docx file into Markdown."""
    markdown_body = convert_docx_to_markdown(file_path)
    if not date_str:
        date_str = parse_date_from_string(title + " " + markdown_body[:300])

    lines = [l.strip() for l in markdown_body.splitlines() if l.strip() and not l.startswith("#")]
    summary = lines[0] if lines else "Document d'information de l'APECO Voirets."
    if len(summary) > 200:
        summary = summary[:197] + "..."

    if doc_type == "event":
        dest_dir = project_root / "content" / "evenements"
        category = "Événements"
    elif doc_type == "pv":
        dest_dir = project_root / "content" / "pv"
        category = "PV AG"
    else:
        dest_dir = project_root / "content" / "nouvelles"
        category = "Actualités"

    dest_dir.mkdir(parents=True, exist_ok=True)
    slug = slugify(title)
    filename = f"{date_str}-{slug}.md"
    target_file = dest_dir / filename

    content = [
        "---",
        f'title: "{title}"',
        f'date: "{date_str}"',
        f'type: "{doc_type}"',
        f'category: "{category}"',
        f'summary: "{summary}"',
        f'author: "APECO Voirets"',
        "---",
        "",
        markdown_body,
        "",
    ]

    with open(target_file, "w", encoding="utf-8") as f:
        f.write("\n".join(content))

    print(f"[✓] Created markdown page: {target_file}")
    return target_file


def main():
    parser = argparse.ArgumentParser(description="Convert .docx attached to GitHub issue to Markdown page")
    parser.add_argument("--event-path", type=Path, default=None, help="Path to GitHub event.json payload")
    parser.add_argument("--file", type=Path, default=None, help="Local .docx file to convert manually")
    parser.add_argument("--title", type=str, default="", help="Title for manual file conversion")
    parser.add_argument("--type", choices=["event", "pv", "news"], default="event", help="Document type")
    parser.add_argument("--date", type=str, default=None, help="Date (YYYY-MM-DD)")
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="Root path of the project",
    )
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN")

    if args.file:
        title = args.title or args.file.stem.replace("-", " ").title()
        process_local_file(args.file, title, args.type, args.project_root, args.date)
    else:
        event_path = args.event_path or (Path(os.environ["GITHUB_EVENT_PATH"]) if "GITHUB_EVENT_PATH" in os.environ else None)
        if not event_path or not event_path.exists():
            print("[ERROR] No GitHub event path provided and --file not specified.", file=sys.stderr)
            sys.exit(1)
        process_issue(event_path, args.project_root, token=token)


if __name__ == "__main__":
    main()
