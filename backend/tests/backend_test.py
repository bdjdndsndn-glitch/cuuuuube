"""Backend tests for THE CUBE - Telegram Mini App"""
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
import requests
from dotenv import load_dotenv

# Load backend .env so we can access TELEGRAM_BOT_TOKEN for init_data generation
load_dotenv(Path(__file__).resolve().parent.parent / '.env')

# Ensure make_init_data module is importable
sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_init_data import make_init_data  # noqa: E402

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else None
if not BASE_URL:
    # fall back to frontend/.env
    load_dotenv(Path(__file__).resolve().parents[2] / 'frontend' / '.env')
    BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')

API = f"{BASE_URL}/api"
KYIV = ZoneInfo('Europe/Kyiv')

USER_A = 900000001
USER_B = 900000002


@pytest.fixture(scope='session')
def s():
    return requests.Session()


def hdr(uid, name='TESTUSER', uname='testuser'):
    return {'X-Telegram-Init-Data': make_init_data(uid, name, uname)}


# ---------- Public endpoints ----------
class TestPublic:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert 'THE CUBE' in r.json().get('message', '')

    def test_leaderboard_public(self, s):
        r = s.get(f"{API}/leaderboard", params={'size': 3, 'period': 'all'})
        assert r.status_code == 200
        d = r.json()
        assert d['size'] == 3 and d['period'] == 'all'
        assert isinstance(d['top'], list)
        assert 'total' in d and 'friend_ids' in d

    def test_tournament_public(self, s):
        r = s.get(f"{API}/tournament")
        assert r.status_code == 200
        d = r.json()
        for k in ('week_start', 'week_end', 'seconds_until_end', 'total', 'top'):
            assert k in d

    def test_daily_public(self, s):
        r = s.get(f"{API}/daily")
        assert r.status_code == 200
        d = r.json()
        assert d['size'] == 3
        assert isinstance(d['moves'], str) and len(d['moves']) > 0
        assert 'seconds_until_next' in d and d['seconds_until_next'] > 0
        # Date should be today's Kyiv date
        expected = datetime.now(KYIV).strftime('%Y-%m-%d')
        assert d['date'] == expected


# ---------- Auth enforcement ----------
class TestAuthEnforcement:
    def test_scores_requires_auth(self, s):
        r = s.post(f"{API}/scores", json={'size': 3, 'time_ms': 45000})
        assert r.status_code == 401

    def test_achievements_requires_auth(self, s):
        r = s.get(f"{API}/achievements")
        assert r.status_code == 401

    def test_daily_score_requires_auth(self, s):
        r = s.post(f"{API}/daily/score", json={'date': datetime.now(KYIV).strftime('%Y-%m-%d'), 'time_ms': 45000})
        assert r.status_code == 401

    def test_bad_init_data(self, s):
        r = s.post(f"{API}/scores", json={'size': 3, 'time_ms': 45000},
                   headers={'X-Telegram-Init-Data': 'auth_date=1&user=%7B%22id%22%3A1%7D&hash=deadbeef'})
        assert r.status_code == 401


class TestFortuneWheelStatus:
    def test_wheel_status_exposes_extra_spins(self, s):
        r = s.get(f"{API}/fortune-wheel/status", headers=hdr(USER_A, 'Alpha', 'alpha_tst'))
        assert r.status_code == 200, r.text
        d = r.json()
        assert 'extra_spins' in d
        assert isinstance(d['extra_spins'], int)
        assert 'coins' in d

    def test_admin_reset_endpoint_exists(self, s):
        r = s.post(f"{API}/admin/reset-wheel-spins", headers={'X-Admin-Token': 'test-token'})
        assert r.status_code in (200, 403)


# ---------- Scores ----------
class TestScores:
    def test_submit_score_and_improve(self, s):
        # Initial submit
        r = s.post(f"{API}/scores", json={'size': 3, 'time_ms': 45000}, headers=hdr(USER_A, 'Alpha', 'alpha_tst'))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['is_new_best'] is True
        assert d['best_ms'] == 45000
        assert d['rank'] >= 1

        # Slower time - should NOT be new best
        r2 = s.post(f"{API}/scores", json={'size': 3, 'time_ms': 60000}, headers=hdr(USER_A, 'Alpha', 'alpha_tst'))
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2['is_new_best'] is False
        assert d2['best_ms'] == 45000

        # Faster - new best
        r3 = s.post(f"{API}/scores", json={'size': 3, 'time_ms': 20000}, headers=hdr(USER_A, 'Alpha', 'alpha_tst'))
        assert r3.status_code == 200
        d3 = r3.json()
        assert d3['is_new_best'] is True
        assert d3['best_ms'] == 20000

    def test_second_user_and_leaderboard_ranking(self, s):
        r = s.post(f"{API}/scores", json={'size': 3, 'time_ms': 30000}, headers=hdr(USER_B, 'Bravo', 'bravo_tst'))
        assert r.status_code == 200

        lb = s.get(f"{API}/leaderboard", params={'size': 3, 'period': 'all'}).json()
        # Find our users in the top
        ids = [e['user_id'] for e in lb['top']]
        assert USER_A in ids and USER_B in ids
        # Order: whoever has lower best_ms comes first among test users
        # USER_A best=20000, USER_B=30000 → A before B
        assert ids.index(USER_A) < ids.index(USER_B)
        # Ranks strictly increasing
        ranks = [e['rank'] for e in lb['top']]
        assert ranks == sorted(ranks)

    def test_validation_bounds(self, s):
        h = hdr(USER_A, 'Alpha', 'alpha_tst')
        # time_ms below 3000
        r = s.post(f"{API}/scores", json={'size': 3, 'time_ms': 100}, headers=h)
        assert r.status_code == 422
        # time_ms above 6h
        r = s.post(f"{API}/scores", json={'size': 3, 'time_ms': 6 * 3600 * 1000 + 1}, headers=h)
        assert r.status_code == 422
        # size < 2
        r = s.post(f"{API}/scores", json={'size': 1, 'time_ms': 45000}, headers=h)
        assert r.status_code == 422
        # size > 5
        r = s.post(f"{API}/scores", json={'size': 6, 'time_ms': 45000}, headers=h)
        assert r.status_code == 422


# ---------- Daily challenge ----------
class TestDaily:
    def test_daily_score_flow(self, s):
        today = datetime.now(KYIV).strftime('%Y-%m-%d')
        r = s.post(f"{API}/daily/score", json={'date': today, 'time_ms': 55000},
                   headers=hdr(USER_A, 'Alpha', 'alpha_tst'))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['date'] == today
        # user should be present in top or me
        assert d['me'] is not None
        assert d['me']['time_ms'] == 55000

    def test_daily_score_wrong_date(self, s):
        r = s.post(f"{API}/daily/score", json={'date': '2000-01-01', 'time_ms': 55000},
                   headers=hdr(USER_A, 'Alpha', 'alpha_tst'))
        assert r.status_code == 409


# ---------- Achievements ----------
class TestAchievements:
    def test_achievements_after_score(self, s):
        # USER_A already scored so first_solve should be unlocked
        r = s.get(f"{API}/achievements", headers=hdr(USER_A, 'Alpha', 'alpha_tst'))
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d['items'], list) and len(d['items']) > 0
        unlocked_ids = {a['id'] for a in d['items'] if a.get('unlocked_at')}
        assert 'first_solve' in unlocked_ids


# ---------- Daily Missions ----------
USER_M = 900000099


class TestMissions:
    def test_missions_requires_auth(self, s):
        r = s.get(f"{API}/missions")
        assert r.status_code == 401
        r2 = s.post(f"{API}/missions/connect_wallet/claim", json={})
        assert r2.status_code == 401

    def test_missions_list(self, s):
        r = s.get(f"{API}/missions", headers=hdr(USER_M, 'MissionUser', 'mission_tst'))
        assert r.status_code == 200, r.text
        d = r.json()
        assert 'coins' in d and isinstance(d['coins'], int)
        assert isinstance(d['items'], list) and len(d['items']) == 3
        ids = {m['id'] for m in d['items']}
        assert ids == {'subscribe_channel', 'subscribe_developer', 'connect_wallet'}
        for m in d['items']:
            for k in ('id', 'type', 'title', 'desc', 'reward', 'completed'):
                assert k in m

    def test_claim_wallet_awards_coins(self, s):
        h = hdr(USER_M, 'MissionUser', 'mission_tst')
        # Get initial coins
        initial = s.get(f"{API}/missions", headers=h).json()
        already_done = any(m['id'] == 'connect_wallet' and m['completed'] for m in initial['items'])
        if already_done:
            pytest.skip('Wallet mission already claimed for this user')
        initial_coins = initial['coins']
        # Missing wallet_address → 409
        r_missing = s.post(f"{API}/missions/connect_wallet/claim", json={}, headers=h)
        assert r_missing.status_code == 409
        # Claim with wallet_address
        r = s.post(f"{API}/missions/connect_wallet/claim",
                   json={'wallet_address': 'UQTEST_wallet_addr_' + str(int(time.time()))},
                   headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['coins'] == initial_coins + 150
        wallet_mission = next(m for m in d['items'] if m['id'] == 'connect_wallet')
        assert wallet_mission['completed'] is True
        # Second claim → 409
        r2 = s.post(f"{API}/missions/connect_wallet/claim",
                    json={'wallet_address': 'UQTEST_wallet_addr'}, headers=h)
        assert r2.status_code == 409

    def test_claim_subscribe_channel_not_member(self, s):
        h = hdr(USER_M, 'MissionUser', 'mission_tst')
        # Test user is not subscribed to @MouuRice (or bot lacks access) -> 409
        r = s.post(f"{API}/missions/subscribe_channel/claim", json={}, headers=h)
        assert r.status_code == 409, r.text

    def test_claim_developer_subscription_not_member(self, s):
        h = hdr(USER_M, 'MissionUser', 'mission_tst')
        r = s.post(f"{API}/missions/subscribe_developer/claim", json={}, headers=h)
        assert r.status_code == 409, r.text

    def test_claim_unknown_mission(self, s):
        r = s.post(f"{API}/missions/nonexistent_mission/claim", json={},
                   headers=hdr(USER_M, 'MissionUser', 'mission_tst'))
        assert r.status_code == 404
