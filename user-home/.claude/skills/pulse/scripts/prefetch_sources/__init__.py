"""Modular prefetch source implementations (weather, news, stock, etc.)."""

if __name__ == "__main__":
    print(
        "Pulse prefetch sources — run from the pulse skill directory, e.g.:\n"
        "  uv run scripts/prefetch.py\n"
        "  uv run scripts/prefetch_sources/common.py\n"
        "  uv run scripts/prefetch_sources/weather.py [Shanghai]\n"
        "  uv run scripts/prefetch_sources/news.py\n"
        "  uv run scripts/prefetch_sources/stock.py\n"
        "  uv run scripts/prefetch_sources/github.py\n"
        "  uv run scripts/prefetch_sources/producthunt.py\n"
        "  uv run scripts/prefetch_sources/podcasts.py\n"
        "Or: cd scripts && python -m prefetch_sources.weather"
    )
