import akshare as ak
import pandas as pd


def get_latest_from_daily(df: pd.DataFrame, symbol: str, market: str):
    """
    Normalize common AKShare daily dataframe shapes and return latest quote summary.
    """
    if df is None or df.empty:
        return {
            "symbol": symbol,
            "market": market,
            "price": None,
            "change": None,
            "change_pct": None,
            "date": None,
            "note": "No data returned",
        }

    last = df.iloc[-1].copy()

    # Try common column names
    close_col = next((c for c in ["close", "收盘"] if c in df.columns), None)
    date_col = next((c for c in ["date", "日期"] if c in df.columns), None)

    if close_col is None:
        raise ValueError(
            f"{symbol}: close column not found, columns={list(df.columns)}"
        )

    price = float(last[close_col])

    prev_price = None
    if len(df) >= 2:
        prev = df.iloc[-2]
        prev_price = float(prev[close_col])

    change = None
    change_pct = None
    if prev_price is not None:
        change = price - prev_price
        change_pct = (change / prev_price) * 100 if prev_price != 0 else None

    return {
        "symbol": symbol,
        "market": market,
        "price": round(price, 4),
        "change": round(change, 4) if change is not None else None,
        "change_pct": round(change_pct, 4) if change_pct is not None else None,
        "date": str(last[date_col]) if date_col else None,
        "note": "",
    }


# US: Alibaba ADR
df_us = ak.stock_us_daily(symbol="BABA")
baba = get_latest_from_daily(df_us, "BABA", "NYSE")

print(baba)
