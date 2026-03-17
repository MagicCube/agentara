---
name: stock
description: >
  Query stock quotes for US stocks, Hong Kong stocks, and A-shares. Use when the user asks about
  a stock price, market quote, or stock performance — including phrases like "查一下 BABA",
  "BABA 现在多少", "阿里巴巴股价", "茅台今天", "港股 9988", "美股行情", or any mention of a
  specific stock ticker or company name wanting price/change data. Also trigger for market
  overview requests like "大盘怎么样", "美股今天", "港股行情".
---

# Stock Quote Skill

Fetch latest stock price, change, and anomaly detection for US stocks, HK stocks, and A-shares.
Uses **stooq.com** as data source — reliable, no auth, bypasses system proxy automatically.
Data is T+1 for all markets (previous trading day close). This is expected and normal.

---

## Step 1 — Identify Stock & Market

Parse the user's query:

- **A-share**: 6-digit code (000001, 600519, 300750) or Chinese company name → market = `cn`
- **HK stock**: 4–5 digit code (9988, 00700, 9999) or `XXXX.HK` format → market = `hk`
- **US stock**: Latin ticker (BABA, AAPL, TSLA, NVDA) or `BABA.US` format → market = `us`

For well-known companies, infer the market:
- 阿里巴巴 → BABA (US) + 09988 (HK) — user usually means one, ask if unclear
- 腾讯 → 00700 (HK)
- 茅台/贵州茅台 → 600519 (A-share)
- 宁德时代 → 300750 (A-share)

For HK symbols, pass as-is (no zero-padding): `9988`, `700`. stooq handles it.

---

## Step 2 — Fetch Data

Use the unified `fetch_stock.py` script. Market codes: `hk`, `cn`, `us`.

```bash
# HK stock
python3 /Users/henry/.agentara/.claude/skills/stock/fetch_stock.py hk 9988

# A-share
python3 /Users/henry/.agentara/.claude/skills/stock/fetch_stock.py cn 600519

# US stock
python3 /Users/henry/.agentara/.claude/skills/stock/fetch_stock.py us BABA
```

Output is a JSON array of rows: `{date, open, close, high, low, vol, pct, chg}`.
If the output starts with `{"error":`, report the error to the user and stop.

**Network notes:** stooq.com is called with `trust_env=False` (bypasses Clash/system proxy).
No external Python deps beyond `requests` (stdlib-equivalent, always available).

**Stooq symbol format:**
- HK: `9988.hk` (no leading zeros)
- CN: `600519.cn`
- US: `baba.us` (lowercase)

---

## Step 3 — Analyze & Detect Anomalies

From the JSON output (up to 21 rows):

1. **Latest row** = most recent trading day data
2. **Latest price** = `close` of last row
3. **Latest change%** = `pct` of last row
4. **Avg volatility** = mean of `|pct|` of rows 2–21 (excluding last row)
5. **Avg volume** = mean of `vol` of rows 2–6 (5-day avg, excluding last)
6. **Latest volume** = `vol` of last row

**Anomaly flags** (report any that apply):
- `|pct| > 5%` → 🚨 大幅波动
- `|pct| > 2%` AND `|pct| > 2 × avg_volatility` → ⚠️ 异常波动（超出近期均值2倍）
- `latest_vol > 2 × avg_volume` → 📊 成交量异常放大（X倍）
- `latest_vol < 0.4 × avg_volume` → 🔇 成交量异常萎缩

If US stock `pct` is always near 0 except the last row, it's because the diff is computed on fetched data — use the last row's `pct` directly.

---

## Step 4 — Format Output

Keep it brief and mobile-friendly. Use list format, no tables.

**Color + emoji rules (Chinese convention: 红涨绿跌):**
- `pct > 0` → emoji 📈, wrap numbers in `<font color='red'>...</font>`
- `pct < 0` → emoji 📉, wrap numbers in `<font color='green'>...</font>`
- `pct == 0` → emoji ➡️, no color wrapper

**Template (adapt to context):**

```
**{公司名} · {市场} {代码}**

- 最新价：<font color='red/green'>**{price} {货币}**</font>
- 涨跌：{emoji} <font color='red/green'>**{chg:+.2f} / {pct:+.2f}%**</font>
- 最新交易日：{date}

{anomaly_section_if_any}
```

**Anomaly section** (only if flags exist):
```
⚠️ 异常提示
- [flag 1]
- [flag 2]
近5日均幅 **{avg_vol:.2f}%**，今日 <font color='red/green'>**{pct:.2f}%**</font>
```

**If no anomaly:** omit the anomaly section entirely. Keep the whole response under 10 lines.

---

## Step 5 — Currency

- A-share: ¥ (人民币)
- HK: HK$ (港元)
- US: $ (美元)

---

## Notes

- US data lags by 1 trading day (Sina source) — this is expected, tell the user if they ask
- If AKShare is not installed: `pip3 install akshare -q`
- If the symbol is wrong or not found, tell the user and suggest the correct format
- For A-share names, you can infer the 6-digit code from common knowledge; if uncertain, say so
- Do NOT show raw JSON or DataFrame output to the user — always parse and format it
