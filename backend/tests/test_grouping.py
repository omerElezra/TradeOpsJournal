from datetime import datetime, timedelta, timezone

from app.domain.grouping import RawExecution, group_executions

BASE = datetime(2026, 5, 1, 14, 30, tzinfo=timezone.utc)


def ex(action, qty, price, minutes=0, symbol="AAPL", realized=None, commission=-1.0):
    return RawExecution(
        trade_id=f"{symbol}-{action}-{minutes}",
        exec_time=BASE + timedelta(minutes=minutes),
        symbol=symbol,
        action=action,
        quantity=qty,
        price=price,
        commission=commission,
        realized_pnl=realized,
    )


def test_simple_long_round_trip_is_a_win():
    groups = group_executions([ex("BUY", 100, 10.0, 0), ex("SELL", 100, 11.0, 30)])
    assert len(groups) == 1
    g = groups[0]
    assert g.side == "LONG"
    assert g.status == "CLOSED"
    assert g.qty == 100
    assert g.avg_entry == 10.0
    assert g.avg_exit == 11.0
    # gross 100*(11-10)=100, commissions -1 + -1 = -2 -> net 98
    assert g.net_pnl == 98.0
    assert g.result == "WIN"
    assert g.holding_minutes == 30


def test_short_round_trip_is_a_loss():
    groups = group_executions([ex("SELL", 50, 20.0, 0), ex("BUY", 50, 22.0, 10)])
    g = groups[0]
    assert g.side == "SHORT"
    # short: (entry-exit)*qty = (20-22)*50 = -100, minus commissions -2 -> -102
    assert g.net_pnl == -102.0
    assert g.result == "LOSS"


def test_scaling_in_and_out_uses_vwap():
    groups = group_executions(
        [
            ex("BUY", 100, 10.0, 0),
            ex("BUY", 100, 12.0, 5),
            ex("SELL", 200, 13.0, 20),
        ]
    )
    g = groups[0]
    assert g.qty == 200
    assert g.avg_entry == 11.0  # vwap of 10 and 12
    assert g.avg_exit == 13.0


def test_two_separate_round_trips_same_symbol():
    groups = group_executions(
        [
            ex("BUY", 10, 5.0, 0),
            ex("SELL", 10, 6.0, 5),
            ex("BUY", 10, 7.0, 60),
            ex("SELL", 10, 6.0, 65),
        ]
    )
    assert len(groups) == 2


def test_open_position_is_flagged_open():
    groups = group_executions([ex("BUY", 100, 10.0, 0)])
    g = groups[0]
    assert g.status == "OPEN"
    assert g.exit_time is None
    assert g.result == "BREAKEVEN"


def test_realized_pnl_preferred_when_present():
    groups = group_executions(
        [ex("BUY", 100, 10.0, 0, realized=0.0), ex("SELL", 100, 11.0, 30, realized=120.0)]
    )
    g = groups[0]
    # realized sum 120 + commissions -2 = 118
    assert g.net_pnl == 118.0
    assert g.realized_pnl == 120.0
