# /// script
# requires-python = ">=3.10"
# dependencies = ["aiohttp", "readability-lxml", "markdownify"]
# ///
"""Product Hunt feed fetch."""

import json
import re
import sys
from pathlib import Path

if __name__ == "__main__" and __package__ is None:
    _scripts = Path(__file__).resolve().parent.parent
    if str(_scripts) not in sys.path:
        sys.path.insert(0, str(_scripts))

import aiohttp
from markdownify import markdownify as md
from readability import Document

from prefetch_sources.common import TIMEOUT, UA


async def fetch_producthunt(session: aiohttp.ClientSession) -> dict:
    """Fetch Product Hunt feed and extract readable markdown."""
    url = "https://www.producthunt.com/feed"
    headers = {"User-Agent": UA}
    async with session.get(url, headers=headers) as resp:
        html = await resp.text()
        status = resp.status

    try:
        doc = Document(html)
        readable_html = doc.summary()
        markdown = md(readable_html, strip=["img", "script", "style"])
        markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip()
        if len(markdown) > 8000:
            markdown = markdown[:8000] + "\n\n... (truncated)"
    except Exception:
        markdown = html[:8000] if html else ""

    return {"markdown": markdown, "status": status}


async def _cli() -> None:
    async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
        data = await fetch_producthunt(session)
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    import asyncio

    asyncio.run(_cli())
