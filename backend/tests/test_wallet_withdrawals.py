import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server


VALID_TON_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'


class FakePlayers:
    def __init__(self, player):
        self.player = player

    async def find_one(self, query, projection=None):
        if self.player.get('user_id') != query.get('user_id'):
            return None
        return dict(self.player)

    async def update_one(self, query, update):
        if self.player.get('user_id') != query.get('user_id'):
            return SimpleNamespace(modified_count=0)
        if self.player.get('wallet_address') != query.get('wallet_address'):
            return SimpleNamespace(modified_count=0)
        if 'coins' in query and self.player.get('coins', 0) < query['coins']['$gte']:
            return SimpleNamespace(modified_count=0)
        if 'ton_balance_nano' in query and self.player.get('ton_balance_nano', 0) < query['ton_balance_nano']['$gte']:
            return SimpleNamespace(modified_count=0)
        if any(item.get('status') == 'pending' for item in self.player.get('withdrawal_requests', [])):
            return SimpleNamespace(modified_count=0)

        for field, increment in update['$inc'].items():
            self.player[field] = self.player.get(field, 0) + increment
        for field, value in update.get('$push', {}).items():
            history = self.player.setdefault(field, [])
            if '$each' in value:
                history.extend(value['$each'])
                if '$slice' in value:
                    self.player[field] = history[value['$slice']:]
            else:
                history.append(value)
        return SimpleNamespace(modified_count=1)


def make_player(coins=150_000, ton_balance_nano=0, address=VALID_TON_ADDRESS, withdrawals=None):
    return {
        'user_id': 900000321,
        'coins': coins,
        'ton_balance_nano': ton_balance_nano,
        'wallet_address': address,
        'withdrawal_requests': withdrawals or [],
    }


def test_ton_amount_uses_exact_nano_conversion():
    assert server.format_ton_nano(10_000_000_000) == '10'
    assert server.format_ton_nano(10_000_100_000) == '10.0001'


def test_missions_payload_includes_internal_ton_balance():
    result = server.missions_payload(1_000, set(), 250_000_000)
    assert result.coins == 1_000
    assert result.ton_balance_nano == 250_000_000


def test_exchange_accepts_one_coin_and_withdrawal_requires_ten_ton():
    exchange = server.WalletExchangeIn(coins=1, wallet_address=VALID_TON_ADDRESS)
    assert exchange.coins == 1
    with pytest.raises(ValidationError):
        server.WalletWithdrawalIn(amount_nano=9_999_999_999, wallet_address=VALID_TON_ADDRESS)
    with pytest.raises(ValidationError):
        server.WalletExchangeIn(coins=1, wallet_address='not-a-ton-address')


def test_exchange_can_convert_any_positive_amount_and_credits_internal_ton(monkeypatch):
    player = make_player()
    monkeypatch.setattr(server, 'db', SimpleNamespace(players=FakePlayers(player)))
    body = server.WalletExchangeIn(coins=1_000, wallet_address=VALID_TON_ADDRESS)
    user = server.TgUser(id=player['user_id'])

    result = asyncio.run(server.exchange_wallet_coins(body, user))

    assert result.exchanged_coins == 1_000
    assert result.credited_nano == 100_000_000
    assert result.ton_balance_nano == 100_000_000
    assert result.coins == 149_000
    assert player['coin_exchanges'][0]['coins'] == 1_000


def test_exchange_rejects_unregistered_wallet_without_deducting_coins(monkeypatch):
    player = make_player()
    monkeypatch.setattr(server, 'db', SimpleNamespace(players=FakePlayers(player)))
    other_address = 'UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ'
    body = server.WalletExchangeIn(coins=1_000, wallet_address=other_address)

    with pytest.raises(HTTPException) as error:
        asyncio.run(server.exchange_wallet_coins(body, server.TgUser(id=player['user_id'])))

    assert error.value.status_code == 409
    assert player['coins'] == 150_000
    assert player['ton_balance_nano'] == 0


def test_exchange_rejects_insufficient_coins(monkeypatch):
    player = make_player(coins=500)
    monkeypatch.setattr(server, 'db', SimpleNamespace(players=FakePlayers(player)))
    body = server.WalletExchangeIn(coins=1_000, wallet_address=VALID_TON_ADDRESS)

    with pytest.raises(HTTPException) as error:
        asyncio.run(server.exchange_wallet_coins(body, server.TgUser(id=player['user_id'])))

    assert error.value.status_code == 409
    assert player['coins'] == 500
    assert player['ton_balance_nano'] == 0


def test_create_withdrawal_atomically_reserves_ton_balance(monkeypatch):
    player = make_player(ton_balance_nano=12_000_000_000)
    monkeypatch.setattr(server, 'db', SimpleNamespace(players=FakePlayers(player)))
    body = server.WalletWithdrawalIn(amount_nano=10_000_000_000, wallet_address=VALID_TON_ADDRESS)
    result = asyncio.run(server.create_wallet_withdrawal(body, server.TgUser(id=player['user_id'])))

    assert result.coins == 100_000
    assert result.amount_ton == '10'
    assert result.status == 'pending'
    assert player['coins'] == 150_000
    assert player['ton_balance_nano'] == 2_000_000_000
    assert player['withdrawal_requests'][0]['request_id'] == result.request_id


def test_withdrawal_rejects_unregistered_wallet(monkeypatch):
    player = make_player(ton_balance_nano=12_000_000_000)
    monkeypatch.setattr(server, 'db', SimpleNamespace(players=FakePlayers(player)))
    body = server.WalletWithdrawalIn(amount_nano=10_000_000_000, wallet_address='UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ')

    with pytest.raises(HTTPException) as error:
        asyncio.run(server.create_wallet_withdrawal(body, server.TgUser(id=player['user_id'])))

    assert error.value.status_code == 409
    assert player['ton_balance_nano'] == 12_000_000_000
    assert player['withdrawal_requests'] == []


def test_second_pending_withdrawal_does_not_deduct_ton_again(monkeypatch):
    pending = {
        'request_id': 'existing-request',
        'status': 'pending',
        'coins': 100_000,
        'amount_nano': 10_000_000_000,
        'amount_ton': '10',
        'wallet_address': VALID_TON_ADDRESS,
        'requested_at': '2026-01-01T00:00:00+00:00',
    }
    player = make_player(ton_balance_nano=2_000_000_000, withdrawals=[pending])
    monkeypatch.setattr(server, 'db', SimpleNamespace(players=FakePlayers(player)))
    body = server.WalletWithdrawalIn(amount_nano=10_000_000_000, wallet_address=VALID_TON_ADDRESS)

    with pytest.raises(HTTPException) as error:
        asyncio.run(server.create_wallet_withdrawal(body, server.TgUser(id=player['user_id'])))

    assert error.value.status_code == 409
    assert player['ton_balance_nano'] == 2_000_000_000
    assert len(player['withdrawal_requests']) == 1


def test_user_can_read_only_their_withdrawal_history(monkeypatch):
    pending = {
        'request_id': 'request-1',
        'coins': 100_000,
        'amount_nano': 10_000_000_000,
        'amount_ton': '10',
        'wallet_address': VALID_TON_ADDRESS,
        'status': 'pending',
        'requested_at': '2026-01-01T00:00:00+00:00',
    }
    player = make_player(withdrawals=[pending])
    monkeypatch.setattr(server, 'db', SimpleNamespace(players=FakePlayers(player)))

    result = asyncio.run(server.my_wallet_withdrawals(server.TgUser(id=player['user_id'])))

    assert len(result.withdrawals) == 1
    assert result.withdrawals[0].request_id == 'request-1'