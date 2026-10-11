#!/usr/bin/env python3
"""
APECO Voirets - Instagram Feed Monitor & Synchronizer
Monitors an Instagram feed (via RSS bridge, public JSON proxy, or Instagram Graph API)
and updates data/instagram_feed.json and optionally generates Markdown news posts.

All code and architecture are written in English; user-facing content is in French.
"""

import argparse
import datetime
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import feedparser
import requests


def parse_tags_from_caption(caption: str) -> List[str]:
    """Extract hashtag strings from a caption."""
    return re.findall(r"#\w+", caption)


def fetch_from_rss(rss_url: str) -> List[Dict[str, Any]]:
    """Fetch posts from an RSS bridge (e.g., RSSHub, OpenRSS)."""
    feed = feedparser.parse(rss_url)
    posts = []

    for entry in feed.entries[:10]:
        caption = entry.get("summary", "") or entry.get("title", "")
        # Strip HTML tags from caption
        clean_caption = re.sub(r"<[^>]+>", "", caption).strip()

        # Parse publication date
        published = entry.get("published_parsed") or entry.get("updated_parsed")
        if published:
            date_str = datetime.date(published.tm_year, published.tm_mon, published.tm_mday).isoformat()
        else:
            date_str = datetime.date.today().isoformat()

        post_id = entry.get("id") or entry.get("link", f"ig-{date_str}")
        tags = parse_tags_from_caption(clean_caption)

        posts.append({
            "id": post_id,
            "caption": clean_caption[:350],
            "date": date_str,
            "permalink": entry.get("link", "https://www.instagram.com/apeco_voirets/"),
            "tags": tags,
        })

    return posts


def fetch_from_graph_api(access_token: str) -> List[Dict[str, Any]]:
    """Fetch recent posts from official Instagram Basic Display / Graph API."""
    url = f"https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,permalink,timestamp&access_token={access_token}"
    response = requests.get(url, timeout=10)
    if response.status_code != 200:
        raise RuntimeError(f"Instagram API error HTTP {response.status_code}: {response.text}")

    data = response.json()
    posts = []
    for item in data.get("data", [])[:10]:
        caption = item.get("caption", "").strip()
        timestamp = item.get("timestamp", "")
        date_str = timestamp[:10] if timestamp else datetime.date.today().isoformat()
        tags = parse_tags_from_caption(caption)

        posts.append({
            "id": item.get("id"),
            "caption": caption[:350],
            "date": date_str,
            "permalink": item.get("permalink", "https://www.instagram.com/apeco_voirets/"),
            "tags": tags,
        })
    return posts


def update_instagram_feed(
    data_file: Path,
    rss_url: Optional[str] = None,
    api_token: Optional[str] = None,
    create_posts: bool = False,
    project_root: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """Synchronize Instagram feed with local storage."""
    posts: List[Dict[str, Any]] = []

    if api_token:
        print("[*] Fetching from Instagram Graph API...")
        try:
            posts = fetch_from_graph_api(api_token)
        except Exception as e:
            print(f"[WARN] Failed fetching from Graph API: {e}", file=sys.stderr)

    if not posts and rss_url:
        print(f"[*] Fetching from Instagram RSS bridge: {rss_url}...")
        try:
            posts = fetch_from_rss(rss_url)
        except Exception as e:
            print(f"[WARN] Failed fetching from RSS: {e}", file=sys.stderr)

    if not posts:
        print("[*] No live posts fetched. Checking existing cached feed...")
        if data_file.exists():
            with open(data_file, "r", encoding="utf-8") as f:
                posts = json.load(f)
        else:
            posts = []

    # Save to data_file
    data_file.parent.mkdir(parents=True, exist_ok=True)
    with open(data_file, "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)
    print(f"[✓] Saved {len(posts)} posts to {data_file}")

    # Optionally generate markdown articles in content/nouvelles/
    if create_posts and project_root and posts:
        news_dir = project_root / "content" / "nouvelles"
        news_dir.mkdir(parents=True, exist_ok=True)

        for post in posts[:3]:
            post_id = re.sub(r"[^\w-]", "", str(post.get("id", "post"))[-12:])
            date_str = post.get("date", datetime.date.today().isoformat())
            filename = f"{date_str}-instagram-{post_id}.md"
            filepath = news_dir / filename

            if not filepath.exists():
                caption = post.get("caption", "Nouvelle publication Instagram")
                first_sentence = caption.split(".")[0] if "." in caption else caption[:60]
                content = [
                    "---",
                    f'title: "Sur Instagram : {first_sentence}"',
                    f'date: "{date_str}"',
                    f'category: "Instagram"',
                    f'author: "APECO Voirets"',
                    f'summary: "{caption[:160]}..."',
                    "---",
                    "",
                    caption,
                    "",
                    f"[Voir la publication originale sur Instagram]({post.get('permalink')})",
                    "",
                ]
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write("\n".join(content))
                print(f"    Generated news post: {filepath.name}")

    return posts


def main():
    parser = argparse.ArgumentParser(description="Synchronize Instagram feed for APECO Voirets")
    parser.add_argument("--rss-url", type=str, default=None, help="RSS feed URL for Instagram bridge")
    parser.add_argument("--token", type=str, default=None, help="Instagram Basic Display API token")
    parser.add_argument("--create-posts", action="store_true", help="Generate Markdown posts in content/nouvelles/")
    parser.add_argument(
        "--data-file",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "data" / "instagram_feed.json",
        help="Path to instagram_feed.json",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    rss_url = args.rss_url or os.environ.get("INSTAGRAM_RSS_URL")
    api_token = args.token or os.environ.get("INSTAGRAM_ACCESS_TOKEN")

    update_instagram_feed(
        data_file=args.data_file,
        rss_url=rss_url,
        api_token=api_token,
        create_posts=args.create_posts,
        project_root=project_root,
    )


if __name__ == "__main__":
    main()
