import sys
from pathlib import Path
from types import SimpleNamespace
import asyncio

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server


class FakeAdminPlayers:
    def __init__(self, player):
        self.player = player

    async def find_one(self, query, projection=None):
        if 'user_id' in query and query['user_id'] != self.player['user_id']:
            return None
        request_filter = query.get('withdrawal_requests', {}).get('$elemMatch')
        if request_filter and not any(
            all(item.get(key) == value for key, value in request_filter.items())
            for item in self.player.get('withdrawal_requests', [])
        ):
            return None
        return dict(self.player)

    async def update_one(self, query, update, array_filters=None):
        if query.get('user_id') != self.player['user_id']:
            return SimpleNamespace(matched_count=0, modified_count=0)
        coin_filter = query.get('coins', {}).get('$gte')
        if coin_filter is not None and self.player.get('coins', 0) < coin_filter:
            return SimpleNamespace(matched_count=1, modified_count=0)
        request_filter = query.get('withdrawal_requests', {}).get('$elemMatch')
        if request_filter and not any(
            all(item.get(key) == value for key, value in request_filter.items())
            for item in self.player.get('withdrawal_requests', [])
        ):
            return SimpleNamespace(matched_count=1, modified_count=0)

        for key, value in update.get('$inc', {}).items():
            self.player[key] = self.player.get(key, 0) + value
        self.player.update(update.get('$set', {}))
        for key, value in update.get('$push', {}).items():
            self.player.setdefault(key, []).extend(value.get('$each', [value]))
        if array_filters:
            conditions = array_filters[0]
            for request in self.player.get('withdrawal_requests', []):
                if request.get('request_id') == conditions.get('request.request_id') and request.get('status') == conditions.get('request.status'):
                    for path, value in update.get('$set', {}).items():
                        if path.startswith('withdrawal_requests.$[request].'):
                            request[path.rsplit('.', 1)[-1]] = value
        return SimpleNamespace(matched_count=1, modified_count=1)


def make_admin_player():
    return {
        'user_id': 900000777,
        'username': 'player_test',
        'first_name': 'Player',
        'coins': 500,
        'ton_balance_nano': 12_000_000_000,
        'extra_spins': 1,
        'withdrawal_requests': [{
            'request_id': 'withdrawal-1',
            'coins': 100_000,
            'amount_nano': 10_000_000_000,
            'amount_ton': '10',
            'wallet_address': 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
            'status': 'pending',
            'requested_at': '2026-09-27T00:00:00+00:00',
        }],
    }


def test_admin_routes_are_disabled_without_allowlist(monkeypatch):
    monkeypatch.delenv('ADMIN_TELEGRAM_USER_IDS', raising=False)

    with pytest.raises(HTTPException) as error:
        server.require_admin_user('signed-data')

    assert error.value.status_code == 503


def test_admin_auth_requires_telegram_init_data(monkeypatch):
    monkeypatch.setenv('ADMIN_TELEGRAM_USER_IDS', '12345')

    with pytest.raises(HTTPException) as error:
        server.require_admin_user('')

    assert error.value.status_code == 401


def test_admin_auth_rejects_users_not_in_allowlist(monkeypatch):
    monkeypatch.setenv('ADMIN_TELEGRAM_USER_IDS', '12345')
    monkeypatch.setattr(server, 'verify_init_data', lambda _: server.TgUser(id=54321))

    with pytest.raises(HTTPException) as error:
        server.require_admin_user('signed-data')

    assert error.value.status_code == 403


def test_admin_auth_accepts_allowlisted_telegram_user(monkeypatch):
    monkeypatch.setenv('ADMIN_TELEGRAM_USER_IDS', '12345,67890')
    monkeypatch.setattr(server, 'verify_init_data', lambda _: server.TgUser(id=67890))

    assert server.require_admin_user('signed-data').id == 67890


def test_admin_coin_adjustment_records_audit_and_returns_balance(monkeypatch):
    player = make_admin_player()
    monkeypatch.setattr(server, 'db', SimpleNamespace(players=FakeAdminPlayers(player)))

    result = asyncio.run(server.admin_adjust_player_coins(
        player['user_id'],
        server.AdminAdjustmentIn(delta=1_000_000, reason='Owner reward'),
        server.TgUser(id=12345),
    ))

    assert result.coins == 1_000_500
    assert player['coin_adjustments'][0]['admin_id'] == 12345
    assert player['coin_adjustments'][0]['reason'] == 'Owner reward'


def test_admin_coin_adjustment_cannot_make_balance_negative(monkeypatch):
    player = make_admin_player()
    monkeypatch.setattr(server, 'db', SimpleNamespace(players=FakeAdminPlayers(player)))

    with pytest.raises(HTTPException) as error:
        asyncio.run(server.admin_adjust_player_coins(
            player['user_id'],
            server.AdminAdjustmentIn(delta=-1_000, reason='Correction'),
            server.TgUser(id=12345),
        ))

    assert error.value.status_code == 409
    assert player['coins'] == 500


def test_admin_rejecting_withdrawal_refunds_ton_balance(monkeypatch):
    player = make_admin_player()
    monkeypatch.setattr(server, 'db', SimpleNamespace(players=FakeAdminPlayers(player)))

    result = asyncio.run(server.admin_update_withdrawal(
        'withdrawal-1',
        server.AdminWithdrawalUpdateIn(status='rejected'),
        server.TgUser(id=12345),
    ))

    assert result.status == 'rejected'
    assert player['ton_balance_nano'] == 22_000_000_000
    assert player['withdrawal_requests'][0]['processed_by'] == 12345


def test_admin_cannot_mark_payout_complete_without_transaction_hash(monkeypatch):
    player = make_admin_player()
    monkeypatch.setattr(server, 'db', SimpleNamespace(players=FakeAdminPlayers(player)))

    with pytest.raises(HTTPException) as error:
        asyncio.run(server.admin_update_withdrawal(
            'withdrawal-1',
            server.AdminWithdrawalUpdateIn(status='completed'),
            server.TgUser(id=12345),
        ))

    assert error.value.status_code == 422
    assert player['withdrawal_requests'][0]['status'] == 'pending'