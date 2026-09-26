"""Test Friend Duels + Weekly Digest endpoints against preview URL.
Uses signed Telegram initData; cleans up test duels + test-user data after run."""
import os
import sys
import pytest
import requests
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_init_data import make_init_data  # noqa

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / '.env')

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else 'https://cube-leaderboard-1.preview.emergentagent.com'
API = f'{BASE_URL}/api'

USER_A = (900000001, 'Alpha', 'alpha_user')
USER_B = (900000002, 'Bravo', 'bravo_user')
USER_C = (900000099, 'Charlie', 'charlie_user')

def hdr(u):
    return {'X-Telegram-Init-Data': make_init_data(u[0], u[1], u[2])}

created_codes = []

# ---------- Regression: public endpoints ----------
@pytest.mark.parametrize('path', ['/', '/leaderboard', '/daily', '/tournament'])
def test_public_endpoints(path):
    r = requests.get(f'{API}{path}', timeout=15)
    assert r.status_code == 200, r.text

# ---------- Duels: create ----------
def test_create_duel_default_size():
    r = requests.post(f'{API}/duels', json={'size': 3}, headers=hdr(USER_A), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d['code']) == 6
    assert d['size'] == 3
    assert d['status'] == 'waiting'
    assert d['my_role'] == 'creator'
    assert d['can_play'] is True
    assert isinstance(d['moves'], str) and len(d['moves']) > 0
    created_codes.append(d['code'])

def test_create_duel_size_validation():
    for bad in [1, 6, 0, 7]:
        r = requests.post(f'{API}/duels', json={'size': bad}, headers=hdr(USER_A), timeout=15)
        assert r.status_code == 422, f'size={bad} -> {r.status_code}'

def test_create_duel_unauthorized():
    r = requests.post(f'{API}/duels', json={'size': 3}, timeout=15)
    assert r.status_code == 401

# ---------- Duels: GET detail ----------
def test_duel_detail_unauth_and_404():
    # need a code
    r = requests.post(f'{API}/duels', json={'size': 2}, headers=hdr(USER_A), timeout=15)
    assert r.status_code == 200
    code = r.json()['code']
    created_codes.append(code)

    # no auth
    r = requests.get(f'{API}/duels/{code}', timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d['my_role'] is None
    assert d['can_play'] is False

    # 404 unknown
    r = requests.get(f'{API}/duels/ZZZZZZ', timeout=15)
    assert r.status_code == 404

# ---------- Duels: join ----------
def test_duel_join_flow():
    r = requests.post(f'{API}/duels', json={'size': 3}, headers=hdr(USER_A), timeout=15)
    code = r.json()['code']
    created_codes.append(code)

    # creator joins own -> idempotent (still waiting, no opponent)
    r = requests.post(f'{API}/duels/{code}/join', headers=hdr(USER_A), timeout=15)
    assert r.status_code == 200
    assert r.json()['status'] == 'waiting'
    assert r.json()['opponent'] is None

    # opponent joins
    r = requests.post(f'{API}/duels/{code}/join', headers=hdr(USER_B), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d['status'] == 'pending'
    assert d['opponent'] is not None
    assert d['opponent']['user_id'] == USER_B[0]

    # third user -> 409
    r = requests.post(f'{API}/duels/{code}/join', headers=hdr(USER_C), timeout=15)
    assert r.status_code == 409

# ---------- Duels: score ----------
def test_duel_score_flow_and_winner():
    r = requests.post(f'{API}/duels', json={'size': 3}, headers=hdr(USER_A), timeout=15)
    code = r.json()['code']
    created_codes.append(code)

    # opponent joins via score endpoint (auto-join)
    # A scores first
    r = requests.post(f'{API}/duels/{code}/score', json={'time_ms': 30000}, headers=hdr(USER_A), timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()['status'] in ('waiting', 'pending')

    # A scores again -> 409
    r = requests.post(f'{API}/duels/{code}/score', json={'time_ms': 25000}, headers=hdr(USER_A), timeout=15)
    assert r.status_code == 409

    # B joins + scores faster
    r = requests.post(f'{API}/duels/{code}/join', headers=hdr(USER_B), timeout=15)
    assert r.status_code == 200
    r = requests.post(f'{API}/duels/{code}/score', json={'time_ms': 20000}, headers=hdr(USER_B), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['status'] == 'finished'
    assert d['winner_id'] == USER_B[0]

    # C tries to score when both slots filled -> 409
    r = requests.post(f'{API}/duels/{code}/score', json={'time_ms': 15000}, headers=hdr(USER_C), timeout=15)
    assert r.status_code == 409

def test_duel_score_validation_low_time():
    r = requests.post(f'{API}/duels', json={'size': 3}, headers=hdr(USER_A), timeout=15)
    code = r.json()['code']
    created_codes.append(code)
    r = requests.post(f'{API}/duels/{code}/score', json={'time_ms': 2999}, headers=hdr(USER_A), timeout=15)
    assert r.status_code == 422

# ---------- Duels: list mine ----------
def test_list_my_duels():
    r = requests.get(f'{API}/duels', headers=hdr(USER_A), timeout=15)
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list)
    assert len(lst) >= 1
    codes = [d['code'] for d in lst]
    # at least one recently-created code should be there
    assert any(c in codes for c in created_codes)
    # newest first
    times = [d['created_at'] for d in lst]
    assert times == sorted(times, reverse=True)

def test_list_my_duels_unauth():
    r = requests.get(f'{API}/duels', timeout=15)
    assert r.status_code == 401

# ---------- Digest ----------
def test_digest_test_unauth():
    r = requests.post(f'{API}/digest/test', timeout=15)
    assert r.status_code == 401

def test_digest_test_returns_409_not_500():
    # Charlie has no solves - or bot cannot message. Either way must be 409 not 500.
    r = requests.post(f'{API}/digest/test', headers=hdr(USER_C), timeout=20)
    assert r.status_code == 409, f'expected 409, got {r.status_code}: {r.text}'
    body = r.json()
    assert 'detail' in body

# ---------- Cleanup ----------
def test_zzz_cleanup():
    """Remove test duels and test-user data from Atlas."""
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    async def _clean():
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        test_uids = [USER_A[0], USER_B[0], USER_C[0]]
        # delete test duels: any duel involving test users
        r1 = await db.duels.delete_many({'$or': [
            {'creator_id': {'$in': test_uids}},
            {'opponent_id': {'$in': test_uids}},
        ]})
        r2 = await db.scores.delete_many({'user_id': {'$in': test_uids}})
        r3 = await db.daily_scores.delete_many({'user_id': {'$in': test_uids}})
        r4 = await db.solves.delete_many({'user_id': {'$in': test_uids}}) if 'solves' in await db.list_collection_names() else None
        r5 = await db.players.delete_many({'user_id': {'$in': test_uids}})
        client.close()
        return r1.deleted_count, r2.deleted_count, r3.deleted_count, (r4.deleted_count if r4 else 0), r5.deleted_count
    counts = asyncio.get_event_loop().run_until_complete(_clean()) if False else asyncio.run(_clean())
    print('cleanup counts (duels, scores, daily, solves, players):', counts)
    assert counts[0] >= 1
