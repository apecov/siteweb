#!/usr/bin/env python3
"""
APECO Voirets - Local Development Server
Builds the static site and serves it via Python's built-in HTTP server.
"""

import argparse
import http.server
import os
import socketserver
import sys
from pathlib import Path

from build import SiteBuilder


class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler that serves files from the build directory."""

    def end_headers(self):
        # Disable caching in development for immediate feedback
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve the static website locally")
    parser.add_argument("--port", type=int, default=8000, help="Port to serve on (default: 8000)")
    parser.add_argument("--no-build", action="store_true", help="Skip rebuilding before serving")
    args = parser.parse_args()

    project_dir = Path(__file__).resolve().parent
    output_dir = project_dir / "_site"

    if not args.no_build:
        print("[*] Rebuilding static site before launching server...")
        builder = SiteBuilder(project_dir, output_dir)
        builder.build()

    os.chdir(str(output_dir))
    handler = CustomHTTPRequestHandler

    print("\n" + "=" * 60)
    print(f"🚀 APECO Voirets local dev server running!")
    print(f"   URL: http://localhost:{args.port}/")
    print(f"   Serving directory: {output_dir}")
    print(f"   Press Ctrl+C to stop the server.")
    print("=" * 60 + "\n")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", args.port), handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping server...")
            httpd.server_close()


if __name__ == "__main__":
    main()
