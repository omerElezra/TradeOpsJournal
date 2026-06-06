from datetime import datetime, timedelta, timezone

from app.domain import metrics
from app.domain.grouping import RawExecution, group_executions

BASE = datetime(2026, 5, 1, 14, 30, tzinfo=timezone.utc)


def round_trip(symbol, entry_price, exit_price, qty=100, day=0, action="BUY"):
    t0 = BASE + timedelta(days=day)
    close = "SELL" if action == "BUY" else "BUY"
    return [
        RawExecution(f"{symbol}-o-{day}", t0, symbol, action, qty, entry_price, commission=0.0),
        RawExecution(
            f"{symbol}-c-{day}", t0 + timedelta(minutes=30), symbol, close, qty, exit_price,
            commission=0.0,
        ),
    ]


def make_groups():
    execs = []
    execs += round_trip("AAA", 10.0, 12.0, day=0)   # +200 win
    execs += round_trip("BBB", 20.0, 18.0, day=1)   # -200 loss
    execs += round_trip("CCC", 5.0, 6.0, day=2)     # +100 win
    return group_executions(execs)


def test_win_rate():
    g = make_groups()
    assert metrics.win_rate(g) == 66.6667


def test_gross_and_profit_factor():
    g = make_groups()
    assert metrics.gross_profit(g) == 300.0
    assert metrics.gross_loss(g) == -200.0
    assert metrics.profit_factor(g) == 1.5


def test_net_pnl_and_expectancy():
    g = make_groups()
    assert metrics.net_pnl(g) == 100.0
    assert metrics.expectancy(g) == round(100.0 / 3, 2)


def test_total_trades():
    assert metrics.total_trades(make_groups()) == 3


def test_max_drawdown_is_non_positive():
    g = make_groups()
    assert metrics.max_drawdown(g) <= 0


def test_r_multiple():
    assert metrics.r_multiple(200.0, 100.0) == 2.0
    assert metrics.r_multiple(200.0, None) is None


def test_empty_inputs_are_safe():
    assert metrics.win_rate([]) == 0.0
    assert metrics.profit_factor([]) == 0.0
    assert metrics.net_roi([]) == 0.0
    assert metrics.max_drawdown([]) == 0.0
