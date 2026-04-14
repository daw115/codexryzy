#!/usr/bin/env python3
"""Shared helpers for public Google Drive mail ingest."""

from __future__ import annotations

import io
import hashlib
import html
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime
from email import policy
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime
from email.parser import Parser

try:
    import olefile
except ImportError:  # pragma: no cover - optional dependency
    olefile = None


DEFAULT_FOLDER_ID = "1Zq9MPcvbzhr6UeGS5EfdwhKVol2Upltm"
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


def env(name: str, default: str) -> str:
    value = os.environ.get(name, default)
    return value.strip() or default


TIMEOUT = int(env("MAIL_INGEST_TIMEOUT", str(DEFAULT_TIMEOUT)))


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
        except Exception as error:  # pragma: no cover - network retry
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


def normalize_message_date(raw: str | None) -> tuple[str | None, str | None]:
    value = (raw or "").strip()
    if not value:
        return None, None

    candidates = [
        value,
        re.sub(r"\s+\([^)]+\)\s*$", "", value).strip(),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        try:
            parsed = parsedate_to_datetime(candidate)
            return parsed.isoformat(), parsed.date().isoformat()
        except Exception:
            pass

        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            return parsed.isoformat(), parsed.date().isoformat()
        except Exception:
            pass

        numeric = re.search(r"\b(\d{4})[./-](\d{2})[./-](\d{2})\b", candidate)
        if numeric:
            year, month, day = numeric.groups()
            day_value = f"{year}-{month}-{day}"
            return day_value, day_value

        european = re.search(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b", candidate)
        if european:
            day, month, year = european.groups()
            year = year if len(year) == 4 else f"20{year}"
            try:
                parsed = datetime(int(year), int(month), int(day))
            except ValueError:
                continue
            return parsed.date().isoformat(), parsed.date().isoformat()

    return None, None


def sha256_digest(buffer: bytes) -> str:
    return hashlib.sha256(buffer).hexdigest()


def decode_mime_header(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:  # pragma: no cover - defensive
        return value


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


def html_to_text(value: str) -> str:
    return clean_text(
        html.unescape(
            re.sub(
                r"<[^>]+>",
                " ",
                re.sub(
                    r"</(p|div|tr|li|table|section|h1|h2|h3|h4|h5|h6)>",
                    "\n",
                    re.sub(r"<br\s*/?>", "\n", value, flags=re.I),
                    flags=re.I,
                ),
            )
        )
    )


def read_ole_stream_text(ole, name: str) -> str:
    if not ole.exists(name):
        return ""
    data = ole.openstream(name).read()
    if name.endswith("001F"):
        return data.decode("utf-16-le", errors="ignore").rstrip("\x00").strip()
    if name.endswith("001E"):
        return data.decode("cp1252", errors="ignore").rstrip("\x00").strip()
    return data.decode("utf-8", errors="ignore").strip()


def parse_msg_with_ole(binary: bytes, entry: dict[str, str]) -> dict[str, object] | None:
    if olefile is None:
        return None

    try:
        ole = olefile.OleFileIO(io.BytesIO(binary))
    except Exception:  # pragma: no cover - malformed msg
        return None

    try:
        subject = (
            read_ole_stream_text(ole, "__substg1.0_0037001F")
            or read_ole_stream_text(ole, "__substg1.0_0037001E")
            or entry["title"]
        )
        headers_text = (
            read_ole_stream_text(ole, "__substg1.0_007D001F")
            or read_ole_stream_text(ole, "__substg1.0_007D001E")
        )
        plain_body = (
            read_ole_stream_text(ole, "__substg1.0_1000001F")
            or read_ole_stream_text(ole, "__substg1.0_1000001E")
        )
        html_body = ""
        if ole.exists("__substg1.0_10130102"):
            html_body = ole.openstream("__substg1.0_10130102").read().decode("utf-8", errors="ignore")

        message = Parser(policy=policy.default).parsestr(headers_text or "", headersonly=True)
        from_header = decode_mime_header(message.get("From"))
        to_header = decode_mime_header(message.get("To"))
        cc_header = decode_mime_header(message.get("Cc"))
        date_header = decode_mime_header(message.get("Date"))
        message_id = decode_mime_header(message.get("Message-ID"))

        if html_body and not plain_body:
            plain_body = html_to_text(html_body)

        body_text = clean_text(plain_body)
        extracted_text = clean_text(
            "\n".join(
                [
                    f"Subject: {subject}",
                    f"From: {from_header}" if from_header else "",
                    f"To: {to_header}" if to_header else "",
                    f"Cc: {cc_header}" if cc_header else "",
                    f"Date: {date_header}" if date_header else "",
                    f"Google Drive file: {entry['source_url']}",
                    f"Modified label: {entry['modified_label']}",
                    "",
                    body_text[:24000],
                ]
            )
        )

        email_addresses = sorted(set(EMAIL_REGEX.findall("\n".join([headers_text, extracted_text]))))
        url_domains = []
        for raw_url in URL_REGEX.findall(extracted_text):
            try:
                domain = urllib.parse.urlparse(raw_url).netloc.lower()
            except ValueError:  # pragma: no cover - defensive
                continue
            if domain:
                url_domains.append(domain)

        return {
            "file_id": entry["file_id"],
            "title": subject or entry["title"],
            "normalized_title": normalize_title(subject or entry["title"]),
            "modified_label": entry["modified_label"],
            "source_url": entry["source_url"],
            "download_url": build_download_url(entry["file_id"]),
            "mime_type": "application/vnd.ms-outlook",
            "checksum": sha256_digest(binary),
            "headers_text": headers_text[:20000],
            "from": from_header,
            "to": to_header,
            "cc": cc_header,
            "date": date_header,
            "message_id": message_id,
            "body_text": body_text[:20000],
            "extracted_text": extracted_text[:30000],
            "email_addresses": email_addresses,
            "url_domains": sorted(set(url_domains)),
            "date_mentions": sorted(set(DATE_REGEX.findall("\n".join([date_header, extracted_text]))))[:20],
        }
    finally:
        ole.close()


def extract_msg_payload(entry: dict[str, str]) -> dict[str, object]:
    download_url = build_download_url(entry["file_id"])
    binary = fetch_with_retries(download_url)
    native_payload = parse_msg_with_ole(binary, entry)
    if native_payload:
        native_payload["download_url"] = download_url
        return native_payload

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
        body_text = html_to_text(html_fragment)

    if not body_text:
        fallback = "\n".join(utf16_strings[:120] + ascii_strings[:120])
        body_text = clean_text(fallback)

    extracted_text = clean_text(
        "\n".join(
            [
                f"Subject: {entry['title']}",
                f"Google Drive file: {entry['source_url']}",
                f"Modified label: {entry['modified_label']}",
                "",
                body_text[:20000],
            ]
        )
    )

    email_addresses = sorted(set(EMAIL_REGEX.findall(extracted_text)))
    url_domains = []
    for raw_url in URL_REGEX.findall(extracted_text):
        try:
            domain = urllib.parse.urlparse(raw_url).netloc.lower()
        except ValueError:  # pragma: no cover
            continue
        if domain:
            url_domains.append(domain)

    return {
        "file_id": entry["file_id"],
        "title": entry["title"],
        "normalized_title": normalize_title(entry["title"]),
        "modified_label": entry["modified_label"],
        "source_url": entry["source_url"],
        "download_url": download_url,
        "mime_type": "application/vnd.ms-outlook",
        "checksum": sha256_digest(binary),
        "headers_text": "",
        "from": "",
        "to": "",
        "cc": "",
        "date": "",
        "message_id": "",
        "body_text": body_text[:20000],
        "extracted_text": extracted_text[:30000],
        "email_addresses": email_addresses,
        "url_domains": sorted(set(url_domains)),
        "date_mentions": sorted(set(DATE_REGEX.findall(extracted_text)))[:20],
    }


def chunk_text(text: str, chunk_size: int = 1400, overlap: int = 200) -> list[str]:
    value = clean_text(text)
    if not value:
        return []
    if overlap >= chunk_size:
        raise ValueError("chunk overlap must be smaller than chunk size")

    chunks: list[str] = []
    start = 0
    while start < len(value):
        end = min(len(value), start + chunk_size)
        if end < len(value):
            newline = value.rfind("\n", start, end)
            space = value.rfind(" ", start, end)
            pivot = max(newline, space)
            if pivot > start + chunk_size // 2:
                end = pivot
        chunk = clean_text(value[start:end])
        if chunk:
            chunks.append(chunk)
        if end >= len(value):
            break
        start = max(end - overlap, start + 1)
    return chunks
