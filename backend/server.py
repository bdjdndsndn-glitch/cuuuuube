from fastapi import FastAPI, APIRouter, Header, HTTPException, Depends, Query
from fastapi.responses import Response
import asyncio
from bson import Binary
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import hmac
import hashlib
import json
import random
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from urllib.parse import parse_qsl
from zoneinfo import ZoneInfo


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import telegram_bot  # noqa: E402

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
BOT_TOKEN = os.environ['TELEGRAM_BOT_TOKEN']

KYIV = ZoneInfo('Europe/Kyiv')
DAILY_SIZE = 3
DAILY_MOVES = 25
INIT_DATA_MAX_AGE = 24 * 3600
MIN_TIME_MS = 3000
MAX_TIME_MS = 6 * 3600 * 1000

app = FastAPI()
api_router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


# ---------- Telegram initData verification ----------
class TgUser(BaseModel):
    id: int
    first_name: str = 'Гравець'
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    is_premium: Optional[bool] = None


def parse_init_data(init_data: str) -> dict:
    return dict(parse_qsl(init_data, keep_blank_values=True))


def verify_init_data(init_data: str) -> TgUser:
    pairs = parse_init_data(init_data)
    received_hash = pairs.pop('hash', None)
    if not received_hash:
        raise HTTPException(status_code=401, detail='initData: hash відсутній')
    data_check = '\n'.join(f'{k}={v}' for k, v in sorted(pairs.items()))
    secret = hmac.new(b'WebAppData', BOT_TOKEN.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, received_hash):
        raise HTTPException(status_code=401, detail='initData: невірний підпис')
    auth_date = int(pairs.get('auth_date', '0'))
    if datetime.now(timezone.utc).timestamp() - auth_date > INIT_DATA_MAX_AGE:
        raise HTTPException(status_code=401, detail='initData: сесія застаріла')
    try:
        return TgUser(**json.loads(pairs['user']))
    except Exception:
        raise HTTPException(status_code=401, detail='initData: користувач відсутній')


async def current_user(x_telegram_init_data: str = Header(default='')) -> TgUser:
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail='Потрібен запуск через Telegram')
    user = verify_init_data(x_telegram_init_data)
    await touch_player(user, parse_init_data(x_telegram_init_data).get('start_param'))
    return user


AVATAR_TTL = 24 * 3600
_avatar_jobs: set = set()


async def touch_player(user: TgUser, start_param: Optional[str] = None) -> None:
    existing = await db.players.find_one({'user_id': user.id}, {'_id': 0, 'invited_by': 1, 'avatar_checked_at': 1})
    update = {'$set': {
        'user_id': user.id,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'username': user.username,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }}
    if start_param and start_param.startswith('ref_') and not (existing or {}).get('invited_by'):
        try:
            inviter = int(start_param[4:])
            if inviter != user.id:
                update['$set']['invited_by'] = inviter
        except ValueError:
            pass
    await db.players.update_one({'user_id': user.id}, update, upsert=True)
    checked = (existing or {}).get('avatar_checked_at', 0)
    if datetime.now(timezone.utc).timestamp() - checked > AVATAR_TTL and user.id not in _avatar_jobs:
        _avatar_jobs.add(user.id)
        asyncio.create_task(refresh_avatar(user.id))


async def refresh_avatar(user_id: int) -> None:
    try:
        photo = await telegram_bot.fetch_profile_photo(user_id)
        update = {'$set': {'avatar_checked_at': datetime.now(timezone.utc).timestamp(), 'has_avatar': photo is not None}}
        if photo:
            update['$set']['avatar'] = Binary(photo)
        await db.players.update_one({'user_id': user_id}, update)
    except Exception as e:
        logger.warning('avatar refresh failed for %s: %s', user_id, e)
    finally:
        _avatar_jobs.discard(user_id)


async def optional_user(x_telegram_init_data: str = Header(default='')) -> Optional[TgUser]:
    if not x_telegram_init_data:
        return None
    try:
        return verify_init_data(x_telegram_init_data)
    except HTTPException:
        return None


# ---------- Models ----------
class ScoreIn(BaseModel):
    size: int = Field(ge=2, le=5)
    time_ms: int = Field(ge=MIN_TIME_MS, le=MAX_TIME_MS)


class DailyScoreIn(BaseModel):
    date: str
    time_ms: int = Field(ge=MIN_TIME_MS, le=MAX_TIME_MS)


class LeaderEntry(BaseModel):
    rank: int
    user_id: int
    name: str
    username: Optional[str] = None
    photo_url: Optional[str] = None
    time_ms: int


class MyRank(BaseModel):
    rank: int
    time_ms: int


class LeaderboardOut(BaseModel):
    size: int
    period: str
    total: int
    top: List[LeaderEntry]
    me: Optional[MyRank] = None
    friend_ids: List[int] = []


class ReminderIn(BaseModel):
    enabled: bool


class TournamentEntry(BaseModel):
    rank: int
    user_id: int
    name: str
    username: Optional[str] = None
    photo_url: Optional[str] = None
    points: int
    days: int
    best_rank: int


class MyTournament(BaseModel):
    rank: int
    points: int
    days: int


class PastWeek(BaseModel):
    week_start: str
    week_end: str
    podium: List[TournamentEntry]


class TournamentOut(BaseModel):
    week_start: str
    week_end: str
    seconds_until_end: int
    total: int
    top: List[TournamentEntry]
    me: Optional[MyTournament] = None
    last_week: Optional[PastWeek] = None
    friend_ids: List[int] = []


class Achievement(BaseModel):
    id: str
    title: str
    desc: str
    unlocked_at: Optional[str] = None


class AchievementsOut(BaseModel):
    items: List[Achievement]
    newly_unlocked: List[str]


class ScoreOut(BaseModel):
    best_ms: int
    rank: int
    is_new_best: bool


class FortuneWheelOut(BaseModel):
    prize: str
    coins_awarded: int
    ton_awarded: Optional[str] = None
    coins: int
    extra_spins: int = 0
    seconds_until_next: int


class RewardSpinIn(BaseModel):
    telegram_id: Optional[int] = None
    reward_type: str = 'extra_spin'


class RewardSpinOut(BaseModel):
    ok: bool
    extra_spins: int
    coins: int = 0
    coins_awarded: int = 0
    reward_type: str = 'extra_spin'


class DailyOut(BaseModel):
    date: str
    size: int
    moves: str
    total: int
    top: List[LeaderEntry]
    me: Optional[MyRank] = None
    seconds_until_next: int
    reminder_enabled: bool = False
    friend_ids: List[int] = []


# ---------- Helpers ----------
def kyiv_today() -> str:
    return datetime.now(KYIV).strftime('%Y-%m-%d')


def seconds_until_next_day() -> int:
    now = datetime.now(KYIV)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return int((tomorrow - now).total_seconds())


def fmt_ms(ms: int) -> str:
    return f'{ms // 60000}:{(ms // 1000) % 60:02d}'


def generate_scramble(seed: Optional[str], length: int = DAILY_MOVES, faces: str = 'UDLRFB') -> str:
    rng = random.Random(seed)
    mods, moves = ['', "'", '2'], []
    while len(moves) < length:
        m = rng.choice(faces) + rng.choice(mods)
        if moves and m[0] == moves[-1][0]:
            continue
        if len(moves) > 1 and m[0] == moves[-2][0]:
            continue
        moves.append(m)
    return ' '.join(moves)


async def players_map(user_ids: List[int]) -> dict:
    docs = await db.players.find({'user_id': {'$in': user_ids}}, {'_id': 0, 'avatar': 0}).to_list(len(user_ids) or 1)
    return {d['user_id']: d for d in docs}


def week_start_iso() -> str:
    now = datetime.now(KYIV)
    monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return monday.astimezone(timezone.utc).isoformat()


async def friend_ids_of(user: Optional[TgUser]) -> List[int]:
    if not user:
        return []
    docs = await db.players.find({'invited_by': user.id}, {'_id': 0, 'user_id': 1}).to_list(1000)
    return [d['user_id'] for d in docs]


def display_name(p: Optional[dict], fallback_id: int) -> str:
    if not p:
        return f'Гравець {str(fallback_id)[-4:]}'
    return ' '.join(x for x in [p.get('first_name'), p.get('last_name')] if x) or 'Гравець'


async def build_entries(docs: List[dict], time_key: str) -> List[LeaderEntry]:
    players = await players_map([d['user_id'] for d in docs])
    out = []
    for i, d in enumerate(docs, start=1):
        p = players.get(d['user_id'])
        out.append(LeaderEntry(
            rank=i,
            user_id=d['user_id'],
            name=display_name(p, d['user_id']),
            username=(p or {}).get('username'),
            photo_url=f"/api/avatar/{d['user_id']}" if (p or {}).get('has_avatar') else None,
            time_ms=d[time_key],
        ))
    return out


async def rank_of(collection, query: dict, time_key: str, time_ms: int) -> int:
    return await collection.count_documents({**query, time_key: {'$lt': time_ms}}) + 1


# ---------- Tournament ----------
RANK_POINTS = [100, 80, 65, 55, 50]
STREAK_BONUS = 5


def points_for_rank(rank: int) -> int:
    if rank <= 5:
        return RANK_POINTS[rank - 1]
    if rank <= 10:
        return 40
    if rank <= 20:
        return 30
    return 10


def week_bounds(offset_weeks: int = 0):
    today = datetime.now(KYIV).date()
    monday = today - timedelta(days=today.weekday()) - timedelta(weeks=offset_weeks)
    return monday, monday + timedelta(days=6)


def seconds_until_week_end() -> int:
    now = datetime.now(KYIV)
    _, sunday = week_bounds()
    end = datetime.combine(sunday + timedelta(days=1), datetime.min.time(), tzinfo=KYIV)
    return max(0, int((end - now).total_seconds()))


async def tournament_standings(monday, sunday) -> List[dict]:
    dates = [(monday + timedelta(days=i)).isoformat() for i in range(7)]
    docs = await db.daily_results.find({'date': {'$in': dates}}, {'_id': 0}).sort('time_ms', 1).to_list(100000)
    by_date: dict = {}
    for d in docs:
        by_date.setdefault(d['date'], []).append(d['user_id'])
    stats: dict = {}
    streak: dict = {}
    for date in dates:
        players_today = by_date.get(date, [])
        for uid in list(streak):
            if uid not in players_today:
                streak[uid] = 0
        for rank, uid in enumerate(players_today, start=1):
            streak[uid] = streak.get(uid, 0) + 1
            st = stats.setdefault(uid, {'user_id': uid, 'points': 0, 'days': 0, 'best_rank': rank})
            st['points'] += points_for_rank(rank) + STREAK_BONUS * (streak[uid] - 1)
            st['days'] += 1
            st['best_rank'] = min(st['best_rank'], rank)
    return sorted(stats.values(), key=lambda x: (-x['points'], x['best_rank'], -x['days']))


async def tournament_entries(rows: List[dict]) -> List[TournamentEntry]:
    players = await players_map([r['user_id'] for r in rows])
    out = []
    for i, r in enumerate(rows, start=1):
        p = players.get(r['user_id'])
        out.append(TournamentEntry(
            rank=i, user_id=r['user_id'], name=display_name(p, r['user_id']),
            username=(p or {}).get('username'),
            photo_url=f"/api/avatar/{r['user_id']}" if (p or {}).get('has_avatar') else None,
            points=r['points'], days=r['days'], best_rank=r['best_rank'],
        ))
    return out


# ---------- Achievements ----------
ACHIEVEMENTS = [
    ('first_solve', 'Перша збірка', 'Зібрати кубик уперше'),
    ('solves_10', 'Розігрів', '10 зібраних кубиків'),
    ('solves_100', 'Сотня', '100 зібраних кубиків'),
    ('sub_60', 'Швидше хвилини', '3x3 швидше за 1:00'),
    ('sub_30', 'Блискавка', '3x3 швидше за 0:30'),
    ('all_sizes', 'Колекціонер', 'Зібрати 2x2, 3x3, 4x4 і 5x5'),
    ('daily_first', 'Виклик прийнято', 'Перший виклик дня'),
    ('streak_7', 'Тиждень поспіль', '7 днів виклику підряд'),
    ('daily_win', 'Найшвидший дня', '1-е місце у виклику дня'),
    ('top3_week', 'П\'єдестал тижня', 'Топ-3 тижневого турніру'),
    ('inviter', 'Амбасадор', 'Запросити друга у гру'),
    ('duel_streak_3', 'Дуелянт', '3 перемоги в дуелях поспіль'),
    ('duel_streak_5', 'Гладіатор', '5 перемог у дуелях поспіль'),
    ('duel_streak_10', 'Непереможний', '10 перемог у дуелях поспіль'),
]
DUEL_STREAK_ACHIEVEMENTS = {3: 'duel_streak_3', 5: 'duel_streak_5', 10: 'duel_streak_10'}


async def compute_unlocked(user_id: int) -> set:
    unlocked = set()
    solves = await db.solves.count_documents({'user_id': user_id})
    if solves >= 1:
        unlocked.add('first_solve')
    if solves >= 10:
        unlocked.add('solves_10')
    if solves >= 100:
        unlocked.add('solves_100')
    best3 = await db.scores.find_one({'user_id': user_id, 'size': 3}, {'_id': 0})
    if best3 and best3['best_ms'] < 60000:
        unlocked.add('sub_60')
    if best3 and best3['best_ms'] < 30000:
        unlocked.add('sub_30')
    sizes = await db.scores.distinct('size', {'user_id': user_id})
    if {2, 3, 4, 5} <= set(sizes):
        unlocked.add('all_sizes')
    dailies = await db.daily_results.find({'user_id': user_id}, {'_id': 0, 'date': 1, 'time_ms': 1}).sort('date', 1).to_list(10000)
    if dailies:
        unlocked.add('daily_first')
        dates = [datetime.fromisoformat(d['date']).date() for d in dailies]
        run = 1
        for a, b in zip(dates, dates[1:]):
            run = run + 1 if (b - a).days == 1 else 1
            if run >= 7:
                unlocked.add('streak_7')
        for d in dailies[-14:]:
            faster = await db.daily_results.count_documents({'date': d['date'], 'time_ms': {'$lt': d['time_ms']}})
            if faster == 0 and await db.daily_results.count_documents({'date': d['date']}) > 1:
                unlocked.add('daily_win')
                break
    for w in range(1, 9):
        monday, sunday = week_bounds(w)
        rows = await tournament_standings(monday, sunday)
        if any(r['user_id'] == user_id for r in rows[:3]) and len(rows) >= 3:
            unlocked.add('top3_week')
            break
    if await db.players.count_documents({'invited_by': user_id}) > 0:
        unlocked.add('inviter')
    p = await db.players.find_one({'user_id': user_id}, {'_id': 0, 'duel_best_streak': 1}) or {}
    best_streak = int(p.get('duel_best_streak', 0))
    unlocked.update(a for n, a in DUEL_STREAK_ACHIEVEMENTS.items() if best_streak >= n)
    return unlocked


async def achievements_for(user_id: int) -> AchievementsOut:
    unlocked = await compute_unlocked(user_id)
    saved = {d['id']: d['unlocked_at'] for d in await db.achievements.find({'user_id': user_id}, {'_id': 0}).to_list(100)}
    now = datetime.now(timezone.utc).isoformat()
    new = [a for a in unlocked if a not in saved]
    for a in new:
        await db.achievements.update_one({'user_id': user_id, 'id': a}, {'$setOnInsert': {'user_id': user_id, 'id': a, 'unlocked_at': now}}, upsert=True)
        saved[a] = now
    items = [Achievement(id=i, title=t, desc=d, unlocked_at=saved.get(i)) for i, t, d in ACHIEVEMENTS]
    return AchievementsOut(items=items, newly_unlocked=new)


# ---------- Routes ----------
@api_router.get('/')
async def root():
    return {'message': 'THE CUBE API'}


@api_router.post('/scores', response_model=ScoreOut)
async def submit_score(body: ScoreIn, user: TgUser = Depends(current_user)):
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.scores.find_one({'user_id': user.id, 'size': body.size}, {'_id': 0})
    is_new_best = existing is None or body.time_ms < existing['best_ms']
    update = {'$inc': {'solves': 1}, '$set': {'updated_at': now}}
    if is_new_best:
        update['$set']['best_ms'] = body.time_ms
    await db.scores.update_one({'user_id': user.id, 'size': body.size}, update, upsert=True)
    await db.solves.insert_one({'user_id': user.id, 'size': body.size, 'time_ms': body.time_ms, 'created_at': now})
    best = body.time_ms if is_new_best else existing['best_ms']
    rank = await rank_of(db.scores, {'size': body.size}, 'best_ms', best)
    return ScoreOut(best_ms=best, rank=rank, is_new_best=is_new_best)


def week_window_utc(monday) -> tuple:
    start = datetime.combine(monday, datetime.min.time(), tzinfo=KYIV)
    return start.astimezone(timezone.utc).isoformat(), (start + timedelta(days=7)).astimezone(timezone.utc).isoformat()


async def weekly_bests(size: int, start: Optional[str] = None, end: Optional[str] = None) -> List[dict]:
    created = {'$gte': start or week_start_iso()}
    if end:
        created['$lt'] = end
    pipeline = [
        {'$match': {'size': size, 'created_at': created}},
        {'$group': {'_id': '$user_id', 'best_ms': {'$min': '$time_ms'}}},
        {'$sort': {'best_ms': 1}},
        {'$project': {'_id': 0, 'user_id': '$_id', 'best_ms': 1}},
    ]
    return await db.solves.aggregate(pipeline).to_list(10000)


@api_router.get('/leaderboard', response_model=LeaderboardOut)
async def leaderboard(
    size: int = Query(3, ge=2, le=5),
    period: str = Query('all', pattern='^(all|week)$'),
    user: Optional[TgUser] = Depends(optional_user),
):
    if period == 'week':
        all_docs = await weekly_bests(size)
        docs, total = all_docs[:50], len(all_docs)
        me = None
        if user:
            mine = next((d for d in all_docs if d['user_id'] == user.id), None)
            if mine:
                me = MyRank(rank=sum(1 for d in all_docs if d['best_ms'] < mine['best_ms']) + 1, time_ms=mine['best_ms'])
    else:
        docs = await db.scores.find({'size': size}, {'_id': 0}).sort('best_ms', 1).limit(50).to_list(50)
        total = await db.scores.count_documents({'size': size})
        me = None
        if user:
            mine = await db.scores.find_one({'user_id': user.id, 'size': size}, {'_id': 0})
            if mine:
                me = MyRank(rank=await rank_of(db.scores, {'size': size}, 'best_ms', mine['best_ms']), time_ms=mine['best_ms'])
    return LeaderboardOut(
        size=size, period=period, total=total, top=await build_entries(docs, 'best_ms'), me=me,
        friend_ids=await friend_ids_of(user),
    )


@api_router.get('/tournament', response_model=TournamentOut)
async def tournament(user: Optional[TgUser] = Depends(optional_user)):
    monday, sunday = week_bounds()
    rows = await tournament_standings(monday, sunday)
    me = None
    if user:
        for i, r in enumerate(rows, start=1):
            if r['user_id'] == user.id:
                me = MyTournament(rank=i, points=r['points'], days=r['days'])
                break
    pm, ps = week_bounds(1)
    past_rows = await tournament_standings(pm, ps)
    last_week = PastWeek(week_start=pm.isoformat(), week_end=ps.isoformat(), podium=await tournament_entries(past_rows[:3])) if past_rows else None
    return TournamentOut(
        week_start=monday.isoformat(), week_end=sunday.isoformat(), seconds_until_end=seconds_until_week_end(),
        total=len(rows), top=await tournament_entries(rows[:50]), me=me, last_week=last_week,
        friend_ids=await friend_ids_of(user),
    )


@api_router.get('/achievements', response_model=AchievementsOut)
async def achievements(user: TgUser = Depends(current_user)):
    return await achievements_for(user.id)


@api_router.get('/avatar/{user_id}')
async def avatar(user_id: int):
    p = await db.players.find_one({'user_id': user_id}, {'_id': 0, 'avatar': 1})
    if not p or not p.get('avatar'):
        raise HTTPException(status_code=404, detail='Аватар відсутній')
    return Response(bytes(p['avatar']), media_type='image/jpeg', headers={'Cache-Control': 'public, max-age=86400'})


async def get_or_create_daily(date: str) -> dict:
    doc = await db.daily_challenges.find_one({'date': date}, {'_id': 0})
    if doc:
        return doc
    doc = {'date': date, 'size': DAILY_SIZE, 'moves': generate_scramble(f'thecube-daily-{date}')}
    await db.daily_challenges.update_one({'date': date}, {'$setOnInsert': doc}, upsert=True)
    return doc


async def daily_out(date: str, user: Optional[TgUser]) -> DailyOut:
    ch = await get_or_create_daily(date)
    docs = await db.daily_results.find({'date': date}, {'_id': 0}).sort('time_ms', 1).limit(10).to_list(10)
    total = await db.daily_results.count_documents({'date': date})
    me = None
    if user:
        mine = await db.daily_results.find_one({'date': date, 'user_id': user.id}, {'_id': 0})
        if mine:
            me = MyRank(rank=await rank_of(db.daily_results, {'date': date}, 'time_ms', mine['time_ms']), time_ms=mine['time_ms'])
    reminder = False
    if user:
        p = await db.players.find_one({'user_id': user.id}, {'_id': 0, 'reminder_enabled': 1})
        reminder = bool((p or {}).get('reminder_enabled'))
    return DailyOut(
        date=date, size=ch['size'], moves=ch['moves'], total=total,
        top=await build_entries(docs, 'time_ms'), me=me,
        seconds_until_next=seconds_until_next_day(),
        reminder_enabled=reminder, friend_ids=await friend_ids_of(user),
    )


@api_router.post('/daily/reminder', response_model=DailyOut)
async def set_reminder(body: ReminderIn, user: TgUser = Depends(current_user)):
    await db.players.update_one({'user_id': user.id}, {'$set': {'reminder_enabled': body.enabled}})
    return await daily_out(kyiv_today(), user)


async def leader_text(date: str) -> str:
    top = await db.daily_results.find({'date': date}, {'_id': 0}).sort('time_ms', 1).limit(1).to_list(1)
    if not top:
        return 'Поки ніхто не зібрав — будьте першим!'
    p = await db.players.find_one({'user_id': top[0]['user_id']}, {'_id': 0, 'avatar': 0})
    ms = top[0]['time_ms']
    return f"Лідер дня: {display_name(p, top[0]['user_id'])} — {ms // 60000}:{(ms // 1000) % 60:02d}."


@api_router.post('/daily/reminder/test')
async def send_reminder_now(user: TgUser = Depends(current_user)):
    today = kyiv_today()
    try:
        await telegram_bot.send_daily_reminder(user.id, today, await leader_text(today))
    except telegram_bot.BotError as e:
        if e.code in (400, 403):
            raise HTTPException(status_code=409, detail='Бот не може написати вам. Відкрийте @the_cube_game_bot і натисніть Start')
        raise HTTPException(status_code=502, detail=f'Telegram: {e.description}')
    return {'sent': True}


async def broadcast_daily_reminders() -> int:
    today = kyiv_today()
    text = await leader_text(today)
    players = await db.players.find(
        {'reminder_enabled': True, 'last_reminder_date': {'$ne': today}}, {'_id': 0, 'user_id': 1}
    ).to_list(100000)
    sent = 0
    for p in players:
        try:
            await telegram_bot.send_daily_reminder(p['user_id'], today, text)
            sent += 1
        except telegram_bot.BotError as e:
            if e.code == 403:
                await db.players.update_one({'user_id': p['user_id']}, {'$set': {'reminder_enabled': False}})
            logger.warning('reminder to %s failed: %s', p['user_id'], e.description)
        except Exception as e:
            logger.warning('reminder to %s failed: %s', p['user_id'], e)
        await db.players.update_one({'user_id': p['user_id']}, {'$set': {'last_reminder_date': today}})
        await asyncio.sleep(0.05)
    return sent


REMINDER_HOUR = 9


async def broadcast_tournament_summary() -> int:
    monday, sunday = week_bounds(1)
    rows = await tournament_standings(monday, sunday)
    if not rows:
        return 0
    podium = await tournament_entries(rows[:3])
    medals = ['🥇', '🥈', '🥉']
    podium_text = '\n'.join(f'{medals[i]} {e.name} — {e.points} очок' for i, e in enumerate(podium))
    players = await db.players.find({'reminder_enabled': True}, {'_id': 0, 'user_id': 1}).to_list(100000)
    sent = 0
    for p in players:
        mine = next(((i, r) for i, r in enumerate(rows, start=1) if r['user_id'] == p['user_id']), None)
        if not mine:
            continue
        text = (
            f'🏆 <b>Підсумки тижневого турніру ({monday.isoformat()} — {sunday.isoformat()})</b>\n\n'
            f'{podium_text}\n\n'
            f'Ваш результат: <b>{mine[0]}-е місце</b>, {mine[1]["points"]} очок за {mine[1]["days"]} дн.\n'
            'Новий турнір уже розпочався — вперед!'
        )
        try:
            await telegram_bot.call('sendMessage', chat_id=p['user_id'], text=text, parse_mode='HTML',
                                    reply_markup={'inline_keyboard': [[{'text': '🏆 До турніру', 'url': telegram_bot.APP_URL}]]})
            sent += 1
        except Exception as e:
            logger.warning('summary to %s failed: %s', p['user_id'], e)
        await asyncio.sleep(0.05)
    return sent


async def weekly_digest_text(user_id: int, monday, sunday) -> Optional[str]:
    start, end = week_window_utc(monday)
    solves = await db.solves.find({'user_id': user_id, 'created_at': {'$gte': start, '$lt': end}}, {'_id': 0}).to_list(100000)
    if not solves:
        return None
    lines = []
    for size in sorted({s['size'] for s in solves}):
        mine = [s['time_ms'] for s in solves if s['size'] == size]
        best = min(mine)
        rows = await weekly_bests(size, start, end)
        rank = sum(1 for r in rows if r['best_ms'] < best) + 1
        lines.append(f'• {size}x{size}: {len(mine)} розв\'язань, найкращий <b>{fmt_ms(best)}</b> — #{rank} із {len(rows)}')
    dates = [(monday + timedelta(days=i)).isoformat() for i in range(7)]
    dailies = await db.daily_results.count_documents({'user_id': user_id, 'date': {'$in': dates}})
    rows = await tournament_standings(monday, sunday)
    mine = next(((i, r) for i, r in enumerate(rows, start=1) if r['user_id'] == user_id), None)
    extra = f'\n⚡ Виклик дня: {dailies} із 7 днів' if dailies else ''
    if mine:
        extra += f'\n🏆 Турнір тижня: <b>{mine[0]}-е місце</b>, {mine[1]["points"]} очок'
    return (
        f'📊 <b>Ваш тиждень у THE CUBE ({monday.isoformat()} — {sunday.isoformat()})</b>\n\n'
        f'Усього розв\'язань: <b>{len(solves)}</b>\n' + '\n'.join(lines) + extra +
        '\n\nНовий тиждень — новий шанс піднятися в рейтингу!'
    )


async def send_digest(user_id: int, text: str) -> None:
    await telegram_bot.call('sendMessage', chat_id=user_id, text=text, parse_mode='HTML',
                            reply_markup={'inline_keyboard': [[{'text': '🧩 Грати', 'url': telegram_bot.APP_URL}]]})


async def broadcast_weekly_digest() -> int:
    monday, sunday = week_bounds(1)
    start, end = week_window_utc(monday)
    user_ids = await db.solves.distinct('user_id', {'created_at': {'$gte': start, '$lt': end}})
    sent = 0
    for uid in user_ids:
        p = await db.players.find_one({'user_id': uid}, {'_id': 0, 'last_digest_week': 1})
        if (p or {}).get('last_digest_week') == monday.isoformat():
            continue
        text = await weekly_digest_text(uid, monday, sunday)
        if not text:
            continue
        try:
            await send_digest(uid, text)
            sent += 1
        except Exception as e:
            logger.warning('digest to %s failed: %s', uid, e)
        await db.players.update_one({'user_id': uid}, {'$set': {'last_digest_week': monday.isoformat()}})
        await asyncio.sleep(0.05)
    return sent


@api_router.post('/digest/test')
async def send_digest_now(user: TgUser = Depends(current_user)):
    text = await weekly_digest_text(user.id, *week_bounds(1)) or await weekly_digest_text(user.id, *week_bounds(0))
    if not text:
        raise HTTPException(status_code=409, detail='Немає розв\'язань за цей тиждень — зберіть кубик і спробуйте ще раз')
    try:
        await send_digest(user.id, text)
    except telegram_bot.BotError as e:
        if e.code in (400, 403):
            raise HTTPException(status_code=409, detail='Бот не може написати вам. Відкрийте @the_cube_game_bot і натисніть Start')
        raise HTTPException(status_code=502, detail=f'Telegram: {e.description}')
    return {'sent': True}


async def reminder_scheduler() -> None:
    while True:
        now = datetime.now(KYIV)
        target = now.replace(hour=REMINDER_HOUR, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        await asyncio.sleep((target - now).total_seconds())
        try:
            sent = await broadcast_daily_reminders()
            logger.info('daily reminders sent: %s', sent)
            if datetime.now(KYIV).weekday() == 0:
                logger.info('tournament summaries sent: %s', await broadcast_tournament_summary())
                logger.info('weekly digests sent: %s', await broadcast_weekly_digest())
        except Exception as e:
            logger.error('reminder broadcast failed: %s', e)


async def duel_cleanup_scheduler() -> None:
    while True:
        try:
            await prune_expired_duels()
        except Exception as e:
            logger.warning('duel cleanup failed: %s', e)
        await asyncio.sleep(60 * 60)


@api_router.get('/daily', response_model=DailyOut)
async def daily(user: Optional[TgUser] = Depends(optional_user)):
    return await daily_out(kyiv_today(), user)


@api_router.post('/daily/score', response_model=DailyOut)
async def daily_score(body: DailyScoreIn, user: TgUser = Depends(current_user)):
    today = kyiv_today()
    if body.date != today:
        raise HTTPException(status_code=409, detail='Виклик дня вже змінився — спробуйте новий')
    existing = await db.daily_results.find_one({'date': today, 'user_id': user.id}, {'_id': 0})
    if existing is None or body.time_ms < existing['time_ms']:
        await db.daily_results.update_one(
            {'date': today, 'user_id': user.id},
            {'$set': {'time_ms': body.time_ms, 'created_at': datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    return await daily_out(today, user)


# ---------- Daily Missions ----------
# Бот @the_cube_game_bot має бути АДМІНІСТРАТОРОМ каналу @the_cube_a_game, інакше getChatMember не працює.
MISSIONS = [
    {'id': 'subscribe_channel', 'type': 'subscribe', 'title': 'Підписатись на канал',
     'desc': 'Підпишіться на офіційний канал THE CUBE — новини, оновлення та турніри.',
     'reward': 100, 'target': '@the_cube_a_game', 'link': 'https://t.me/the_cube_a_game'},
    {'id': 'subscribe_developer', 'type': 'group_comment', 'title': 'Написати коментар "Я у грі"',
     'desc': 'Напишіть у групі THE CUBE коментар "Я у грі" і поверніться в гру, щоб отримати нагороду.',
     'reward': 100, 'target': '@thecubeagame', 'link': 'https://t.me/thecubeagame', 'required_text': 'я у грі'},
    {'id': 'connect_wallet', 'type': 'wallet', 'title': 'Підключити TON-гаманець',
     'desc': 'Підключіть Tonkeeper — знадобиться для майбутнього виводу монет на TON.',
     'reward': 150, 'target': None, 'link': None},
]
MISSIONS_BY_ID = {m['id']: m for m in MISSIONS}
SUBSCRIBED_STATUSES = {'member', 'administrator', 'creator', 'restricted'}


class MissionOut(BaseModel):
    id: str
    type: str
    title: str
    desc: str
    reward: int
    link: Optional[str] = None
    completed: bool = False


class MissionsOut(BaseModel):
    coins: int
    items: List[MissionOut]


class ClaimIn(BaseModel):
    wallet_address: Optional[str] = None
    comment_text: Optional[str] = None


def missions_payload(coins: int, done: set) -> MissionsOut:
    items = [MissionOut(id=m['id'], type=m['type'], title=m['title'], desc=m['desc'],
                        reward=m['reward'], link=m.get('link'), completed=m['id'] in done)
             for m in MISSIONS]
    return MissionsOut(coins=coins, items=items)


@api_router.get('/missions', response_model=MissionsOut)
async def get_missions(user: TgUser = Depends(current_user)):
    p = await db.players.find_one({'user_id': user.id}, {'_id': 0, 'coins': 1, 'completed_missions': 1}) or {}
    return missions_payload(int(p.get('coins', 0)), set(p.get('completed_missions', [])))


@api_router.post('/missions/{mission_id}/claim', response_model=MissionsOut)
async def claim_mission(mission_id: str, body: ClaimIn, user: TgUser = Depends(current_user)):
    m = MISSIONS_BY_ID.get(mission_id)
    if not m:
        raise HTTPException(status_code=404, detail='Місію не знайдено')
    p = await db.players.find_one({'user_id': user.id}, {'_id': 0, 'completed_missions': 1}) or {}
    if mission_id in set(p.get('completed_missions', [])):
        raise HTTPException(status_code=409, detail='Місію вже виконано')

    if m['type'] == 'subscribe':
        try:
            res = await telegram_bot.call('getChatMember', chat_id=m['target'], user_id=user.id)
        except telegram_bot.BotError as e:
            if e.code == 400 and 'member not found' in e.description:
                raise HTTPException(status_code=409, detail='Ви ще не підписані. Підпишіться і натисніть «Перевірити».')
            raise HTTPException(status_code=409, detail='Не вдалося перевірити підписку. Підпишіться на канал і спробуйте ще раз.')
        if (res or {}).get('status') not in SUBSCRIBED_STATUSES:
            raise HTTPException(status_code=409, detail='Ви ще не підписані. Підпишіться і натисніть «Перевірити».')
    elif m['type'] == 'group_comment':
        required = (m.get('required_text') or 'я у грі').strip().lower()
        provided = (body.comment_text or '').strip().lower()
        try:
            res = await telegram_bot.call('getChatMember', chat_id=m['target'], user_id=user.id)
        except telegram_bot.BotError as e:
            if e.code == 400 and 'member not found' in e.description:
                raise HTTPException(status_code=409, detail='Спочатку підпишіться на групу і напишіть коментар "Я у грі".')
            raise HTTPException(status_code=409, detail='Не вдалося перевірити участь у групі. Підпишіться і спробуйте ще раз.')
        if (res or {}).get('status') not in SUBSCRIBED_STATUSES:
            raise HTTPException(status_code=409, detail='Спочатку підпишіться на групу і напишіть коментар "Я у грі".')
        if provided and provided != required:
            raise HTTPException(status_code=409, detail='У коментарі має бути текст "Я у грі".')
        if not provided:
            raise HTTPException(status_code=409, detail='Напишіть у групі коментар "Я у грі" і поверніться в гру.')
    elif m['type'] == 'wallet':
        if not body.wallet_address:
            raise HTTPException(status_code=409, detail='Спочатку підключіть TON-гаманець')
        await db.players.update_one({'user_id': user.id}, {'$set': {'wallet_address': body.wallet_address}})

    result = await db.players.update_one(
        {'user_id': user.id, 'completed_missions': {'$ne': mission_id}},
        {'$inc': {'coins': m['reward']}, '$addToSet': {'completed_missions': mission_id}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail='Місію вже виконано')
    p2 = await db.players.find_one({'user_id': user.id}, {'_id': 0, 'coins': 1, 'completed_missions': 1}) or {}
    return missions_payload(int(p2.get('coins', 0)), set(p2.get('completed_missions', [])))


# ---------- Friend Duels ----------
DUEL_SCRAMBLE_LEN = {2: 9, 3: 25, 4: 40, 5: 60}
DUEL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
DUEL_WIN_COINS = 30
DUEL_DRAW_COINS = 10


class DuelCreateIn(BaseModel):
    size: int = Field(3, ge=2, le=5)


class DuelScoreIn(BaseModel):
    time_ms: int = Field(ge=MIN_TIME_MS, le=MAX_TIME_MS)


class DuelPlayer(BaseModel):
    user_id: int
    name: str
    username: Optional[str] = None
    photo_url: Optional[str] = None
    time_ms: Optional[int] = None


class DuelOut(BaseModel):
    code: str
    size: int
    moves: str
    status: str
    creator: DuelPlayer
    opponent: Optional[DuelPlayer] = None
    winner_id: Optional[int] = None
    my_role: Optional[str] = None
    can_play: bool = False
    created_at: str
    reward_coins: int = 0
    my_streak: int = 0


class DuelStatsOut(BaseModel):
    streak: int
    best_streak: int
    wins: int
    losses: int
    draws: int
    coins: int
    win_reward: int = DUEL_WIN_COINS
    draw_reward: int = DUEL_DRAW_COINS


DUEL_WAIT_TIMEOUT = timedelta(hours=24)


def duel_is_expired(created_at: Optional[str], opponent_id: Optional[int]) -> bool:
    if opponent_id is not None or not created_at:
        return False
    try:
        created = datetime.fromisoformat(created_at)
    except (TypeError, ValueError):
        return False
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - created > DUEL_WAIT_TIMEOUT


async def prune_expired_duels() -> None:
    docs = await db.duels.find({'opponent_id': None}, {'_id': 0, 'code': 1, 'created_at': 1}).sort('created_at', 1).to_list(500)
    for d in docs:
        if duel_is_expired(d.get('created_at'), d.get('opponent_id')):
            await db.duels.delete_one({'code': d['code']})


def duel_player(uid: int, p: Optional[dict], time_ms: Optional[int]) -> DuelPlayer:
    return DuelPlayer(user_id=uid, name=display_name(p, uid), username=(p or {}).get('username'),
                      photo_url=f'/api/avatar/{uid}' if (p or {}).get('has_avatar') else None, time_ms=time_ms)


async def duel_out(d: dict, user: Optional[TgUser]) -> DuelOut:
    results = d.get('results', {})
    ids = [d['creator_id']] + ([d['opponent_id']] if d.get('opponent_id') else [])
    players = await players_map(ids)
    creator = duel_player(d['creator_id'], players.get(d['creator_id']), results.get(str(d['creator_id'])))
    opponent = duel_player(d['opponent_id'], players.get(d['opponent_id']), results.get(str(d['opponent_id']))) if d.get('opponent_id') else None
    winner_id = None
    if opponent and creator.time_ms is not None and opponent.time_ms is not None:
        status = 'finished'
        if creator.time_ms != opponent.time_ms:
            winner_id = creator.user_id if creator.time_ms < opponent.time_ms else opponent.user_id
    else:
        status = 'pending' if opponent else 'waiting'
    my_role = None
    can_play = False
    if user:
        if user.id == d['creator_id']:
            my_role = 'creator'
        elif user.id == d.get('opponent_id') or not d.get('opponent_id'):
            my_role = 'opponent'
        can_play = my_role is not None and str(user.id) not in results
    return DuelOut(code=d['code'], size=d['size'], moves=d['moves'], status=status, creator=creator, opponent=opponent,
                   winner_id=winner_id, my_role=my_role, can_play=can_play, created_at=d['created_at'])


async def get_duel(code: str) -> dict:
    await prune_expired_duels()
    d = await db.duels.find_one({'code': code.upper()}, {'_id': 0})
    if not d:
        raise HTTPException(status_code=404, detail='Дуель не знайдено')
    return d


async def notify_duel(d: dict, out: DuelOut) -> None:
    if out.status == 'finished':
        a, b = out.creator, out.opponent
        head = 'Нічия!' if out.winner_id is None else f'Переможець: <b>{a.name if out.winner_id == a.user_id else b.name}</b>'
        bonus = f' (+{DUEL_DRAW_COINS} монет кожному)' if out.winner_id is None else f' (+{DUEL_WIN_COINS} монет)'
        text = (f'⚔️ <b>Дуель {out.size}x{out.size} завершена!</b>\n\n'
                f'{a.name} — <b>{fmt_ms(a.time_ms)}</b>\n{b.name} — <b>{fmt_ms(b.time_ms)}</b>\n\n{head}{bonus}')
        targets = [a.user_id, b.user_id]
    else:
        text = f'⚔️ <b>{out.opponent.name}</b> прийняв(ла) ваш виклик на дуель {out.size}x{out.size}! Чекаємо на результат.'
        targets = [out.creator.user_id]
    for uid in targets:
        try:
            await telegram_bot.call('sendMessage', chat_id=uid, text=text, parse_mode='HTML',
                                    reply_markup={'inline_keyboard': [[{'text': '⚔️ Відкрити дуель', 'url': f'{telegram_bot.APP_URL}?startapp=duel_{out.code}'}]]})
        except Exception as e:
            logger.warning('duel notify to %s failed: %s', uid, e)


async def duel_stats(user_id: int) -> DuelStatsOut:
    p = await db.players.find_one({'user_id': user_id}, {'_id': 0, 'coins': 1, 'duel_streak': 1, 'duel_best_streak': 1,
                                                          'duel_wins': 1, 'duel_losses': 1, 'duel_draws': 1}) or {}
    return DuelStatsOut(streak=int(p.get('duel_streak', 0)), best_streak=int(p.get('duel_best_streak', 0)),
                        wins=int(p.get('duel_wins', 0)), losses=int(p.get('duel_losses', 0)),
                        draws=int(p.get('duel_draws', 0)), coins=int(p.get('coins', 0)))


async def reward_duel(d: dict, out: DuelOut) -> int:
    """Нарахування монет і серії перемог — рівно один раз на дуель (прапорець rewarded)."""
    res = await db.duels.update_one({'code': d['code'], 'rewarded': {'$ne': True}}, {'$set': {'rewarded': True}})
    if res.modified_count == 0:
        return 0
    a, b = out.creator.user_id, out.opponent.user_id
    if out.winner_id is None:
        for uid in (a, b):
            await db.players.update_one({'user_id': uid}, {'$inc': {'coins': DUEL_DRAW_COINS, 'duel_draws': 1}})
        return DUEL_DRAW_COINS
    loser = b if out.winner_id == a else a
    w = await db.players.find_one({'user_id': out.winner_id}, {'_id': 0, 'duel_streak': 1, 'duel_best_streak': 1}) or {}
    streak = int(w.get('duel_streak', 0)) + 1
    await db.players.update_one({'user_id': out.winner_id}, {
        '$inc': {'coins': DUEL_WIN_COINS, 'duel_wins': 1},
        '$set': {'duel_streak': streak, 'duel_best_streak': max(streak, int(w.get('duel_best_streak', 0)))},
    })
    await db.players.update_one({'user_id': loser}, {'$inc': {'duel_losses': 1}, '$set': {'duel_streak': 0}})
    return DUEL_WIN_COINS


@api_router.get('/duels/me', response_model=DuelStatsOut)
async def my_duel_stats(user: TgUser = Depends(current_user)):
    return await duel_stats(user.id)


@api_router.post('/duels', response_model=DuelOut)
async def create_duel(body: DuelCreateIn, user: TgUser = Depends(current_user)):
    faces = 'UDLRFB' if body.size < 4 else 'UuDdLlRrFfBb'
    d = {
        'code': ''.join(random.choice(DUEL_CODE_ALPHABET) for _ in range(6)),
        'size': body.size,
        'moves': generate_scramble(None, DUEL_SCRAMBLE_LEN[body.size], faces),
        'creator_id': user.id,
        'opponent_id': None,
        'results': {},
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.duels.insert_one(dict(d))
    return await duel_out(d, user)


@api_router.get('/duels', response_model=List[DuelOut])
async def my_duels(user: TgUser = Depends(current_user)):
    await prune_expired_duels()
    docs = await db.duels.find({'$or': [{'creator_id': user.id}, {'opponent_id': user.id}]}, {'_id': 0}).sort('created_at', -1).limit(20).to_list(20)
    return [await duel_out(d, user) for d in docs]


@api_router.get('/duels/{code}', response_model=DuelOut)
async def duel_detail(code: str, user: Optional[TgUser] = Depends(optional_user)):
    return await duel_out(await get_duel(code), user)


async def join_duel(d: dict, user: TgUser) -> dict:
    if user.id == d['creator_id'] or d.get('opponent_id') == user.id:
        return d
    if d.get('opponent_id'):
        raise HTTPException(status_code=409, detail='У цій дуелі вже є суперник')
    res = await db.duels.update_one({'code': d['code'], 'opponent_id': None}, {'$set': {'opponent_id': user.id}})
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail='У цій дуелі вже є суперник')
    d['opponent_id'] = user.id
    asyncio.create_task(notify_duel(d, await duel_out(d, user)))
    return d


@api_router.post('/duels/{code}/join', response_model=DuelOut)
async def duel_join(code: str, user: TgUser = Depends(current_user)):
    return await duel_out(await join_duel(await get_duel(code), user), user)


@api_router.post('/duels/{code}/cancel')
async def duel_cancel(code: str, user: TgUser = Depends(current_user)):
    d = await get_duel(code)
    if d.get('creator_id') != user.id:
        raise HTTPException(status_code=403, detail='Відмінити дуель може тільки її творець')
    if d.get('results'):
        raise HTTPException(status_code=409, detail='Неможливо скасувати дуель, яка вже має результати')
    res = await db.duels.delete_one({'code': code, 'creator_id': user.id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Дуель не знайдено')
    return {'ok': True, 'code': code}


@api_router.post('/duels/{code}/score', response_model=DuelOut)
async def duel_score(code: str, body: DuelScoreIn, user: TgUser = Depends(current_user)):
    d = await join_duel(await get_duel(code), user)
    if str(user.id) in d.get('results', {}):
        raise HTTPException(status_code=409, detail='Ви вже зіграли цю дуель')
    await db.duels.update_one({'code': d['code']}, {'$set': {f'results.{user.id}': body.time_ms}})
    d = await get_duel(code)
    out = await duel_out(d, user)
    if out.status == 'finished':
        reward = await reward_duel(d, out)
        if out.winner_id in (None, user.id):
            out.reward_coins = reward
        out.my_streak = (await duel_stats(user.id)).streak
        asyncio.create_task(notify_duel(d, out))
    return out


FORTUNE_WHEEL_COOLDOWN = 24 * 3600
FORTUNE_WHEEL_PRIZES = [
    {'label': '0.0005 TON', 'weight': 28, 'coins': 0, 'ton': '0.0005'},
    {'label': '0.00010 TON', 'weight': 24, 'coins': 0, 'ton': '0.00010'},
    {'label': '50 монет', 'weight': 22, 'coins': 50, 'ton': None},
    {'label': '100 монет', 'weight': 15, 'coins': 100, 'ton': None},
    {'label': '0.0015 TON', 'weight': 10, 'coins': 0, 'ton': '0.0015'},
    {'label': 'Без виграшу', 'weight': 18, 'coins': 0, 'ton': None},
    {'label': '500 монет', 'weight': 1, 'coins': 500, 'ton': None},
]
FORTUNE_WHEEL_TOTAL_WEIGHT = sum(p['weight'] for p in FORTUNE_WHEEL_PRIZES)


def choose_fortune_prize() -> dict:
    cursor = random.uniform(0, FORTUNE_WHEEL_TOTAL_WEIGHT)
    for prize in FORTUNE_WHEEL_PRIZES:
        cursor -= prize['weight']
        if cursor < 0:
            return prize
    return FORTUNE_WHEEL_PRIZES[-1]


REWARDED_AD_COINS = int(os.environ.get('ADS_REWARD_COINS', '100'))
REWARDED_AD_COOLDOWN = int(os.environ.get('ADS_REWARD_COOLDOWN', '60'))


@api_router.post('/reward/spin', response_model=RewardSpinOut)
async def reward_spin(body: RewardSpinIn, user: TgUser = Depends(current_user)):
    uid = body.telegram_id if body.telegram_id is not None else user.id
    if uid != user.id:
        raise HTTPException(status_code=403, detail='Невірний Telegram ID')

    now = datetime.now(timezone.utc)
    player = await db.players.find_one({'user_id': uid}, {'_id': 0, 'coins': 1, 'extra_spins': 1, 'last_rewarded_ad_at': 1}) or {}
    last = player.get('last_rewarded_ad_at')
    if last:
        try:
            last_dt = datetime.fromisoformat(last)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            if (now - last_dt).total_seconds() < REWARDED_AD_COOLDOWN:
                current = await db.players.find_one({'user_id': uid}, {'_id': 0, 'coins': 1, 'extra_spins': 1}) or {}
                return RewardSpinOut(
                    ok=False,
                    extra_spins=int(current.get('extra_spins', 0)),
                    coins=int(current.get('coins', 0)),
                    coins_awarded=0,
                    reward_type=body.reward_type,
                )
        except ValueError:
            pass

    result = await db.players.update_one(
        {'user_id': uid},
        {'$inc': {'coins': REWARDED_AD_COINS, 'extra_spins': 1}, '$set': {'last_rewarded_ad_at': now.isoformat(), 'updated_at': now.isoformat()}},
        upsert=True,
    )
    player = await db.players.find_one({'user_id': uid}, {'_id': 0, 'coins': 1, 'extra_spins': 1}) or {}
    return RewardSpinOut(
        ok=result.modified_count != 0 or result.upserted_id is not None,
        extra_spins=int(player.get('extra_spins', 0)),
        coins=int(player.get('coins', 0)),
        coins_awarded=REWARDED_AD_COINS,
        reward_type=body.reward_type,
    )


@api_router.get('/fortune-wheel/status')
async def fortune_wheel_status(user: TgUser = Depends(current_user)):
    player = await db.players.find_one({
        'user_id': user.id,
    }, {'_id': 0, 'coins': 1, 'extra_spins': 1, 'fortune_wheel_last_spin_at': 1}) or {}

    extra_spins = int(player.get('extra_spins', 0))
    last = player.get('fortune_wheel_last_spin_at')
    seconds_until_next = FORTUNE_WHEEL_COOLDOWN
    if last:
        try:
            last_dt = datetime.fromisoformat(last)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
            seconds_until_next = max(0, int(FORTUNE_WHEEL_COOLDOWN - elapsed))
        except ValueError:
            pass

    return {
        'coins': int(player.get('coins', 0)),
        'extra_spins': extra_spins,
        'fortune_wheel_last_spin_at': last,
        'seconds_until_next': seconds_until_next,
    }


@api_router.post('/fortune-wheel/spin', response_model=FortuneWheelOut)
async def fortune_wheel_spin(user: TgUser = Depends(current_user)):
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(seconds=FORTUNE_WHEEL_COOLDOWN)).isoformat()
    prize = choose_fortune_prize()
    player = await db.players.find_one({'user_id': user.id}, {'_id': 0, 'coins': 1, 'fortune_wheel_last_spin_at': 1, 'extra_spins': 1}) or {}
    extra_spins = int(player.get('extra_spins', 0))

    if extra_spins > 0:
        result = await db.players.update_one(
            {'user_id': user.id},
            {
                '$inc': {'coins': prize['coins'], 'extra_spins': -1},
                '$set': {'fortune_wheel_last_spin_at': now.isoformat()},
            },
            upsert=True,
        )
    else:
        result = await db.players.update_one(
            {
                'user_id': user.id,
                '$or': [
                    {'fortune_wheel_last_spin_at': {'$lt': cutoff}},
                    {'fortune_wheel_last_spin_at': {'$exists': False}},
                ],
            },
            {
                '$inc': {'coins': prize['coins']},
                '$set': {'fortune_wheel_last_spin_at': now.isoformat()},
            },
        )
        if result.modified_count == 0:
            player = await db.players.find_one({'user_id': user.id}, {'_id': 0, 'coins': 1, 'fortune_wheel_last_spin_at': 1}) or {}
            last = datetime.fromisoformat(player['fortune_wheel_last_spin_at']) if player.get('fortune_wheel_last_spin_at') else now
            seconds_left = max(0, int(FORTUNE_WHEEL_COOLDOWN - (now - last).total_seconds()))
            raise HTTPException(status_code=409, detail=f'Наступне обертання доступне через {seconds_left} секунд')

    await db.spin_history.insert_one({
        'telegram_id': user.id,
        'reward': prize['coins'],
        'created_at': now.isoformat(),
        'type': 'fortune_wheel',
        'label': prize['label'],
    })

    player = await db.players.find_one({'user_id': user.id}, {'_id': 0, 'coins': 1, 'extra_spins': 1}) or {}
    return FortuneWheelOut(
        prize=prize['label'],
        coins_awarded=prize['coins'],
        ton_awarded=prize['ton'],
        coins=int(player.get('coins', 0)),
        extra_spins=int(player.get('extra_spins', 0)),
        seconds_until_next=FORTUNE_WHEEL_COOLDOWN,
    )


@api_router.post('/admin/reset-wheel-spins')
async def admin_reset_wheel_spins(
    body: dict | None = None,
    x_admin_token: str = Header(default=''),
):
    secret = os.environ.get('ADMIN_RESET_WHEEL_SPINS_TOKEN', '').strip()
    if not secret:
        raise HTTPException(status_code=403, detail='Admin reset is disabled')
    if x_admin_token != secret:
        raise HTTPException(status_code=403, detail='Invalid admin token')

    payload = body or {}
    target_user_id = payload.get('user_id')
    reset_last_spin_at = bool(payload.get('reset_last_spin_at'))
    query = {'user_id': int(target_user_id)} if target_user_id is not None else {'extra_spins': {'$ne': 0}}
    update = {'$set': {'extra_spins': 0}}
    if reset_last_spin_at:
        update['$unset'] = {'fortune_wheel_last_spin_at': ''}

    res = await db.players.update_many(query, update)
    return {
        'ok': True,
        'matched': res.matched_count,
        'modified': res.modified_count,
        'extra_spins_reset': True,
        'coins_unchanged': True,
        'reset_last_spin_at': reset_last_spin_at,
        'scope': 'wheel_only',
    }


app.include_router(api_router)

_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    # Auth goes via the X-Telegram-Init-Data header (no cookies), so credentials are only
    # enabled for an explicit origin list; wildcard '*' + credentials is invalid per the CORS spec.
    allow_credentials='*' not in _cors_origins,
    allow_origins=_cors_origins or ['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

logging.basicConfig(level=logging.INFO)


@app.on_event('startup')
async def ensure_indexes():
    await db.scores.create_index([('user_id', 1), ('size', 1)], unique=True)
    await db.scores.create_index([('size', 1), ('best_ms', 1)])
    await db.daily_results.create_index([('date', 1), ('user_id', 1)], unique=True)
    await db.daily_results.create_index([('date', 1), ('time_ms', 1)])
    await db.daily_challenges.create_index('date', unique=True)
    await db.players.create_index('user_id', unique=True)
    await db.players.create_index('invited_by')
    await db.solves.create_index([('size', 1), ('created_at', 1)])
    await db.solves.create_index('user_id')
    await db.achievements.create_index([('user_id', 1), ('id', 1)], unique=True)
    await db.duels.create_index('code', unique=True)
    await db.duels.create_index([('creator_id', 1), ('created_at', -1)])
    await db.duels.create_index([('opponent_id', 1), ('created_at', -1)])
    asyncio.create_task(reminder_scheduler())
    asyncio.create_task(duel_cleanup_scheduler())


@app.on_event('shutdown')
async def shutdown_db_client():
    client.close()
