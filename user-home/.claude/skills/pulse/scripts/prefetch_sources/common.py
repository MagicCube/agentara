# /// script
# requires-python = ">=3.10"
# dependencies = ["aiohttp"]
# ///
"""Shared HTTP client settings for prefetch fetchers."""

import aiohttp

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
TIMEOUT = aiohttp.ClientTimeout(total=15)


if __name__ == "__main__":
    print("UA:", UA)
    print("TIMEOUT.total:", TIMEOUT.total)
