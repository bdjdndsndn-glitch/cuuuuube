import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

BOT_TOKEN = os.environ['TELEGRAM_BOT_TOKEN']
APP_URL = os.environ['TELEGRAM_APP_URL']
API = f'https://api.telegram.org/bot{BOT_TOKEN}'
FILE_API = f'https://api.telegram.org/file/bot{BOT_TOKEN}'


class BotError(Exception):
    def __init__(self, code: int, description: str):
        super().__init__(description)
        self.code = code
        self.description = description


async def call(method: str, **params) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f'{API}/{method}', json=params)
    data = r.json()
    if not data.get('ok'):
        raise BotError(data.get('error_code', r.status_code), data.get('description', 'Telegram API error'))
    return data['result']


async def fetch_profile_photo(user_id: int) -> Optional[bytes]:
    """Найменше фото профілю користувача (~160px) або None"""
    result = await call('getUserProfilePhotos', user_id=user_id, limit=1)
    photos = result.get('photos') or []
    if not photos:
        return None
    file_id = photos[0][0]['file_id']
    file = await call('getFile', file_id=file_id)
    path = file.get('file_path')
    if not path:
        return None
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f'{FILE_API}/{path}')
    return r.content if r.status_code == 200 else None


async def send_daily_reminder(chat_id: int, date: str, leader_text: str) -> None:
    text = (
        f'🧩 <b>THE CUBE — новий виклик дня ({date})</b>\n\n'
        f'Свіже перемішування 3x3 вже чекає. {leader_text}\n'
        'Зберіть його якнайшвидше та потрапте в рейтинг дня!'
    )
    await call(
        'sendMessage',
        chat_id=chat_id,
        text=text,
        parse_mode='HTML',
        reply_markup={'inline_keyboard': [[{'text': '⚡ Грати виклик дня', 'url': APP_URL}]]},
    )
