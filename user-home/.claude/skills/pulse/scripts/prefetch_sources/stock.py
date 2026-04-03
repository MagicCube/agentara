# /// script
# requires-python = ">=3.10"
# dependencies = ["aiohttp", "akshare", "requests", "matplotlib"]
# ///
"""Stock / index fetch (Sina CN indices, Sina US indices via akshare) and charts."""

import json
import math
import sys
import time
from datetime import datetime
from pathlib import Path

if __name__ == "__main__" and __package__ is None:
    _scripts = Path(__file__).resolve().parent.parent
    if str(_scripts) not in sys.path:
        sys.path.insert(0, str(_scripts))

import requests

from prefetch_sources.common import UA

STOCK_INDICES = [
    {
        "symbol": "sh000001",
        "name": "SSE Composite",
        "name_cn": "上证指数",
        "market": "SSE",
        "source": "sina",
    },
    {
        "symbol": "sz399001",
        "name": "SZSE Component",
        "name_cn": "深证成指",
        "market": "SZSE",
        "source": "sina",
    },
    {
        "symbol": "^ndq",
        "name": "NASDAQ Composite",
        "name_cn": "纳斯达克综合",
        "market": "NASDAQ",
        "source": "sina_us",
        "sina_us_symbol": ".IXIC",
    },
    {
        "symbol": "^dji",
        "name": "Dow Jones",
        "name_cn": "道琼斯工业",
        "market": "NYSE",
        "source": "sina_us",
        "sina_us_symbol": ".DJI",
    },
    {
        "symbol": "^spx",
        "name": "S&P 500",
        "name_cn": "标普500",
        "market": "NYSE",
        "source": "sina_us",
        "sina_us_symbol": ".INX",
    },
]

WORKSPACE = Path.home() / ".agentara" / "workspace"


def _fetch_sina_index(s: requests.Session, symbol: str) -> dict:
    """Fetch Chinese index historical data via Sina Finance K-line API."""
    url = (
        "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/"
        f"CN_MarketData.getKLineData?symbol={symbol}&scale=240&ma=no&datalen=45"
    )
    last_err = None
    for attempt in range(3):
        try:
            r = s.get(url, timeout=12)
            r.raise_for_status()
            data = json.loads(r.text)
            if not data:
                raise ValueError(f"No data returned for {symbol}")

            rows = []
            for item in data:
                try:
                    rows.append(
                        {
                            "date": item["day"][:10],
                            "open": float(item["open"]),
                            "high": float(item["high"]),
                            "low": float(item["low"]),
                            "close": float(item["close"]),
                            "vol": float(item.get("volume", 0)),
                        }
                    )
                except (ValueError, KeyError):
                    continue

            if not rows:
                raise ValueError(f"No rows parsed for {symbol}")

            _compute_changes(rows)
            latest = rows[-1]
            return {
                "latest": {
                    "price": latest["close"],
                    "change": latest["chg"],
                    "change_pct": latest["pct"],
                    "date": latest["date"],
                },
                "rows": rows[-2:],
                "_all_rows": rows,
            }
        except Exception as e:
            last_err = e
            time.sleep(2 * (attempt + 1))

    return {"error": str(last_err)}


def _row_date_str(d) -> str:
    if hasattr(d, "strftime"):
        return d.strftime("%Y-%m-%d")
    s = str(d)
    return s[:10] if len(s) >= 10 else s


def _fetch_sina_us_index(sina_symbol: str) -> dict:
    """US indices via Sina staticdata + akshare decoder (reachable in mainland China)."""
    import akshare as ak

    last_err = None
    for attempt in range(3):
        try:
            df = ak.index_us_stock_sina(symbol=sina_symbol)
            if df is None or df.empty:
                raise ValueError(f"No data returned for {sina_symbol}")

            df = df.tail(45)
            rows = []
            for _, item in df.iterrows():
                try:
                    v = item["volume"]
                    try:
                        vol = float(v)
                        if math.isnan(vol):
                            vol = 0.0
                    except (TypeError, ValueError):
                        vol = 0.0
                    rows.append(
                        {
                            "date": _row_date_str(item["date"]),
                            "open": float(item["open"]),
                            "high": float(item["high"]),
                            "low": float(item["low"]),
                            "close": float(item["close"]),
                            "vol": vol,
                        }
                    )
                except (ValueError, TypeError, KeyError):
                    continue

            if not rows:
                raise ValueError(f"No rows parsed for {sina_symbol}")

            _compute_changes(rows)
            latest = rows[-1]
            return {
                "latest": {
                    "price": latest["close"],
                    "change": latest["chg"],
                    "change_pct": latest["pct"],
                    "date": latest["date"],
                },
                "rows": rows[-2:],
                "_all_rows": rows,
            }
        except Exception as e:
            last_err = e
            time.sleep(2 * (attempt + 1))

    return {"error": str(last_err)}


def _compute_changes(rows: list[dict]) -> None:
    """Compute day-over-day change and percentage for each row in place."""
    for i, row in enumerate(rows):
        if i == 0:
            row["pct"] = 0.0
            row["chg"] = 0.0
        else:
            prev = rows[i - 1]["close"]
            row["pct"] = round((row["close"] - prev) / prev * 100, 4) if prev else 0.0
            row["chg"] = round(row["close"] - prev, 4)


def fetch_stock_sync() -> list:
    """Fetch all indices: Sina K-line for A-share indices; Sina US via akshare for US."""
    s = requests.Session()
    s.trust_env = False
    s.headers["User-Agent"] = UA

    results = []
    for idx in STOCK_INDICES:
        if idx["source"] == "sina":
            data = _fetch_sina_index(s, idx["symbol"])
        elif idx["source"] == "sina_us":
            data = _fetch_sina_us_index(idx["sina_us_symbol"])
        else:
            data = {"error": f"unknown source: {idx.get('source')}"}
        results.append(
            {
                "symbol": idx["symbol"],
                "name": idx["name"],
                "name_cn": idx["name_cn"],
                "market": idx["market"],
                "data": data,
            }
        )
    return results


def generate_stock_chart(symbol: str, name: str, rows: list[dict]) -> str | None:
    """Generate a 45-day line chart (3:2 aspect). Gradient fill: green=down, red=up."""
    import matplotlib
    import numpy as np

    matplotlib.use("Agg")
    import matplotlib.colors as mcolors
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt
    from matplotlib.colors import LinearSegmentedColormap

    if len(rows) < 2:
        return None

    dates = [datetime.strptime(r["date"], "%Y-%m-%d") for r in rows]
    closes = [r["close"] for r in rows]
    latest = rows[-1]
    prev = rows[-2]["close"]
    change_pct = (latest["close"] - prev) / prev * 100 if prev else 0
    is_up = latest["close"] >= prev

    accent = "#2ECC71" if not is_up else "#E74C3C"
    fig, ax = plt.subplots(figsize=(7.5, 5), facecolor="white")
    ax.set_facecolor("white")

    y_base = min(closes) * 0.998
    y_max = max(closes)
    xlims = mdates.date2num([dates[0], dates[-1]])
    yv = np.linspace(0, 1, 80)
    zv = np.tile(yv.reshape(-1, 1), (1, 50))
    rgb = mcolors.to_rgba(accent)[:3]
    cmap = LinearSegmentedColormap.from_list(
        "stock_grad", [(*rgb, 0.02), (*rgb, 0.38)], N=256
    )
    ax.imshow(
        zv,
        cmap=cmap,
        aspect="auto",
        origin="lower",
        extent=[xlims[0], xlims[1], y_base, y_max],
        zorder=0,
    )
    ax.fill_between(dates, closes, y_max, color="white", linewidth=0, zorder=1)
    ax.plot(
        dates, closes, color=accent, linewidth=1.8, solid_capstyle="round", zorder=2
    )

    ax.scatter(
        [dates[-1]],
        [closes[-1]],
        color=accent,
        s=50,
        zorder=5,
        edgecolors="white",
        linewidths=1.5,
    )

    ax.annotate(
        f"{latest['close']:,.2f}  ({change_pct:+.2f}%)",
        xy=(dates[-1], closes[-1]),
        xytext=(-12, 14),
        textcoords="offset points",
        fontsize=11,
        fontweight="bold",
        color=accent,
        ha="right",
    )

    ax.set_title(
        f"{name}  ·  45-Day",
        fontsize=14,
        fontweight="bold",
        color="#2C3E50",
        loc="left",
        pad=14,
    )

    ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=mdates.MO, interval=2))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.xaxis.set_minor_locator(mdates.WeekdayLocator(byweekday=mdates.MO))
    ax.tick_params(axis="x", labelsize=9, colors="#7F8C8D")
    ax.tick_params(axis="y", labelsize=9, colors="#7F8C8D")
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"{x:,.0f}"))

    ax.grid(axis="y", linestyle="--", linewidth=0.5, alpha=0.4, color="#BDC3C7")
    ax.grid(axis="x", linestyle="--", linewidth=0.3, alpha=0.2, color="#BDC3C7")

    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("bottom", "left"):
        ax.spines[spine].set_color("#ECF0F1")

    y_min, y_max_axis = min(closes), max(closes)
    margin = (y_max_axis - y_min) * 0.12 or 1
    ax.set_ylim(y_min - margin, y_max_axis + margin * 1.5)

    plt.tight_layout()

    today = datetime.today().strftime("%Y-%m-%d")
    safe_symbol = symbol.lstrip("^")
    out_dir = WORKSPACE / "outputs" / "stock"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{safe_symbol}-{today}.png"
    fig.savefig(out_path, dpi=180, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return str(out_path)


if __name__ == "__main__":
    stock_results = fetch_stock_sync()
    stock_output = []
    for entry in stock_results:
        data = entry.get("data", {})
        if isinstance(data, dict) and "error" not in data:
            all_rows = data.pop("_all_rows", [])
            chart_path = generate_stock_chart(entry["symbol"], entry["name"], all_rows)
            data["chart"] = chart_path
        stock_output.append(entry)
    print(json.dumps(stock_output, ensure_ascii=False, indent=2))
