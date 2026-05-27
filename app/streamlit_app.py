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
    cost_basis = (buys["price"] * buys["quantity"]).sum() if buy_qty else None
    pnl_pct    = (pnl / cost_basis * 100) if cost_basis else None

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

    c1,c2,c3,c4,c5,c6,c7,c8 = st.columns(8)
    c1.metric("Gross P&L",   fmt_usd(gross_pnl))
    c2.metric("Commission",  fmt_usd(total_comm))
    c3.metric("Net P&L",     fmt_usd(net_pnl))
    c4.metric("Win Rate",    f"{win_rate:.1f}%")
    c5.metric("Trades",      n_closed)
    c6.metric("Avg / Trade", fmt_usd(avg_pnl))
    c7.metric("Best Day",    fmt_usd(best_day))
    c8.metric("Worst Day",   fmt_usd(worst_day))

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
        st.markdown(
            f"**{len(full_trades)}** trade(s) · "
            f"**{len(closed_trades)}** closed · "
            f"**{len(full_trades)-len(closed_trades)}** open"
        )
        st.caption("Click ▶ to expand a trade and see its individual executions.")
        st.markdown("---")

        for trade in reversed(full_trades):
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
                s1,s2,s3,s4,s5,s6,s7 = st.columns(7)
                s1.metric("Symbol",    trade["symbol"])
                s2.metric("Qty",       fmt_qty(trade["total_qty"]))
                s3.metric("Avg Entry", fmt_usd(trade["avg_entry"]))
                s4.metric("Avg Exit",  fmt_usd(trade["avg_exit"]))
                s5.metric("Hold",      trade["hold_str"])
                s6.metric("P&L",       f"{fmt_usd(pnl)}{pct_str}")
                s7.metric("Comm",      fmt_usd(trade["commission"]))

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

# ════════════════════════════════════════════════════════════════════════
# TAB 3 — ALL EXECUTIONS
# ════════════════════════════════════════════════════════════════════════
with tab_executions:
    disp = df[["exec_time","symbol","action","quantity","price",
               "proceeds","commission","realized_pnl"]].copy()
    disp = disp.sort_values("exec_time", ascending=False)
    disp["exec_time"] = disp["exec_time"].dt.strftime("%Y-%m-%d %H:%M:%S")
    disp["quantity"]  = disp["quantity"].apply(lambda v: int(v) if v == int(v) else round(v,2))
    disp.columns = ["DateTime","Symbol","Action","Qty","Price","Proceeds","Comm","P&L"]

    st.markdown(f"**{len(df)}** executions · {range_label}")
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
        detail = df_cash[[
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
        st.caption(f"{n} transaction(s) · {range_label}")
