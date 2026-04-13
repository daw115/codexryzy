#!/usr/bin/env python3
"""Backfill a public Google Drive folder of Outlook .msg files into a local knowledge base."""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import html
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Iterable


DEFAULT_FOLDER_ID = "1Zq9MPcvbzhr6UeGS5EfdwhKVol2Upltm"
DEFAULT_DB_PATH = "knowledge_base/mail_knowledge.db"
DEFAULT_REPORT_PATH = "reports/mail_research.md"
DEFAULT_MAX_WORKERS = 6
DEFAULT_TIMEOUT = 60
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

ENTRY_REGEX = re.compile(
    r'<div class="flip-entry" id="entry-([^"]+)"[\s\S]*?'
    r'<a href="https://drive\.google\.com/file/d/([^/]+)/view\?usp=drive_web"[\s\S]*?'
    r'<div class="flip-entry-title">\s*([\s\S]*?)\s*</div>[\s\S]*?'
    r'<div class="flip-entry-last-modified"><div>([^<]+)</div>',
)
EMAIL_REGEX = re.compile(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[A-Za-z]{2,}\b")
URL_REGEX = re.compile(r"https?://[^\s<>'\"()]+")
DATE_REGEX = re.compile(
    r"\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{2}[./-]\d{2})\b"
)

STOPWORDS = {
    "oraz",
    "that",
    "this",
    "with",
    "from",
    "your",
    "have",
    "will",
    "please",
    "they",
    "them",
    "were",
    "been",
    "jest",
    "oraz",
    "oraz",
    "bardzo",
    "prosz",
    "prosze",
    "dzie",
    "dzien",
    "dobry",
    "informacja",
    "informacje",
    "aktualizacja",
    "mail",
    "wiadomosc",
    "wiadomo",
    "reply",
    "fwd",
    "msg",
    "the",
    "and",
    "for",
    "are",
    "you",
    "that",
    "all",
    "not",
    "was",
    "but",
    "have",
    "has",
    "our",
    "out",
    "przez",
    "oraz",
    "jego",
    "niej",
    "tego",
    "tych",
    "które",
    "ktore",
    "który",
    "ktory",
    "będę",
    "bedzie",
    "będzie",
    "pani",
    "pan",
    "oraz",
    "projektów",
    "projektow",
    "aktualny",
    "updated",
}

CATEGORY_RULES = [
    (
        "Market Coupling / Aukcje / Capacity",
        re.compile(
            r"\b(market coupling|aukcj|zdolno|capacity|alokowan|cross-border|idcc|lttr|see|mesc|perun|iva)\b",
            re.I,
        ),
    ),
    (
        "Harmonogramy / Projekty / Milestones",
        re.compile(r"\b(harmonogram|projekt|roadmap|milestone|plan wdro|status projektu)\b", re.I),
    ),
    (
        "Spotkania / Komitety / Warsztaty",
        re.compile(r"\b(spotkani|meeting|warsztat|agenda|minutes|kwks|call|komitet)\b", re.I),
    ),
    (
        "Administracja / Raportowanie / Rejestry",
        re.compile(r"\b(pracochłon|rejestr|timesheet|raport|ewidenc|hr|urlop|szkoleni)\b", re.I),
    ),
    (
        "Umowy / Oferty / Zakupy",
        re.compile(r"\b(umow|ofert|przetarg|zamów|zamow|procurement|rfp|zakup)\b", re.I),
    ),
    (
        "Podróże / Newslettery / Niski sygnał",
        re.compile(r"\b(lot|podró|podroz|życzeni|zyczeni|newsletter|webinar|promocj|upgrade)\b", re.I),
    ),
]


def env(name: str, default: str) -> str:
    value = os.environ.get(name, default)
    return value.strip() or default


FOLDER_ID = env("DRIVE_FOLDER_ID", DEFAULT_FOLDER_ID)
DB_PATH = Path(env("MAIL_KB_DB", DEFAULT_DB_PATH))
REPORT_PATH = Path(env("MAIL_RESEARCH_REPORT", DEFAULT_REPORT_PATH))
MAX_WORKERS = int(env("MAIL_KB_WORKERS", str(DEFAULT_MAX_WORKERS)))
TIMEOUT = int(env("MAIL_KB_TIMEOUT", str(DEFAULT_TIMEOUT)))


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return response.read()


def fetch_text(url: str) -> str:
    return fetch(url).decode("utf-8", errors="ignore")


def fetch_with_retries(url: str, attempts: int = 3) -> bytes:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return fetch(url)
        except Exception as error:  # pragma: no cover - retry path
            last_error = error
            if attempt == attempts:
                raise
            time.sleep(min(2 * attempt, 5))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def decode_html_text(value: str) -> str:
    return html.unescape(re.sub(r"\s+", " ", value).strip())


def list_drive_entries(folder_id: str) -> list[dict[str, str]]:
    listing_url = f"https://drive.google.com/embeddedfolderview?id={folder_id}#list"
    page = fetch_text(listing_url)
    entries = []
    for entry_id, file_id, title_raw, modified_label in ENTRY_REGEX.findall(page):
        title = decode_html_text(title_raw)
        entries.append(
            {
                "entry_id": entry_id,
                "file_id": file_id,
                "title": title,
                "modified_label": decode_html_text(modified_label),
                "source_url": f"https://drive.google.com/file/d/{file_id}/view",
            }
        )
    return entries


def build_download_url(file_id: str) -> str:
    first_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    text = fetch_text(first_url)
    form_match = re.search(
        r'<form id="download-form" action="([^"]+)" method="get">[\s\S]*?'
        r'name="id" value="([^"]+)"[\s\S]*?'
        r'name="export" value="([^"]+)"[\s\S]*?'
        r'name="confirm" value="([^"]+)"[\s\S]*?'
        r'name="uuid" value="([^"]+)"',
        text,
    )
    if not form_match:
        return first_url

    action, found_id, export_value, confirm, uuid = form_match.groups()
    query = urllib.parse.urlencode(
        {
            "id": found_id,
            "export": export_value,
            "confirm": confirm,
            "uuid": uuid,
        }
    )
    return f"{action}?{query}"


def normalize_title(title: str) -> str:
    normalized = title
    normalized = re.sub(r"\.msg$", "", normalized, flags=re.I)
    normalized = re.sub(r"^(re|fw|fwd)\s*[:_ -]+\s*", "", normalized, flags=re.I)
    normalized = re.sub(r"\s+\(\d+\)$", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def extract_ascii_strings(buffer: bytes) -> list[str]:
    strings: list[str] = []
    current: list[str] = []
    for byte in buffer:
        if byte in (9, 10, 13) or 32 <= byte <= 126:
            current.append(chr(byte))
        else:
            if len(current) >= 8:
                strings.append("".join(current))
            current = []
    if len(current) >= 8:
        strings.append("".join(current))
    return strings


def extract_utf16_strings(buffer: bytes) -> list[str]:
    strings: list[str] = []
    current: list[str] = []
    for index in range(0, len(buffer) - 1, 2):
        codepoint = buffer[index] | (buffer[index + 1] << 8)
        if codepoint in (9, 10, 13) or 32 <= codepoint <= 126 or 160 <= codepoint <= 383:
            current.append(chr(codepoint))
        else:
            if len(current) >= 8:
                strings.append("".join(current))
            current = []
    if len(current) >= 8:
        strings.append("".join(current))
    return strings


def clean_text(value: str) -> str:
    value = value.replace("\r", "")
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def extract_msg_payload(entry: dict[str, str]) -> dict[str, object]:
    binary = fetch_with_retries(build_download_url(entry["file_id"]))
    ascii_strings = extract_ascii_strings(binary)
    utf16_strings = extract_utf16_strings(binary)
    ascii_joined = "\n".join(ascii_strings)
    html_match = re.search(r"<html[\s\S]*?</html>", ascii_joined, flags=re.I)

    body_text = ""
    if html_match:
        html_fragment = html_match.group(0)
        body_match = re.search(r"<body[^>]*>([\s\S]*?)</body>", html_fragment, flags=re.I)
        if body_match:
            html_fragment = body_match.group(1)
        body_text = clean_text(
            html.unescape(
                re.sub(
                    r"<[^>]+>",
                    " ",
                    re.sub(
                        r"</(p|div)>",
                        "\n",
                        re.sub(r"<br\s*/?>", "\n", html_fragment, flags=re.I),
                        flags=re.I,
                    ),
                )
            )
        )

    if not body_text:
        fallback = "\n".join(utf16_strings[:120] + ascii_strings[:120])
        body_text = clean_text(fallback)

    extracted_text = clean_text(
        "\n".join(
            [
                f"File name: {entry['title']}",
                f"Google Drive file: {entry['source_url']}",
                f"Modified label: {entry['modified_label']}",
                "",
                body_text[:12000],
            ]
        )
    )

    email_addresses = sorted(set(EMAIL_REGEX.findall(extracted_text)))
    url_domains = []
    for raw_url in URL_REGEX.findall(extracted_text):
        try:
            domain = urllib.parse.urlparse(raw_url).netloc.lower()
        except ValueError:  # pragma: no cover - defensive
            continue
        if domain:
            url_domains.append(domain)

    date_mentions = sorted(set(DATE_REGEX.findall(extracted_text)))[:20]

    guessed_category = "Other"
    category_source = f"{entry['title']}\n{body_text[:2000]}"
    for category_name, category_regex in CATEGORY_RULES:
        if category_regex.search(category_source):
            guessed_category = category_name
            break

    return {
        "file_id": entry["file_id"],
        "title": entry["title"],
        "normalized_title": normalize_title(entry["title"]),
        "modified_label": entry["modified_label"],
        "source_url": entry["source_url"],
        "body_text": body_text[:12000],
        "extracted_text": extracted_text[:24000],
        "email_addresses": json.dumps(email_addresses, ensure_ascii=False),
        "url_domains": json.dumps(sorted(set(url_domains)), ensure_ascii=False),
        "date_mentions": json.dumps(date_mentions, ensure_ascii=False),
        "guessed_category": guessed_category,
        "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def create_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS emails (
            file_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            normalized_title TEXT NOT NULL,
            modified_label TEXT,
            source_url TEXT NOT NULL,
            body_text TEXT NOT NULL,
            extracted_text TEXT NOT NULL,
            email_addresses TEXT NOT NULL,
            url_domains TEXT NOT NULL,
            date_mentions TEXT NOT NULL,
            guessed_category TEXT NOT NULL,
            fetched_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts
        USING fts5(
            file_id UNINDEXED,
            title,
            body_text,
            extracted_text
        )
        """
    )
    connection.commit()


def existing_file_ids(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute("SELECT file_id FROM emails").fetchall()
    return {row[0] for row in rows}


def store_email(connection: sqlite3.Connection, payload: dict[str, object]) -> None:
    connection.execute(
        """
        INSERT OR REPLACE INTO emails (
            file_id, title, normalized_title, modified_label, source_url,
            body_text, extracted_text, email_addresses, url_domains,
            date_mentions, guessed_category, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload["file_id"],
            payload["title"],
            payload["normalized_title"],
            payload["modified_label"],
            payload["source_url"],
            payload["body_text"],
            payload["extracted_text"],
            payload["email_addresses"],
            payload["url_domains"],
            payload["date_mentions"],
            payload["guessed_category"],
            payload["fetched_at"],
        ),
    )
    connection.execute("DELETE FROM emails_fts WHERE file_id = ?", (payload["file_id"],))
    connection.execute(
        """
        INSERT INTO emails_fts (file_id, title, body_text, extracted_text)
        VALUES (?, ?, ?, ?)
        """,
        (
            payload["file_id"],
            payload["title"],
            payload["body_text"],
            payload["extracted_text"],
        ),
    )


def tokenize(text: str) -> Iterable[str]:
    for token in re.findall(r"[A-Za-zÀ-ž0-9][A-Za-zÀ-ž0-9+._/-]{2,}", text.lower()):
        if token in STOPWORDS:
            continue
        if token.isdigit():
            continue
        yield token


def top_duplicates(rows: list[sqlite3.Row], limit: int = 25) -> list[tuple[str, int]]:
    counter = Counter(row["normalized_title"] for row in rows if row["normalized_title"])
    return counter.most_common(limit)


def top_email_domains(rows: list[sqlite3.Row], limit: int = 20) -> list[tuple[str, int]]:
    counter: Counter[str] = Counter()
    for row in rows:
        for address in json.loads(row["email_addresses"]):
            domain = address.rsplit("@", 1)[-1].lower()
            counter[domain] += 1
    return counter.most_common(limit)


def top_url_domains(rows: list[sqlite3.Row], limit: int = 20) -> list[tuple[str, int]]:
    counter: Counter[str] = Counter()
    for row in rows:
        for domain in json.loads(row["url_domains"]):
            counter[domain] += 1
    return counter.most_common(limit)


def top_keywords(rows: list[sqlite3.Row], limit: int = 40) -> list[tuple[str, int]]:
    counter: Counter[str] = Counter()
    for row in rows:
        counter.update(tokenize(row["normalized_title"]))
    return counter.most_common(limit)


def category_counts(rows: list[sqlite3.Row]) -> list[tuple[str, int]]:
    counter = Counter(row["guessed_category"] for row in rows)
    return counter.most_common()


def sample_titles_for_category(rows: list[sqlite3.Row], category: str, limit: int = 6) -> list[str]:
    result = []
    seen: set[str] = set()
    for row in rows:
        if row["guessed_category"] != category:
            continue
        title = row["title"]
        if title in seen:
            continue
        seen.add(title)
        result.append(title)
        if len(result) >= limit:
            break
    return result


def report_markdown(rows: list[sqlite3.Row], entries_count: int) -> str:
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    duplicates = top_duplicates(rows)
    email_domains = top_email_domains(rows)
    url_domains = top_url_domains(rows)
    keywords = top_keywords(rows)
    categories = category_counts(rows)

    lines = [
        "# Mail Knowledge Base Research",
        "",
        f"Generated: {timestamp}",
        f"Folder ID: `{FOLDER_ID}`",
        "",
        "## Overview",
        "",
        f"- Indexed emails: {len(rows)}",
        f"- Files currently visible in the folder: {entries_count}",
        f"- Unique normalized subjects: {len({row['normalized_title'] for row in rows})}",
        f"- Suggested high-level categories: {len(categories)}",
        "",
        "## Suggested Taxonomy",
        "",
        "The historical corpus behaves more like a knowledge base than a task queue. The working model should separate:",
        "",
        "- operational items that deserve a task,",
        "- reference mail that should stay searchable but not produce a task,",
        "- obvious low-signal mail that should be filtered.",
        "",
        "## Category Breakdown",
        "",
    ]

    for category, count in categories:
        lines.append(f"### {category} ({count})")
        for title in sample_titles_for_category(rows, category):
            lines.append(f"- {title}")
        lines.append("")

    lines.extend(
        [
            "## Repeated Subjects",
            "",
        ]
    )
    for title, count in duplicates:
        lines.append(f"- {count:>4} x {title}")
    lines.append("")

    lines.extend(
        [
            "## Strongest Correspondent Domains",
            "",
        ]
    )
    for domain, count in email_domains:
        lines.append(f"- {count:>4} x {domain}")
    lines.append("")

    lines.extend(
        [
            "## Strongest URL Domains",
            "",
        ]
    )
    for domain, count in url_domains:
        lines.append(f"- {count:>4} x {domain}")
    lines.append("")

    lines.extend(
        [
            "## Dominant Subject Keywords",
            "",
        ]
    )
    for token, count in keywords:
        lines.append(f"- {count:>4} x {token}")
    lines.append("")

    lines.extend(
        [
            "## Operational Recommendations",
            "",
            "- Keep the current live workflow for new mail, but do not backfill old mail into Vikunja tasks 1:1.",
            "- Treat the historical archive as searchable reference material and only promote clearly actionable items into tasks.",
            "- Add a classification gate before task creation: `task`, `reference`, `noise`.",
            "- Use the learned categories above as the first taxonomy, then refine them after reviewing search behavior.",
            "- Store historical mail in PostgreSQL/pgvector later, but the SQLite index created here is enough to start research immediately.",
            "",
        ]
    )

    return "\n".join(lines)


def ingest(entries: list[dict[str, str]]) -> tuple[int, int]:
    ensure_parent(DB_PATH)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    create_schema(connection)

    known_ids = existing_file_ids(connection)
    missing = [entry for entry in entries if entry["file_id"] not in known_ids]
    total = len(entries)

    if missing:
        print(f"Indexing {len(missing)} new emails into {DB_PATH} ...", flush=True)
    else:
        print(f"Knowledge base already contains all {total} visible emails.", flush=True)

    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_entry = {executor.submit(extract_msg_payload, entry): entry for entry in missing}
        for future in concurrent.futures.as_completed(future_to_entry):
            entry = future_to_entry[future]
            completed += 1
            try:
                payload = future.result()
            except Exception as error:
                print(f"[WARN] Failed to process {entry['file_id']} {entry['title']}: {error}", file=sys.stderr)
                continue
            store_email(connection, payload)
            if completed % 25 == 0 or completed == len(missing):
                connection.commit()
                print(f"  processed {completed}/{len(missing)}", flush=True)

    connection.commit()
    rows = connection.execute("SELECT * FROM emails ORDER BY title").fetchall()
    report = report_markdown(rows, total)
    ensure_parent(REPORT_PATH)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"Wrote report to {REPORT_PATH}", flush=True)
    connection.close()
    return len(rows), total


def main() -> int:
    entries = list_drive_entries(FOLDER_ID)
    if not entries:
        print("No entries found in the public Drive folder.", file=sys.stderr)
        return 1

    indexed_count, visible_count = ingest(entries)
    print(f"Indexed {indexed_count} emails from a visible folder size of {visible_count}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
