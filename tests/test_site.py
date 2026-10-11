"""
Integration tests for APECO Voirets static site generator and automation scripts.
All tests are written in English.
"""

import json
import os
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path

from build import SiteBuilder
from scripts.process_issue_docx import (
    convert_docx_to_markdown,
    detect_document_type,
    parse_date_from_string,
    process_issue,
    slugify,
)
from scripts.sync_instagram import parse_tags_from_caption, update_instagram_feed


def create_minimal_docx(file_path: Path, title: str, text: str):
    """Create a minimal valid .docx file for testing without needing Microsoft Word."""
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>{title}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{text}</w:t></w:r></w:p>
  </w:body>
</w:document>"""

    with zipfile.ZipFile(file_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document_xml)


class TestSiteGenerator(unittest.TestCase):
    def setUp(self):
        self.project_dir = Path(__file__).resolve().parent.parent
        self.temp_output = Path(tempfile.mkdtemp())

    def tearDown(self):
        if self.temp_output.exists():
            shutil.rmtree(self.temp_output)

    def test_build_generation(self):
        builder = SiteBuilder(self.project_dir, self.temp_output)
        builder.build()

        # Check required HTML files
        required_pages = [
            "index.html",
            "statuts.html",
            "activites.html",
            "adhesion.html",
            "contact.html",
            "nouvelles.html",
            "evenements/2025-11-15-cafe-des-parents-automne.html",
            "pv/2025-08-25-pv-ag-constitutive.html",
            ".nojekyll",
        ]
        for page in required_pages:
            target = self.temp_output / page
            self.assertTrue(target.exists(), f"Expected {page} to be generated")
            if page != ".nojekyll":
                self.assertGreater(target.stat().st_size, 0, f"{page} is empty")

        # Verify static assets
        self.assertTrue((self.temp_output / "static" / "css" / "style.css").exists())
        self.assertTrue((self.temp_output / "static" / "js" / "main.js").exists())
        self.assertTrue((self.temp_output / "static" / "images" / "logo.svg").exists())

        # Verify statutes PDF is available
        pdf_path = self.temp_output / "static" / "docs" / "Statuts_APECO_Voirets_Aout_2025.pdf"
        self.assertTrue(pdf_path.exists(), "Statutes PDF should be present in static/docs/")

        # Verify French content on index.html
        index_content = (self.temp_output / "index.html").read_text(encoding="utf-8")
        self.assertIn("APECO Voirets", index_content)
        self.assertIn("Devenir membre", index_content)
        self.assertIn("FAPEO", index_content)

        # Verify statutes page content
        statuts_content = (self.temp_output / "statuts.html").read_text(encoding="utf-8")
        self.assertIn("Art. 1 :", statuts_content)
        self.assertIn("Art. 14 :", statuts_content)
        self.assertIn("Procès-verbal", statuts_content)

        # Verify membership page content
        adhesion_content = (self.temp_output / "adhesion.html").read_text(encoding="utf-8")
        self.assertIn("20 CHF", adhesion_content)
        self.assertIn("BCGE", adhesion_content)


class TestDocxAutomation(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp())

    def tearDown(self):
        if self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)

    def test_slugify(self):
        self.assertEqual(slugify("Café des Parents 2025 !"), "cafe-des-parents-2025")
        self.assertEqual(slugify("Procès-verbal d'AG"), "proces-verbal-dag")

    def test_date_parsing(self):
        self.assertEqual(parse_date_from_string("Réunion du 2025-11-20 au cycle"), "2025-11-20")
        self.assertEqual(parse_date_from_string("Séance du 15.09.2025"), "2025-09-15")

    def test_document_classification(self):
        self.assertEqual(detect_document_type("Invitation Café des Parents", [], ""), "event")
        self.assertEqual(detect_document_type("Procès-verbal réunion comité", [], ""), "pv")
        self.assertEqual(detect_document_type("PV Assemblée Générale", [], ""), "pv")
        self.assertEqual(detect_document_type("Divers", ["event"], ""), "event")
        self.assertEqual(detect_document_type("Divers", ["pv"], ""), "pv")

    def test_docx_conversion(self):
        docx_file = self.temp_dir / "sample.docx"
        create_minimal_docx(
            docx_file,
            "Compte-rendu de reunion",
            "Discussion relative aux activites scolaires et aux projets d'eleves.",
        )

        markdown_text = convert_docx_to_markdown(docx_file)
        self.assertIn("Compte-rendu de reunion", markdown_text)
        self.assertIn("Discussion relative aux activites scolaires", markdown_text)


class TestInstagramSync(unittest.TestCase):
    def test_tag_parsing(self):
        caption = "Un super moment au cycle ! #apeco #voirets #geneve"
        tags = parse_tags_from_caption(caption)
        self.assertEqual(tags, ["#apeco", "#voirets", "#geneve"])


if __name__ == "__main__":
    unittest.main()
