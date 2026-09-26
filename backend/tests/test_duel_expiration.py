import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import duel_is_expired


def test_duel_expired_when_waiting_more_than_24_hours():
    created = (datetime.now(timezone.utc) - timedelta(hours=24, minutes=1)).isoformat()
    assert duel_is_expired(created, None) is True


def test_duel_not_expired_before_24_hours():
    created = (datetime.now(timezone.utc) - timedelta(hours=23, minutes=59)).isoformat()
    assert duel_is_expired(created, None) is False


def test_duel_with_opponent_is_never_auto_expired():
    created = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    assert duel_is_expired(created, 123) is False
