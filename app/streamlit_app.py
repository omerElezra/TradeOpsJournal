import os
from datetime import date, timedelta, datetime

import pandas as pd
import plotly.express as px
import streamlit as st
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

st.set_page_config(page_title="Trading Journal", page_icon="📈", layout="wide")

# ── Helpers ────────────────────────────────────────────────────────────────────

def fmt_usd(v):
    """Format dollar value as $X.YY — never truncated, never more than 2 decimals."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return "—"
    return f"${v:,.2f}"

def fmt_qty(v):
    """Show quantity as integer if whole, else 2 decimal places."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return "—"
    return f"{int(v)}" if v == int(v) else f"{v:.2f}"

def format_duration(td):
    """
    Human-readable hold time at the right granularity:
      months / weeks / days / hours / minutes / seconds
    """
    if td is None or pd.isnull(td):
        return "—"
    total = int(abs(td.total_seconds()))

    months = total // (30 * 86400)
    if months >= 2:
        days_rem = (total % (30 * 86400)) // 86400
        return f"{months}mo {days_rem}d"

    weeks = total // (7 * 86400)
    if weeks >= 1:
        days_rem = (total % (7 * 86400)) // 86400
        return f"{weeks}w {days_rem}d"

    days = total // 86400
    if days >= 1:
        hrs = (total % 86400) // 3600
        return f"{days}d {hrs}h"

    hrs = total // 3600
    if hrs >= 1:
        mins = (total % 3600) // 60
        return f"{hrs}h {mins}m"

    mins = total // 60
    if mins >= 1:
        secs = total % 60
        return f"{mins}m {secs}s"

    return f"{total}s"


# ── Journal options ────────────────────────────────────────────────────────────

SETUP_OPTIONS = [
    "Breakout",
    "Pullback / Retest",
    "VWAP Reclaim",
    "Gap & Go",
    "Momentum",
    "Reversal",
    "Range / Mean Reversion",
    "Earnings Play",
    "News / Catalyst",
    "Scalp",
    "Swing",
    "Other",
]

PSYCH_TAG_OPTIONS = [
    "Disciplined",
    "Patient",
    "Confident",
    "Hesitant",
    "FOMO",
    "Revenge Trade",
    "Overtrading",
    "Impatient Exit",
    "Moved Stop",
    "Ignored Plan",
    "Chased Entry",
    "Sized Too Big",
    "Sized Too Small",
    "Emotional",
]

SETUP_HELP = {
    "Breakout":               "פריצת רמה",
    "Pullback / Retest":      "תיקון / חזרה",
    "VWAP Reclaim":           "חציית VWAP",
    "Gap & Go":               "פער + המשך",
    "Momentum":               "תנועה חזקה",
    "Reversal":               "היפוך מגמה",
    "Range / Mean Reversion": "דשדוש / ממוצע",
    "Earnings Play":          "דוחות חברה",
    "News / Catalyst":        "חדשות / זרז",
    "Scalp":                  "עסקה מהירה מאוד",
    "Swing":                  "החזקה מספר ימים",
    "Other":                  "אחר",
}

PSYCH_TAG_HELP = {
    "Disciplined":     "עמדתי בתוכנית",
    "Patient":         "המתנתי לטריגר",
    "Confident":       "כניסה רגועה",
    "Hesitant":        "היססתי",
    "FOMO":            "פחד מפספוס",
    "Revenge Trade":   "עסקת נקמה",
    "Overtrading":     "מסחר יתר",
    "Impatient Exit":  "יציאה מוקדמת",
    "Moved Stop":      "הזזת סטופ",
    "Ignored Plan":    "התעלמתי מהתוכנית",
    "Chased Entry":    "מרדף / גבוה מדי",
    "Sized Too Big":   "כמות גדולה מדי",
    "Sized Too Small": "כמות קטנה מדי",
    "Emotional":       "החלטה רגשית",
}

SETUP_HELP_FULL = {
    "Breakout":               "כניסה בעת פריצת רמת התנגדות או תמיכה משמעותית עם נפח גבוה",
    "Pullback / Retest":      "כניסה בנסיגת מחיר חזרה לרמה שנפרצה לפני שממשיכה בכיוון הפריצה",
    "VWAP Reclaim":           "כניסה כשהמחיר חוצר ומחזיק מחדש מעל (או מתחת) ל-VWAP לאחר שאיבד אותה",
    "Gap & Go":               "מניה שפתחה בפער מחירים (Gap) וממשיכה חזק באותו הכיוון בתחילת המסחר",
    "Momentum":               "הצטרפות לתנועת מחיר חזקה ומהירה ללא המתנה לתיקון – הכוח הוא הסיגנל",
    "Reversal":               "עסקה נגד כיוון המגמה הנוכחית בעת זיהוי סימני חולשה, דחייה, או מבנה היפוך",
    "Range / Mean Reversion": "מסחר בגבולות טווח מוגדר, או הימור על חזרה למחיר ממוצע לאחר תנועה קיצונית",
    "Earnings Play":          "עסקה לפני / אחרי פרסום דוחות כספיים של חברה – מנצל תנועה צפויה מהאירוע",
    "News / Catalyst":        "מסחר בעקבות הודעה חדשותית, הכרזה, שינוי רגולטורי, או אירוע פונדמנטלי משפיע",
    "Scalp":                  "עסקה מהירה מאוד – שניות עד דקות בודדות – ללכידת רווח קטן עם ניהול סיכון הדוק",
    "Swing":                  "עסקה מתוכננת להחזקה של מספר ימים עד שבועות תוך מרווח ריוח/הפסד רחב יותר",
    "Other":                  "תבנית מסחר אישית אחרת שאינה מופיעה ברשימה",
}

PSYCH_TAG_HELP_FULL = {
    "Disciplined":     "עמדתי במלואם בחוקי הכניסה, היציאה, גודל הפוזיציה וניהול הסיכונים",
    "Patient":         "המתנתי לטריגר המדויק ולא נכנסתי לפניו מחוסר אורך רוח",
    "Confident":       "ניהלתי את העסקה ברוגע ובביטחון מלא – ללא פחד מיותר",
    "Hesitant":        "היססתי בעת הביצוע ועיכוב זה הוביל לכניסה או יציאה במחיר פחות טוב",
    "FOMO":            "נכנסתי חפוזה כי המניה כבר רצה – פחד מפספוס הוביל לכניסה ללא תבנית ברורה",
    "Revenge Trade":   "נכנסתי לעסקה מהירה אחרי הפסד כדי 'להחזיר' – ללא תוכנית ובניגוד לחוקים",
    "Overtrading":     "ביצעתי יותר מדי עסקאות במהלך היום ללא תבניות חוקיות ברורות לכל אחת מהן",
    "Impatient Exit":  "סגרתי את העסקה מוקדם מדי מחוסר סבלנות – לפני שהגיעה לחוקי היציאה",
    "Moved Stop":      "הרחקתי את הסטופ-לוס מרמתו המקורית בניגוד לתוכנית – הגדלתי את הסיכון",
    "Ignored Plan":    "סחרתי 'מהבטן' בהתעלמות מוחלטת מהתוכנית שנקבעה לפני הכניסה לעסקה",
    "Chased Entry":    "קניתי גבוה בהרבה מטריגר הכניסה המקורי בגלל ריצה מהירה – הסיכון/סיכוי נפגע",
    "Sized Too Big":   "עבדתי בסיכון כספי גבוה מדי ביחס לחוקי ניהול הסיכונים שלי",
    "Sized Too Small": "כניסה בכמות זניחה שמקטינה את משמעות העסקה גם אם היתה נכונה",
    "Emotional":       "קבלת החלטות מתוך פחד, כעס, תאוות בצע או תקווה – לא על בסיס ניתוח",
}

# ── Supabase ───────────────────────────────────────────────────────────────────

@st.cache_resource
def get_supabase():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


@st.cache_data(ttl=300)
def load_trades(start, end):
    client = get_supabase()
    q = client.table("trades").select("*").order("exec_time")
    if start: q = q.gte("trade_date", start)
    if end:   q = q.lte("trade_date", end)
    res = q.execute()
    if not res.data:
        return pd.DataFrame()
    df = pd.DataFrame(res.data)
    df["exec_time"]  = pd.to_datetime(df["exec_time"],  errors="coerce", utc=True).dt.tz_localize(None)
    df["trade_date"] = pd.to_datetime(df["trade_date"], errors="coerce").dt.date
    for c in ["quantity", "price", "proceeds", "commission", "realized_pnl"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


@st.cache_data(ttl=300)
def load_cash(start, end):
    client = get_supabase()
    q = client.table("cash_transactions").select("*").order("exec_time")
    if start: q = q.gte("transaction_date", start)
    if end:   q = q.lte("transaction_date", end)
    res = q.execute()
    if not res.data:
        return pd.DataFrame()
    df = pd.DataFrame(res.data)
    df["exec_time"]        = pd.to_datetime(df["exec_time"], errors="coerce", utc=True).dt.tz_localize(None)
    df["transaction_date"] = pd.to_datetime(df["transaction_date"], errors="coerce").dt.date
    for c in ["quantity", "rate", "net_cash", "commission"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    # ── Derive USD amount ──────────────────────────────────────────────────────
    # IBKR sets net_cash=0 for FX conversions.
    # USD.ILS BUY: quantity = USD received, abs(net_cash or proceeds) = ILS paid
    # ILS.USD BUY: quantity = ILS received, rate = USD/ILS → USD paid = qty * rate
    # We compute usd_amount = USD that moved into the account.
    def usd_amount(row):
        sym = str(row.get("symbol", "")).upper()
        qty = row.get("quantity") or 0
        rate = row.get("rate") or 0
        if sym.startswith("USD."):          # USD is base → quantity IS the USD amount
            return qty if row.get("action") == "BUY" else -qty
        elif sym.endswith(".USD"):           # USD is quote → qty × rate = USD
            usd = qty * rate if rate else 0
            return -usd if row.get("action") == "BUY" else usd
        return 0

    df["usd_amount"] = df.apply(usd_amount, axis=1)

    # ILS amount (the other side of the pair)
    def ils_amount(row):
        sym = str(row.get("symbol", "")).upper()
        qty = row.get("quantity") or 0
        rate = row.get("rate") or 0
        if sym.startswith("USD."):          # ILS = qty × rate
            return qty * rate if rate else 0
        elif sym.endswith(".USD"):           # ILS = quantity
            return qty
        return 0

    df["ils_amount"] = df.apply(ils_amount, axis=1)

    return df


# ── Journal persistence ────────────────────────────────────────────────────────

def load_all_journals():
    """Load all journal entries into a dict keyed by (symbol, entry_time_str)."""
    client = get_supabase()
    res = client.table("trade_journal").select("*").execute()
    journals = {}
    for row in (res.data or []):
        key = (row["symbol"], row["entry_time"])
        journals[key] = row
    return journals


def save_journal(symbol, entry_time, setup, psych_tags, notes,
                 planned_stop=None, planned_target=None, risk_amount=None):
    """Upsert a journal entry for a grouped trade."""
    client = get_supabase()
    record = {
        "symbol": symbol,
        "entry_time": entry_time.isoformat() if hasattr(entry_time, "isoformat") else str(entry_time),
        "setup": setup or None,
        "psych_tags": psych_tags or [],
        "notes": notes or "",
        "planned_stop": planned_stop,
        "planned_target": planned_target,
        "risk_amount": risk_amount,
        "updated_at": datetime.utcnow().isoformat(),
    }
    client.table("trade_journal").upsert(
        record, on_conflict="symbol,entry_time"
    ).execute()


# ── Trade grouping ─────────────────────────────────────────────────────────────

def build_trade_summary(execs, open_trade=False):
    df = pd.DataFrame(execs)
    buys  = df[df["action"] == "BUY"]
    sells = df[df["action"] == "SELL"]

    buy_qty  = buys["quantity"].sum()
    sell_qty = sells["quantity"].sum()
    total_qty = max(buy_qty, sell_qty)

    avg_entry = (buys["price"] * buys["quantity"]).sum() / buy_qty   if buy_qty  else None
    avg_exit  = (sells["price"] * sells["quantity"]).sum() / sell_qty if sell_qty else None

    entry_time = df["exec_time"].min()
    exit_time  = df["exec_time"].max() if not open_trade else None
    hold_td    = (exit_time - entry_time) if (exit_time is not None and pd.notna(exit_time)) else None

    pnl        = df["realized_pnl"].sum()
    commission = df["commission"].sum()
    net_pnl    = pnl + commission
    cost_basis = (buys["price"] * buys["quantity"]).sum() if buy_qty else None
    # For open trades only show P&L % when there are realized exits
    if open_trade:
        pnl_pct = None
    else:
        pnl_pct = (pnl / cost_basis * 100) if cost_basis else None

    return {
        "symbol":       df["symbol"].iloc[0],
        "status":       "OPEN" if open_trade else "CLOSED",
        "entry_time":   entry_time,
        "exit_time":    exit_time,
        "hold_td":      hold_td,
        "hold_str":     format_duration(hold_td),
        "total_qty":    total_qty,
        "avg_entry":    round(avg_entry, 4) if avg_entry else None,
        "avg_exit":     round(avg_exit,  4) if avg_exit  else None,
        "pnl":          round(pnl, 2),
        "net_pnl":      round(net_pnl, 2),
        "pnl_pct":      round(pnl_pct, 2) if pnl_pct else None,
        "commission":   round(commission, 2),
        "executions":   execs,
        "n_exec":       len(execs),
    }


def group_into_full_trades(df):
    if df.empty:
        return []
    all_trades = []
    for symbol, sym_df in df.groupby("symbol"):
        sym_df = sym_df.sort_values("exec_time").reset_index(drop=True)
        position, in_trade, trade_execs = 0.0, False, []
        for _, row in sym_df.iterrows():
            delta = row["quantity"] if row["action"] == "BUY" else -row["quantity"]
            if not in_trade:
                in_trade, trade_execs, position = True, [row.to_dict()], delta
            else:
                trade_execs.append(row.to_dict())
                position += delta
                if abs(position) < 0.001:
                    all_trades.append(build_trade_summary(trade_execs, open_trade=False))
                    trade_execs, in_trade, position = [], False, 0.0
        if trade_execs:
            all_trades.append(build_trade_summary(trade_execs, open_trade=True))

    all_trades.sort(key=lambda t: t["entry_time"] if pd.notna(t["entry_time"]) else datetime.min)
    return all_trades


# ── Sidebar ────────────────────────────────────────────────────────────────────

st.sidebar.title("📈 Trading Journal")
st.sidebar.markdown("---")

today = date.today()
quick = st.sidebar.radio("Date range",
    ["ALL", "Today", "This Week", "This Month", "YTD", "Custom"], index=0)

start_date = end_date = None
if quick == "Today":
    start_date = end_date = today
elif quick == "This Week":
    start_date = today - timedelta(days=today.weekday()); end_date = today
elif quick == "This Month":
    start_date = today.replace(day=1); end_date = today
elif quick == "YTD":
    start_date = today.replace(month=1, day=1); end_date = today
elif quick == "Custom":
    start_date = st.sidebar.date_input("From", today - timedelta(days=30))
    end_date   = st.sidebar.date_input("To",   today)

range_label = "All time" if quick == "ALL" else f"{start_date} → {end_date}"
st.sidebar.markdown(f"**{range_label}**")

df      = load_trades(str(start_date) if start_date else None, str(end_date) if end_date else None)
df_cash = load_cash(str(start_date)  if start_date else None, str(end_date) if end_date else None)

st.title("📈 Trading Journal")

if df.empty:
    st.info("No trades found for the selected date range.")
    st.stop()

full_trades   = group_into_full_trades(df)
closed_trades = [t for t in full_trades if t["status"] == "CLOSED"]

# ── Tabs ───────────────────────────────────────────────────────────────────────

# Pre-load journals so the Full Trades tab can display them
try:
    all_journals = load_all_journals()
except Exception:
    all_journals = {}  # table may not exist yet — degrade gracefully

tab_overview, tab_full, tab_executions, tab_cash = st.tabs([
    "📊 Overview", "📋 Full Trades", "🔍 All Executions", "💵 Transactions"
])

# ════════════════════════════════════════════════════════════════════════
# TAB 1 — OVERVIEW
# ════════════════════════════════════════════════════════════════════════
with tab_overview:

    gross_pnl  = df["realized_pnl"].sum()
    total_comm = df["commission"].sum()
    net_pnl    = gross_pnl + total_comm
    wins       = sum(1 for t in closed_trades if t["pnl"] > 0)
    n_closed   = len(closed_trades)
    win_rate   = (wins / n_closed * 100) if n_closed else 0
    daily      = df.groupby("trade_date")["realized_pnl"].sum()
    best_day   = daily.max() if not daily.empty else 0
    worst_day  = daily.min() if not daily.empty else 0
    avg_pnl    = gross_pnl / n_closed if n_closed else 0

    # ── Payoff / Avg Win / Avg Loss / Expectancy ───────────────────────
    win_pnls  = [t["pnl"] for t in closed_trades if t["pnl"] > 0]
    loss_pnls = [t["pnl"] for t in closed_trades if t["pnl"] < 0]
    avg_win   = sum(win_pnls) / len(win_pnls)   if win_pnls  else 0
    avg_loss  = sum(loss_pnls) / len(loss_pnls)  if loss_pnls else 0
    payoff    = (avg_win / abs(avg_loss)) if avg_loss else 0
    # Expectancy = (win_rate × avg_win) + (loss_rate × avg_loss)
    if n_closed:
        expectancy = (len(win_pnls) / n_closed) * avg_win + (len(loss_pnls) / n_closed) * avg_loss
    else:
        expectancy = 0

    gross_color = "#2ecc71" if gross_pnl >= 0 else "#e74c3c"
    net_color   = "#2ecc71" if net_pnl   >= 0 else "#e74c3c"
    best_color  = "#2ecc71" if best_day  >= 0 else "#e74c3c"
    worst_color = "#2ecc71" if worst_day >= 0 else "#e74c3c"
    avg_win_color  = "#2ecc71"
    avg_loss_color = "#e74c3c"
    expectancy_color = "#2ecc71" if expectancy >= 0 else "#e74c3c"
    st.markdown(
        f"""
        <div style="display:flex;gap:28px;flex-wrap:wrap;padding:8px 0 12px 0;">
          <div style="min-width:100px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Gross P&amp;L</div>
            <div style="font-size:15px;font-weight:700;color:{gross_color};">{fmt_usd(gross_pnl)}</div>
          </div>
          <div style="min-width:100px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Commission</div>
            <div style="font-size:15px;font-weight:700;">{fmt_usd(total_comm)}</div>
          </div>
          <div style="min-width:100px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Net P&amp;L</div>
            <div style="font-size:15px;font-weight:700;color:{net_color};">{fmt_usd(net_pnl)}</div>
          </div>
          <div style="min-width:80px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Win Rate</div>
            <div style="font-size:15px;font-weight:700;">{win_rate:.1f}%</div>
          </div>
          <div style="min-width:60px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Trades</div>
            <div style="font-size:15px;font-weight:700;">{n_closed}</div>
          </div>
          <div style="min-width:100px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Avg / Trade</div>
            <div style="font-size:15px;font-weight:700;">{fmt_usd(avg_pnl)}</div>
          </div>
          <div style="min-width:100px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Best Day</div>
            <div style="font-size:15px;font-weight:700;color:{best_color};">{fmt_usd(best_day)}</div>
          </div>
          <div style="min-width:100px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Worst Day</div>
            <div style="font-size:15px;font-weight:700;color:{worst_color};">{fmt_usd(worst_day)}</div>
          </div>
          <div style="min-width:90px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Payoff Ratio</div>
            <div style="font-size:15px;font-weight:700;">{payoff:.2f}</div>
          </div>
          <div style="min-width:100px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Avg Win</div>
            <div style="font-size:15px;font-weight:700;color:{avg_win_color};">{fmt_usd(avg_win)}</div>
          </div>
          <div style="min-width:100px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Avg Loss</div>
            <div style="font-size:15px;font-weight:700;color:{avg_loss_color};">{fmt_usd(avg_loss)}</div>
          </div>
          <div style="min-width:100px;">
            <div style="font-size:11px;color:#888;margin-bottom:2px;">Expectancy</div>
            <div style="font-size:15px;font-weight:700;color:{expectancy_color};">{fmt_usd(expectancy)}</div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("---")
    cl, cr = st.columns(2)
    with cl:
        st.subheader("Daily P&L")
        ddf = daily.reset_index(); ddf.columns = ["Date","P&L"]
        fig = px.bar(ddf, x="Date", y="P&L", color="P&L",
                     color_continuous_scale=["#e74c3c","#2ecc71"], color_continuous_midpoint=0)
        fig.update_layout(showlegend=False, coloraxis_showscale=False, margin=dict(t=10))
        st.plotly_chart(fig, use_container_width=True)
    with cr:
        st.subheader("Equity Curve")
        eq = daily.cumsum().reset_index(); eq.columns = ["Date","Cumulative P&L"]
        fig2 = px.line(eq, x="Date", y="Cumulative P&L", markers=True)
        fig2.update_traces(line_color="#3498db")
        fig2.update_layout(margin=dict(t=10))
        st.plotly_chart(fig2, use_container_width=True)

    st.subheader("P&L by Symbol")
    sym_pnl = df.groupby("symbol")["realized_pnl"].sum().sort_values().reset_index()
    sym_pnl.columns = ["Symbol","P&L"]
    fig3 = px.bar(sym_pnl, x="P&L", y="Symbol", orientation="h", color="P&L",
                  color_continuous_scale=["#e74c3c","#2ecc71"], color_continuous_midpoint=0)
    fig3.update_layout(showlegend=False, coloraxis_showscale=False, margin=dict(t=10))
    st.plotly_chart(fig3, use_container_width=True)

# ════════════════════════════════════════════════════════════════════════
# TAB 2 — FULL TRADES
# ════════════════════════════════════════════════════════════════════════
with tab_full:
    if not full_trades:
        st.info("No trades to display.")
    else:
        ft1, ft2, ft3 = st.columns([2, 1, 1])
        symbol_search = ft1.text_input("Search symbol", key="full_symbol_search").strip().upper()
        status_filter = ft2.multiselect(
            "Status", ["OPEN", "CLOSED"], default=["OPEN", "CLOSED"], key="full_status_filter"
        )
        outcome_filter = ft3.selectbox("Outcome", ["All", "Winners", "Losers", "Flat"], key="full_outcome_filter")

        visible_trades = full_trades
        if symbol_search:
            visible_trades = [t for t in visible_trades if symbol_search in str(t["symbol"]).upper()]
        if status_filter:
            visible_trades = [t for t in visible_trades if t["status"] in status_filter]
        if outcome_filter == "Winners":
            visible_trades = [t for t in visible_trades if t["pnl"] > 0]
        elif outcome_filter == "Losers":
            visible_trades = [t for t in visible_trades if t["pnl"] < 0]
        elif outcome_filter == "Flat":
            visible_trades = [t for t in visible_trades if t["pnl"] == 0]

        st.markdown(
            f"**{len(visible_trades)}** shown · "
            f"**{len(full_trades)}** total · "
            f"**{len(closed_trades)}** closed · "
            f"**{len(full_trades)-len(closed_trades)}** open"
        )
        st.caption("Click ▶ to expand a trade and see its individual executions.")
        st.markdown("---")

        if not visible_trades:
            st.info("No trades match the selected filters.")

        if visible_trades:
            st.markdown("**Consolidated Trades**")
            summary_rows = []
            for trade in reversed(visible_trades):
                j_key = (trade["symbol"],
                         trade["entry_time"].isoformat() if pd.notna(trade["entry_time"]) else "")
                journal = all_journals.get(j_key, {})
                setup = journal.get("setup") or ""
                tags  = journal.get("psych_tags") or []
                has_journal = bool(setup or tags or (journal.get("notes") or "").strip())

                # R-multiple: actual P&L / planned risk
                planned_stop = journal.get("planned_stop")
                risk_amount  = journal.get("risk_amount")
                r_multiple   = None
                if risk_amount and risk_amount != 0:
                    r_multiple = round(trade["net_pnl"] / risk_amount, 2)
                elif planned_stop and trade["avg_entry"]:
                    planned_risk = abs(trade["avg_entry"] - planned_stop) * trade["total_qty"]
                    if planned_risk > 0:
                        r_multiple = round(trade["net_pnl"] / planned_risk, 2)

                summary_rows.append({
                    "📝": "✏️" if has_journal else "—",
                    "Symbol": trade["symbol"],
                    "Status": trade["status"],
                    "Setup": setup or "—",
                    "Tags": ", ".join(tags) if tags else "—",
                    "Entry": trade["entry_time"].strftime("%Y-%m-%d %H:%M") if pd.notna(trade["entry_time"]) else None,
                    "Exit": trade["exit_time"].strftime("%Y-%m-%d %H:%M") if pd.notna(trade["exit_time"]) else None,
                    "Qty": trade["total_qty"],
                    "Avg Entry": trade["avg_entry"],
                    "Avg Exit": trade["avg_exit"],
                    "Hold": trade["hold_str"],
                    "P&L": trade["pnl"],
                    "Net P&L": trade["net_pnl"],
                    "P&L %": trade["pnl_pct"],
                    "R": r_multiple,
                    "Comm": trade["commission"],
                    "Execs": trade["n_exec"],
                })

            summary_df = pd.DataFrame(summary_rows)

            def color_pnl(value):
                if pd.isna(value):
                    return ""
                if value > 0:
                    return "color: #2ecc71; font-weight: 700"
                if value < 0:
                    return "color: #e74c3c; font-weight: 700"
                return "color: #aaaaaa; font-weight: 700"

            styled_summary = summary_df.style.format({
                "Qty": lambda v: fmt_qty(v),
                "Avg Entry": lambda v: fmt_usd(v),
                "Avg Exit": lambda v: fmt_usd(v),
                "P&L": lambda v: fmt_usd(v),
                "Net P&L": lambda v: fmt_usd(v),
                "P&L %": lambda v: "—" if pd.isna(v) else f"{v:+.2f}%",
                "R": lambda v: "—" if pd.isna(v) else f"{v:+.2f}R",
                "Comm": lambda v: fmt_usd(v),
            }, na_rep="—").applymap(color_pnl, subset=["P&L", "Net P&L", "P&L %", "R"])

            st.dataframe(
                styled_summary,
                use_container_width=True,
                hide_index=True,
                height=min(420, 38 * (len(summary_df) + 1)),
            )
            st.markdown("---")

        for trade in reversed(visible_trades):
            pnl     = trade["pnl"]
            pnl_pct = trade["pnl_pct"]
            status  = trade["status"]

            icon       = "🟢" if pnl > 0 else ("🔴" if pnl < 0 else "⚪")
            status_tag = "🔵 OPEN" if status == "OPEN" else "✅ CLOSED"
            pct_str    = f" ({pnl_pct:+.2f}%)" if pnl_pct is not None else ""
            entry_str  = trade["entry_time"].strftime("%Y-%m-%d %H:%M") if pd.notna(trade["entry_time"]) else "—"

            header = (
                f"{icon} **{trade['symbol']}** · {status_tag} · "
                f"P&L: **{fmt_usd(pnl)}**{pct_str} · "
                f"Hold: **{trade['hold_str']}** · "
                f"Entry: {entry_str}"
            )

            with st.expander(header, expanded=False):
                pnl_color = "#2ecc71" if pnl > 0 else ("#e74c3c" if pnl < 0 else "#aaaaaa")
                st.markdown(
                    f"""
                    <div style="display:flex;gap:28px;flex-wrap:wrap;padding:8px 0 12px 0;">
                      <div style="min-width:60px;">
                        <div style="font-size:11px;color:#888;margin-bottom:2px;">Symbol</div>
                        <div style="font-size:15px;font-weight:700;">{trade['symbol']}</div>
                      </div>
                      <div style="min-width:50px;">
                        <div style="font-size:11px;color:#888;margin-bottom:2px;">Qty</div>
                        <div style="font-size:15px;font-weight:700;">{fmt_qty(trade['total_qty'])}</div>
                      </div>
                      <div style="min-width:90px;">
                        <div style="font-size:11px;color:#888;margin-bottom:2px;">Avg Entry</div>
                        <div style="font-size:15px;font-weight:700;">{fmt_usd(trade['avg_entry'])}</div>
                      </div>
                      <div style="min-width:90px;">
                        <div style="font-size:11px;color:#888;margin-bottom:2px;">Avg Exit</div>
                        <div style="font-size:15px;font-weight:700;">{fmt_usd(trade['avg_exit'])}</div>
                      </div>
                      <div style="min-width:80px;">
                        <div style="font-size:11px;color:#888;margin-bottom:2px;">Hold</div>
                        <div style="font-size:15px;font-weight:700;">{trade['hold_str']}</div>
                      </div>
                      <div style="min-width:110px;">
                        <div style="font-size:11px;color:#888;margin-bottom:2px;">P&amp;L</div>
                        <div style="font-size:15px;font-weight:700;color:{pnl_color};">{fmt_usd(pnl)}{pct_str}</div>
                      </div>
                      <div style="min-width:80px;">
                        <div style="font-size:11px;color:#888;margin-bottom:2px;">Comm</div>
                        <div style="font-size:15px;font-weight:700;">{fmt_usd(trade['commission'])}</div>
                      </div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

                st.markdown("**Executions**")
                edf = pd.DataFrame(trade["executions"])[[
                    "exec_time","action","quantity","price","proceeds","commission","realized_pnl"
                ]].copy()
                edf["exec_time"] = pd.to_datetime(edf["exec_time"]).dt.strftime("%Y-%m-%d %H:%M:%S")
                edf["quantity"]  = edf["quantity"].apply(lambda v: int(v) if v == int(v) else round(v,2))
                edf.columns = ["DateTime","Action","Qty","Price","Proceeds","Comm","P&L"]
                st.dataframe(edf, use_container_width=True, hide_index=True,
                    column_config={
                        "Price":    st.column_config.NumberColumn(format="$%.2f"),
                        "Proceeds": st.column_config.NumberColumn(format="$%.2f"),
                        "Comm":     st.column_config.NumberColumn(format="$%.2f"),
                        "P&L":      st.column_config.NumberColumn(format="$%.2f"),
                    })

                # ── Journal / Notes ────────────────────────────────────────
                st.markdown("---")
                st.markdown("**📝 Trade Journal**")

                # Stable key for this trade
                j_symbol = trade["symbol"]
                j_entry  = trade["entry_time"]
                j_entry_str = j_entry.isoformat() if pd.notna(j_entry) else ""

                # Look up existing journal entry
                existing = all_journals.get((j_symbol, j_entry_str), {})

                # Unique widget keys per trade
                wk = f"{j_symbol}_{j_entry_str}"

                # Setup selector
                saved_setup = existing.get("setup") or ""
                setup_idx = 0  # "(none)" default
                setup_choices = ["(none)"] + SETUP_OPTIONS
                if saved_setup in SETUP_OPTIONS:
                    setup_idx = SETUP_OPTIONS.index(saved_setup) + 1

                _sc1, _sc2 = st.columns([9, 1])
                with _sc1:
                    j_setup = st.selectbox(
                        "Setup", setup_choices, index=setup_idx, key=f"setup_{wk}",
                        format_func=lambda x: x if x == "(none)" else f"{x}  –  {SETUP_HELP.get(x, '')}"
                    )
                    if j_setup == "(none)":
                        j_setup = ""
                with _sc2:
                    st.markdown("<div style='margin-top:28px'></div>", unsafe_allow_html=True)
                    with st.popover("ℹ️"):
                        st.markdown(
                            "<p dir='rtl' style='font-size:15px;font-weight:700;margin-bottom:8px'>📐 מדריך תבניות כניסה</p>",
                            unsafe_allow_html=True,
                        )
                        rows = "".join(
                            f"<tr><td style='font-weight:600;white-space:nowrap;padding:3px 10px 3px 0'>{k}</td>"
                            f"<td dir='rtl' style='font-size:12px;color:#ccc'>{v}</td></tr>"
                            for k, v in SETUP_HELP_FULL.items()
                        )
                        st.markdown(
                            f"<table style='border-collapse:collapse;width:100%'>{rows}</table>",
                            unsafe_allow_html=True,
                        )

                # Psychological tags
                saved_tags = existing.get("psych_tags") or []
                _tc1, _tc2 = st.columns([9, 1])
                with _tc1:
                    j_tags = st.multiselect(
                        "Psych Tags", PSYCH_TAG_OPTIONS,
                        default=[t for t in saved_tags if t in PSYCH_TAG_OPTIONS],
                        key=f"tags_{wk}",
                        format_func=lambda x: f"{x}  –  {PSYCH_TAG_HELP.get(x, '')}"
                    )
                with _tc2:
                    st.markdown("<div style='margin-top:28px'></div>", unsafe_allow_html=True)
                    with st.popover("ℹ️"):
                        st.markdown(
                            "<p dir='rtl' style='font-size:15px;font-weight:700;margin-bottom:8px'>🧠 מדריך תגיות פסיכולוגיות</p>",
                            unsafe_allow_html=True,
                        )
                        rows = "".join(
                            f"<tr><td style='font-weight:600;white-space:nowrap;padding:3px 10px 3px 0'>{k}</td>"
                            f"<td dir='rtl' style='font-size:12px;color:#ccc'>{v}</td></tr>"
                            for k, v in PSYCH_TAG_HELP_FULL.items()
                        )
                        st.markdown(
                            f"<table style='border-collapse:collapse;width:100%'>{rows}</table>",
                            unsafe_allow_html=True,
                        )

                # Notes
                saved_notes = existing.get("notes") or ""
                j_notes = st.text_area(
                    "Notes", value=saved_notes, height=100, key=f"notes_{wk}",
                    placeholder="What was your plan? What went well / wrong?",
                )

                # Risk / Reward fields
                st.markdown("**📐 Risk / Reward**")
                rr1, rr2, rr3 = st.columns(3)
                saved_stop   = existing.get("planned_stop")
                saved_target = existing.get("planned_target")
                saved_risk   = existing.get("risk_amount")

                j_stop = rr1.number_input(
                    "Planned Stop ($)", value=float(saved_stop) if saved_stop else None,
                    min_value=0.0, step=0.01, format="%.2f", key=f"stop_{wk}",
                    help="Your invalidation / stop-loss price",
                )
                j_target = rr2.number_input(
                    "Planned Target ($)", value=float(saved_target) if saved_target else None,
                    min_value=0.0, step=0.01, format="%.2f", key=f"target_{wk}",
                    help="Your profit target price",
                )
                j_risk = rr3.number_input(
                    "Risk Amount ($)", value=float(saved_risk) if saved_risk else None,
                    min_value=0.0, step=0.01, format="%.2f", key=f"risk_{wk}",
                    help="Total dollar risk (overrides stop × qty calculation)",
                )

                if st.button("💾 Save Journal", key=f"save_{wk}"):
                    try:
                        save_journal(
                            j_symbol, j_entry, j_setup, j_tags, j_notes,
                            planned_stop=j_stop if j_stop else None,
                            planned_target=j_target if j_target else None,
                            risk_amount=j_risk if j_risk else None,
                        )
                        # Update local cache so re-renders show the saved data
                        all_journals[(j_symbol, j_entry_str)] = {
                            "symbol": j_symbol,
                            "entry_time": j_entry_str,
                            "setup": j_setup,
                            "psych_tags": j_tags,
                            "notes": j_notes,
                            "planned_stop": j_stop if j_stop else None,
                            "planned_target": j_target if j_target else None,
                            "risk_amount": j_risk if j_risk else None,
                        }
                        st.success("Journal saved.")
                    except Exception as e:
                        st.error(f"Save failed: {e}")

# ════════════════════════════════════════════════════════════════════════
# TAB 3 — ALL EXECUTIONS
# ════════════════════════════════════════════════════════════════════════
with tab_executions:
    ex1, ex2, ex3 = st.columns([2, 1, 1])
    exec_symbol_search = ex1.text_input("Search symbol", key="exec_symbol_search").strip().upper()
    action_options = sorted(df["action"].dropna().unique().tolist())
    action_filter = ex2.multiselect("Action", action_options, default=action_options, key="exec_action_filter")
    pnl_filter = ex3.selectbox("P&L", ["All", "Profit", "Loss", "Flat"], key="exec_pnl_filter")

    exec_df = df.copy()
    if exec_symbol_search:
        exec_df = exec_df[exec_df["symbol"].str.upper().str.contains(exec_symbol_search, na=False)]
    if action_filter:
        exec_df = exec_df[exec_df["action"].isin(action_filter)]
    if pnl_filter == "Profit":
        exec_df = exec_df[exec_df["realized_pnl"] > 0]
    elif pnl_filter == "Loss":
        exec_df = exec_df[exec_df["realized_pnl"] < 0]
    elif pnl_filter == "Flat":
        exec_df = exec_df[exec_df["realized_pnl"] == 0]

    disp = exec_df[["exec_time","symbol","action","quantity","price",
               "proceeds","commission","realized_pnl"]].copy()
    disp = disp.sort_values("exec_time", ascending=False)
    disp["exec_time"] = disp["exec_time"].dt.strftime("%Y-%m-%d %H:%M:%S")
    disp["quantity"]  = disp["quantity"].apply(lambda v: int(v) if v == int(v) else round(v,2))
    disp.columns = ["DateTime","Symbol","Action","Qty","Price","Proceeds","Comm","P&L"]

    st.markdown(f"**{len(disp)}** shown · **{len(df)}** executions · {range_label}")
    st.dataframe(disp, use_container_width=True, hide_index=True, height=600,
        column_config={
            "Price":    st.column_config.NumberColumn(format="$%.2f"),
            "Proceeds": st.column_config.NumberColumn(format="$%.2f"),
            "Comm":     st.column_config.NumberColumn(format="$%.2f"),
            "P&L":      st.column_config.NumberColumn(format="$%.2f"),
        })

# ════════════════════════════════════════════════════════════════════════
# TAB 4 — TRANSACTIONS (FX / cash deposits)
# ════════════════════════════════════════════════════════════════════════
with tab_cash:
    if df_cash.empty:
        st.info("No cash/FX transactions found for the selected date range.")
    else:
        # ── Metrics ────────────────────────────────────────────────────
        # USD.ILS BUY = depositing ILS → receiving USD (cash loaded)
        # ILS.USD BUY = converting USD → ILS (small change / partial withdrawal)
        deposits   = df_cash[df_cash["usd_amount"] > 0]["usd_amount"].sum()
        withdrawals= abs(df_cash[df_cash["usd_amount"] < 0]["usd_amount"].sum())
        net_usd    = deposits - withdrawals
        total_ils  = df_cash["ils_amount"].sum()
        total_comm = df_cash["commission"].sum()
        n          = len(df_cash)

        st.subheader("Cash Loaded to Broker")
        m1,m2,m3,m4,m5 = st.columns(5)
        m1.metric("Total Deposited (USD)", fmt_usd(deposits))
        m2.metric("Withdrawals (USD)",     fmt_usd(withdrawals))
        m3.metric("Net USD in Account",    fmt_usd(net_usd))
        m4.metric("Total ILS Converted",   f"₪{total_ils:,.0f}")
        m5.metric("Total Commission",      fmt_usd(total_comm))

        st.markdown("---")

        # ── Per-date bar chart ─────────────────────────────────────────
        st.subheader("USD Deposited per Day")
        daily_dep = (
            df_cash[df_cash["usd_amount"] > 0]
            .groupby("transaction_date")["usd_amount"]
            .sum()
            .reset_index()
        )
        daily_dep.columns = ["Date","USD Deposited"]
        if not daily_dep.empty:
            fig_dep = px.bar(daily_dep, x="Date", y="USD Deposited",
                             color_discrete_sequence=["#2ecc71"])
            fig_dep.update_layout(margin=dict(t=10))
            st.plotly_chart(fig_dep, use_container_width=True)

        st.markdown("---")

        # ── Detail table ───────────────────────────────────────────────
        st.subheader("All Transactions")
        tx1, tx2, tx3 = st.columns([2, 1, 1])
        pair_search = tx1.text_input("Search pair", key="cash_pair_search").strip().upper()
        direction_options = sorted(df_cash["action"].dropna().unique().tolist())
        direction_filter = tx2.multiselect("Direction", direction_options, default=direction_options, key="cash_direction_filter")
        currency_options = sorted(df_cash["currency"].dropna().unique().tolist())
        currency_filter = tx3.multiselect("Currency", currency_options, default=currency_options, key="cash_currency_filter")

        cash_view = df_cash.copy()
        if pair_search:
            cash_view = cash_view[cash_view["symbol"].str.upper().str.contains(pair_search, na=False)]
        if direction_filter:
            cash_view = cash_view[cash_view["action"].isin(direction_filter)]
        if currency_filter:
            cash_view = cash_view[cash_view["currency"].isin(currency_filter)]

        detail = cash_view[[
            "exec_time","symbol","action",
            "quantity","rate","usd_amount","ils_amount","commission","currency"
        ]].copy().sort_values("exec_time", ascending=False)
        detail["exec_time"]   = detail["exec_time"].dt.strftime("%Y-%m-%d %H:%M:%S")
        detail["quantity"]    = detail["quantity"].apply(lambda v: round(v, 2) if pd.notna(v) else v)
        detail["rate"]        = detail["rate"].apply(lambda v: round(v, 4) if pd.notna(v) else v)
        detail["usd_amount"]  = detail["usd_amount"].apply(lambda v: round(v, 2) if pd.notna(v) else v)
        detail["ils_amount"]  = detail["ils_amount"].apply(lambda v: round(v, 2) if pd.notna(v) else v)
        detail["commission"]  = detail["commission"].apply(lambda v: round(v, 2) if pd.notna(v) else v)
        detail.columns = ["DateTime","Pair","Dir","Qty","Rate","USD Amount","ILS Amount","Comm","Currency"]

        st.dataframe(detail, use_container_width=True, hide_index=True, height=500,
            column_config={
                "Rate":       st.column_config.NumberColumn(format="%.4f"),
                "USD Amount": st.column_config.NumberColumn(format="$%.2f"),
                "ILS Amount": st.column_config.NumberColumn(format="₪%.2f"),
                "Comm":       st.column_config.NumberColumn(format="$%.2f"),
            })
        st.caption(f"{len(detail)} shown · {n} transaction(s) · {range_label}")
