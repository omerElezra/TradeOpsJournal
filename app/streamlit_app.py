import os
from datetime import date, timedelta

import pandas as pd
import plotly.express as px
import streamlit as st
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

st.set_page_config(page_title="Trading Journal", page_icon="📈", layout="wide")

# ── Supabase connection ────────────────────────────────────────────────────────

@st.cache_resource
def get_supabase():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


@st.cache_data(ttl=300)
def load_trades(start: str, end: str) -> pd.DataFrame:
    client = get_supabase()
    res = (
        client.table("trades")
        .select("*")
        .gte("trade_date", start)
        .lte("trade_date", end)
        .order("exec_time")
        .execute()
    )
    if not res.data:
        return pd.DataFrame()
    df = pd.DataFrame(res.data)
    df["exec_time"]  = pd.to_datetime(df["exec_time"],  errors="coerce")
    df["trade_date"] = pd.to_datetime(df["trade_date"], errors="coerce").dt.date
    for col in ["quantity", "price", "proceeds", "commission", "realized_pnl"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


# ── Sidebar — date range ───────────────────────────────────────────────────────

st.sidebar.title("📈 Trading Journal")
st.sidebar.markdown("---")

today = date.today()
quick = st.sidebar.radio(
    "Quick range",
    ["Today", "This Week", "This Month", "YTD", "Custom"],
    index=2,
)

if quick == "Today":
    start_date, end_date = today, today
elif quick == "This Week":
    start_date = today - timedelta(days=today.weekday())
    end_date = today
elif quick == "This Month":
    start_date = today.replace(day=1)
    end_date = today
elif quick == "YTD":
    start_date = today.replace(month=1, day=1)
    end_date = today
else:
    start_date = st.sidebar.date_input("From", today - timedelta(days=30))
    end_date   = st.sidebar.date_input("To",   today)

st.sidebar.markdown(f"**{start_date}** → **{end_date}**")

df = load_trades(str(start_date), str(end_date))

# ── Header ─────────────────────────────────────────────────────────────────────

st.title("📈 Trading Journal")

if df.empty:
    st.info("No trades found for the selected date range.")
    st.stop()

# ── Summary metrics ────────────────────────────────────────────────────────────

total_pnl        = df["realized_pnl"].sum()
total_commission = df["commission"].sum()
num_trades       = len(df)

closed   = df[df["realized_pnl"].notna() & (df["realized_pnl"] != 0)]
wins     = (closed["realized_pnl"] > 0).sum()
win_rate = (wins / len(closed) * 100) if len(closed) > 0 else 0

daily     = df.groupby("trade_date")["realized_pnl"].sum()
best_day  = daily.max() if not daily.empty else 0
worst_day = daily.min() if not daily.empty else 0

c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Total P&L",  f"${total_pnl:,.2f}")
c2.metric("Win Rate",   f"{win_rate:.1f}%")
c3.metric("# Trades",   num_trades)
c4.metric("Best Day",   f"${best_day:,.2f}")
c5.metric("Worst Day",  f"${worst_day:,.2f}")

st.markdown("---")

# ── Charts ─────────────────────────────────────────────────────────────────────

col_left, col_right = st.columns(2)

with col_left:
    st.subheader("Daily P&L")
    daily_df = daily.reset_index()
    daily_df.columns = ["Date", "P&L"]
    fig = px.bar(
        daily_df, x="Date", y="P&L",
        color="P&L",
        color_continuous_scale=["#e74c3c", "#2ecc71"],
        color_continuous_midpoint=0,
    )
    fig.update_layout(showlegend=False, coloraxis_showscale=False, margin=dict(t=10))
    st.plotly_chart(fig, use_container_width=True)

with col_right:
    st.subheader("Equity Curve")
    equity = daily.cumsum().reset_index()
    equity.columns = ["Date", "Cumulative P&L"]
    fig2 = px.line(equity, x="Date", y="Cumulative P&L", markers=True)
    fig2.update_traces(line_color="#3498db")
    fig2.update_layout(margin=dict(t=10))
    st.plotly_chart(fig2, use_container_width=True)

# ── P&L by symbol ──────────────────────────────────────────────────────────────

st.subheader("P&L by Symbol")
sym_pnl = (
    df.groupby("symbol")["realized_pnl"]
    .sum()
    .sort_values()
    .reset_index()
)
sym_pnl.columns = ["Symbol", "P&L"]
fig3 = px.bar(
    sym_pnl, x="P&L", y="Symbol", orientation="h",
    color="P&L",
    color_continuous_scale=["#e74c3c", "#2ecc71"],
    color_continuous_midpoint=0,
)
fig3.update_layout(showlegend=False, coloraxis_showscale=False, margin=dict(t=10))
st.plotly_chart(fig3, use_container_width=True)

st.markdown("---")

# ── Trade log ──────────────────────────────────────────────────────────────────

st.subheader("Trade Log")

display = df[[
    "exec_time", "symbol", "action",
    "quantity", "price", "proceeds", "commission", "realized_pnl"
]].copy()
display = display.sort_values("exec_time", ascending=False)
display.columns = ["DateTime", "Symbol", "Action", "Qty", "Price", "Proceeds", "Commission", "Realized P&L"]

st.dataframe(
    display,
    use_container_width=True,
    column_config={
        "DateTime":      st.column_config.DatetimeColumn(format="YYYY-MM-DD HH:mm:ss"),
        "Price":         st.column_config.NumberColumn(format="$%.4f"),
        "Proceeds":      st.column_config.NumberColumn(format="$%.2f"),
        "Commission":    st.column_config.NumberColumn(format="$%.2f"),
        "Realized P&L":  st.column_config.NumberColumn(format="$%.2f"),
    },
    hide_index=True,
)

st.caption(f"Showing {len(df)} trades · {start_date} → {end_date} · refreshes every 5 min")
