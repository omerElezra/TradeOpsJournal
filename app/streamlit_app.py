import os
import math
from datetime import date, timedelta, datetime

import pandas as pd
import plotly.express as px
import streamlit as st
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

st.set_page_config(page_title="Trading Journal", page_icon="📈", layout="wide")

# ── Supabase ───────────────────────────────────────────────────────────────────

@st.cache_resource
def get_supabase():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


@st.cache_data(ttl=300)
def load_cash(start: str | None, end: str | None) -> pd.DataFrame:
    client = get_supabase()
    q = client.table("cash_transactions").select("*").order("exec_time")
    if start:
        q = q.gte("transaction_date", start)
    if end:
        q = q.lte("transaction_date", end)
    res = q.execute()
    if not res.data:
        return pd.DataFrame()
    df = pd.DataFrame(res.data)
    df["exec_time"]        = pd.to_datetime(df["exec_time"], errors="coerce", utc=True).dt.tz_localize(None)
    df["transaction_date"] = pd.to_datetime(df["transaction_date"], errors="coerce").dt.date
    for col in ["quantity", "rate", "net_cash", "commission"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


@st.cache_data(ttl=300)
def load_trades(start: str | None, end: str | None) -> pd.DataFrame:
    client = get_supabase()
    q = client.table("trades").select("*").order("exec_time")
    if start:
        q = q.gte("trade_date", start)
    if end:
        q = q.lte("trade_date", end)
    res = q.execute()
    if not res.data:
        return pd.DataFrame()
    df = pd.DataFrame(res.data)
    df["exec_time"]  = pd.to_datetime(df["exec_time"],  errors="coerce", utc=True).dt.tz_localize(None)
    df["trade_date"] = pd.to_datetime(df["trade_date"], errors="coerce").dt.date
    for col in ["quantity", "price", "proceeds", "commission", "realized_pnl"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


# ── Trade grouping ─────────────────────────────────────────────────────────────

def format_duration(td):
    """Format a timedelta as '2h 15m 30s' or '45m 10s' or '30s'."""
    if pd.isnull(td):
        return "—"
    total = int(td.total_seconds())
    h, rem = divmod(abs(total), 3600)
    m, s   = divmod(rem, 60)
    if h:
        return f"{h}h {m}m {s}s"
    if m:
        return f"{m}m {s}s"
    return f"{s}s"


def build_trade_summary(execs: list[dict], open_trade: bool = False) -> dict:
    df = pd.DataFrame(execs)
    buys  = df[df["action"] == "BUY"]
    sells = df[df["action"] == "SELL"]

    total_buy_qty  = buys["quantity"].sum()
    total_sell_qty = sells["quantity"].sum()
    total_qty      = max(total_buy_qty, total_sell_qty)

    avg_entry = (buys["price"] * buys["quantity"]).sum() / total_buy_qty   if total_buy_qty  else None
    avg_exit  = (sells["price"] * sells["quantity"]).sum() / total_sell_qty if total_sell_qty else None

    entry_time = df["exec_time"].min()
    exit_time  = df["exec_time"].max() if not open_trade else None
    hold_td    = (exit_time - entry_time) if exit_time and not pd.isnull(exit_time) else None

    pnl        = df["realized_pnl"].sum()
    commission = df["commission"].sum()

    # P&L % relative to cost basis of buys
    cost_basis = (buys["price"] * buys["quantity"]).sum() if total_buy_qty else None
    pnl_pct    = (pnl / cost_basis * 100) if cost_basis else None

    return {
        "symbol":      df["symbol"].iloc[0],
        "status":      "OPEN" if open_trade else "CLOSED",
        "entry_time":  entry_time,
        "exit_time":   exit_time,
        "hold_time":   hold_td,
        "hold_str":    format_duration(hold_td),
        "total_qty":   total_qty,
        "avg_entry":   round(avg_entry, 4) if avg_entry else None,
        "avg_exit":    round(avg_exit,  4) if avg_exit  else None,
        "pnl":         round(pnl, 2),
        "pnl_pct":     round(pnl_pct, 2) if pnl_pct else None,
        "commission":  round(commission, 2),
        "executions":  execs,          # kept for drill-down
        "n_executions": len(execs),
    }


def group_into_full_trades(df: pd.DataFrame) -> list[dict]:
    """
    Group individual EXECUTION rows into complete trades per symbol.
    A trade starts when position moves from 0 → non-zero,
    and closes when it returns to 0.
    """
    if df.empty:
        return []

    all_trades = []

    for symbol, sym_df in df.groupby("symbol"):
        sym_df = sym_df.sort_values("exec_time").reset_index(drop=True)

        position   = 0.0
        in_trade   = False
        trade_execs = []

        for _, row in sym_df.iterrows():
            delta = row["quantity"] if row["action"] == "BUY" else -row["quantity"]

            if not in_trade:
                # Start a new trade
                in_trade    = True
                trade_execs = [row.to_dict()]
                position    = delta
            else:
                trade_execs.append(row.to_dict())
                position += delta
                if abs(position) < 0.001:          # position back to zero → trade closed
                    all_trades.append(build_trade_summary(trade_execs, open_trade=False))
                    trade_execs = []
                    in_trade    = False
                    position    = 0.0

        # Remaining open position
        if trade_execs:
            all_trades.append(build_trade_summary(trade_execs, open_trade=True))

    all_trades.sort(key=lambda t: t["entry_time"] if t["entry_time"] is not pd.NaT else datetime.min)
    return all_trades


# ── Sidebar ────────────────────────────────────────────────────────────────────

st.sidebar.title("📈 Trading Journal")
st.sidebar.markdown("---")

today = date.today()
quick = st.sidebar.radio(
    "Date range",
    ["ALL", "Today", "This Week", "This Month", "YTD", "Custom"],
    index=0,
)

start_date = end_date = None

if quick == "Today":
    start_date = end_date = today
elif quick == "This Week":
    start_date = today - timedelta(days=today.weekday())
    end_date   = today
elif quick == "This Month":
    start_date = today.replace(day=1)
    end_date   = today
elif quick == "YTD":
    start_date = today.replace(month=1, day=1)
    end_date   = today
elif quick == "Custom":
    start_date = st.sidebar.date_input("From", today - timedelta(days=30))
    end_date   = st.sidebar.date_input("To",   today)

range_label = "All time" if quick == "ALL" else f"{start_date} → {end_date}"
st.sidebar.markdown(f"**{range_label}**")

df = load_trades(
    str(start_date) if start_date else None,
    str(end_date)   if end_date   else None,
)
df_cash = load_cash(
    str(start_date) if start_date else None,
    str(end_date)   if end_date   else None,
)

# ── Main header ────────────────────────────────────────────────────────────────

st.title("📈 Trading Journal")

if df.empty:
    st.info("No trades found for the selected date range.")
    st.stop()

# Pre-compute grouped trades (used across tabs)
full_trades = group_into_full_trades(df)
closed_trades = [t for t in full_trades if t["status"] == "CLOSED"]

# ── Tabs ───────────────────────────────────────────────────────────────────────

tab_overview, tab_full, tab_executions, tab_cash = st.tabs([
    "📊 Overview", "📋 Full Trades", "🔍 All Executions", "💵 Transactions"
])

# ════════════════════════════════════════════════════════════════════════
# TAB 1 — OVERVIEW
# ════════════════════════════════════════════════════════════════════════
with tab_overview:

    total_pnl    = df["realized_pnl"].sum()
    total_comm   = df["commission"].sum()
    net_pnl      = total_pnl + total_comm          # commission is already negative
    wins  = sum(1 for t in closed_trades if t["pnl"] > 0)
    total = len(closed_trades)
    win_rate  = (wins / total * 100) if total else 0

    daily     = df.groupby("trade_date")["realized_pnl"].sum()
    best_day  = daily.max() if not daily.empty else 0
    worst_day = daily.min() if not daily.empty else 0
    avg_pnl   = sum(t["pnl"] for t in closed_trades) / total if total else 0

    c1, c2, c3, c4, c5, c6, c7, c8 = st.columns(8)
    c1.metric("Gross P&L",     f"${total_pnl:,.2f}")
    c2.metric("Total Commission", f"${total_comm:,.2f}")
    c3.metric("Net P&L",       f"${net_pnl:,.2f}")
    c4.metric("Win Rate",      f"{win_rate:.1f}%")
    c5.metric("Closed Trades", total)
    c6.metric("Avg P&L/Trade", f"${avg_pnl:,.2f}")
    c7.metric("Best Day",      f"${best_day:,.2f}")
    c8.metric("Worst Day",     f"${worst_day:,.2f}")

    st.markdown("---")
    col_l, col_r = st.columns(2)

    with col_l:
        st.subheader("Daily P&L")
        ddf = daily.reset_index()
        ddf.columns = ["Date", "P&L"]
        fig = px.bar(ddf, x="Date", y="P&L",
                     color="P&L",
                     color_continuous_scale=["#e74c3c", "#2ecc71"],
                     color_continuous_midpoint=0)
        fig.update_layout(showlegend=False, coloraxis_showscale=False, margin=dict(t=10))
        st.plotly_chart(fig, use_container_width=True)

    with col_r:
        st.subheader("Equity Curve")
        eq = daily.cumsum().reset_index()
        eq.columns = ["Date", "Cumulative P&L"]
        fig2 = px.line(eq, x="Date", y="Cumulative P&L", markers=True)
        fig2.update_traces(line_color="#3498db")
        fig2.update_layout(margin=dict(t=10))
        st.plotly_chart(fig2, use_container_width=True)

    st.subheader("P&L by Symbol")
    sym_pnl = df.groupby("symbol")["realized_pnl"].sum().sort_values().reset_index()
    sym_pnl.columns = ["Symbol", "P&L"]
    fig3 = px.bar(sym_pnl, x="P&L", y="Symbol", orientation="h",
                  color="P&L",
                  color_continuous_scale=["#e74c3c", "#2ecc71"],
                  color_continuous_midpoint=0)
    fig3.update_layout(showlegend=False, coloraxis_showscale=False, margin=dict(t=10))
    st.plotly_chart(fig3, use_container_width=True)

# ════════════════════════════════════════════════════════════════════════
# TAB 2 — FULL TRADES (grouped, with drill-down)
# ════════════════════════════════════════════════════════════════════════
with tab_full:

    if not full_trades:
        st.info("No trades to display.")
    else:
        st.markdown(
            f"**{len(full_trades)}** trade(s) · "
            f"**{len(closed_trades)}** closed · "
            f"**{len(full_trades) - len(closed_trades)}** open"
        )
        st.markdown("Click **▶ Details** to see individual executions for each trade.")
        st.markdown("---")

        for i, trade in enumerate(reversed(full_trades)):  # newest first
            pnl      = trade["pnl"]
            pnl_pct  = trade["pnl_pct"]
            status   = trade["status"]

            pnl_color  = "🟢" if pnl > 0 else ("🔴" if pnl < 0 else "⚪")
            status_tag = "🔵 OPEN" if status == "OPEN" else "✅ CLOSED"

            entry_str = trade["entry_time"].strftime("%Y-%m-%d %H:%M:%S") if pd.notna(trade["entry_time"]) else "—"
            exit_str  = trade["exit_time"].strftime("%Y-%m-%d %H:%M:%S") if trade["exit_time"] and pd.notna(trade["exit_time"]) else "—"

            pnl_pct_str = f"  ({pnl_pct:+.2f}%)" if pnl_pct is not None else ""
            header = (
                f"{pnl_color} **{trade['symbol']}** · {status_tag} · "
                f"P&L: **${pnl:+,.2f}**{pnl_pct_str} · "
                f"Hold: {trade['hold_str']} · "
                f"{entry_str}"
            )

            with st.expander(header, expanded=False):

                # Summary row
                s1, s2, s3, s4, s5, s6, s7 = st.columns(7)
                s1.metric("Symbol",      trade["symbol"])
                s2.metric("Total Qty",   f"{int(trade['total_qty'])}")
                s3.metric("Avg Entry",   f"${trade['avg_entry']:,.4f}"  if trade["avg_entry"]  else "—")
                s4.metric("Avg Exit",    f"${trade['avg_exit']:,.4f}"   if trade["avg_exit"]   else "—")
                s5.metric("Hold Time",   trade["hold_str"])
                s6.metric("P&L",         f"${pnl:+,.2f}" + (f"\n{pnl_pct:+.2f}%" if pnl_pct else ""))
                s7.metric("Commission",  f"${trade['commission']:,.2f}")

                st.markdown("**Executions:**")
                exec_df = pd.DataFrame(trade["executions"])
                exec_display = exec_df[[
                    "exec_time", "action", "quantity", "price",
                    "proceeds", "commission", "realized_pnl"
                ]].copy()
                exec_display["exec_time"] = pd.to_datetime(exec_display["exec_time"]).dt.strftime("%Y-%m-%d %H:%M:%S")
                exec_display.columns = ["DateTime", "Action", "Qty", "Price", "Proceeds", "Commission", "Realized P&L"]
                st.dataframe(
                    exec_display,
                    use_container_width=True,
                    column_config={
                        "Price":         st.column_config.NumberColumn(format="$%.4f"),
                        "Proceeds":      st.column_config.NumberColumn(format="$%.2f"),
                        "Commission":    st.column_config.NumberColumn(format="$%.2f"),
                        "Realized P&L":  st.column_config.NumberColumn(format="$%.2f"),
                    },
                    hide_index=True,
                )

# ════════════════════════════════════════════════════════════════════════
# TAB 3 — ALL EXECUTIONS (raw)
# ════════════════════════════════════════════════════════════════════════
with tab_executions:

    display = df[[
        "exec_time", "symbol", "action",
        "quantity", "price", "proceeds", "commission", "realized_pnl"
    ]].copy().sort_values("exec_time", ascending=False)
    display["exec_time"] = display["exec_time"].dt.strftime("%Y-%m-%d %H:%M:%S")
    display.columns = ["DateTime", "Symbol", "Action", "Qty", "Price", "Proceeds", "Commission", "Realized P&L"]

    st.markdown(f"**{len(df)}** execution rows · {range_label}")
    st.dataframe(
        display,
        use_container_width=True,
        column_config={
            "Price":         st.column_config.NumberColumn(format="$%.4f"),
            "Proceeds":      st.column_config.NumberColumn(format="$%.2f"),
            "Commission":    st.column_config.NumberColumn(format="$%.2f"),
            "Realized P&L":  st.column_config.NumberColumn(format="$%.2f"),
        },
        hide_index=True,
        height=600,
    )

# ════════════════════════════════════════════════════════════════════════
# TAB 4 — TRANSACTIONS (cash_transactions table)
# ════════════════════════════════════════════════════════════════════════
with tab_cash:

    if df_cash.empty:
        st.info("No cash/FX transactions found for the selected date range.")
    else:
        # ── Summary metrics ────────────────────────────────────────────
        total_net     = df_cash["net_cash"].sum()
        total_comm    = df_cash["commission"].sum()
        n_rows        = len(df_cash)
        symbols       = df_cash["symbol"].nunique()

        # Per-symbol breakdown
        sym_summary = (
            df_cash.groupby("symbol")
            .agg(
                Count       = ("transaction_id", "count"),
                Total_Qty   = ("quantity", "sum"),
                Avg_Rate    = ("rate", "mean"),
                Net_Cash    = ("net_cash", "sum"),
                Commission  = ("commission", "sum"),
            )
            .reset_index()
            .sort_values("Net_Cash")
        )
        sym_summary.columns = ["Symbol", "Count", "Total Qty", "Avg Rate", "Net Cash (USD)", "Commission"]

        st.subheader("Summary")
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Transactions",     n_rows)
        m2.metric("Unique Pairs",     symbols)
        m3.metric("Total Net Cash",   f"${total_net:,.2f}")
        m4.metric("Total Commission", f"${total_comm:,.2f}")

        st.markdown("---")

        st.subheader("By Symbol / Currency Pair")
        st.dataframe(
            sym_summary,
            use_container_width=True,
            column_config={
                "Avg Rate":         st.column_config.NumberColumn(format="%.6f"),
                "Net Cash (USD)":   st.column_config.NumberColumn(format="$%.2f"),
                "Commission":       st.column_config.NumberColumn(format="$%.2f"),
            },
            hide_index=True,
        )

        # ── Daily net cash chart ───────────────────────────────────────
        st.subheader("Daily Net Cash Flow")
        daily_cash = df_cash.groupby("transaction_date")["net_cash"].sum().reset_index()
        daily_cash.columns = ["Date", "Net Cash"]
        fig_cash = px.bar(
            daily_cash, x="Date", y="Net Cash",
            color="Net Cash",
            color_continuous_scale=["#e74c3c", "#2ecc71"],
            color_continuous_midpoint=0,
        )
        fig_cash.update_layout(showlegend=False, coloraxis_showscale=False, margin=dict(t=10))
        st.plotly_chart(fig_cash, use_container_width=True)

        st.markdown("---")

        # ── Full detail table ──────────────────────────────────────────
        st.subheader("Transaction Detail")
        detail = df_cash[[
            "exec_time", "symbol", "description", "action",
            "quantity", "rate", "net_cash", "commission", "currency"
        ]].copy().sort_values("exec_time", ascending=False)
        detail["exec_time"] = detail["exec_time"].dt.strftime("%Y-%m-%d %H:%M:%S")
        detail.columns = ["DateTime", "Symbol", "Description", "Action",
                          "Qty", "Rate", "Net Cash", "Commission", "Currency"]

        st.dataframe(
            detail,
            use_container_width=True,
            column_config={
                "Rate":        st.column_config.NumberColumn(format="%.6f"),
                "Net Cash":    st.column_config.NumberColumn(format="$%.2f"),
                "Commission":  st.column_config.NumberColumn(format="$%.2f"),
            },
            hide_index=True,
            height=500,
        )
        st.caption(f"{n_rows} transaction(s) · {range_label}")
