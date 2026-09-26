"""Ручний запуск щоденної розсилки для перевірки (імітує планувальник о 9:00)."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server


async def main():
    today = server.kyiv_today()
    # Скидаємо позначку, щоб розсилка не пропустила підписників (імітація нового дня)
    await server.db.players.update_many(
        {'reminder_enabled': True},
        {'$unset': {'last_reminder_date': ''}},
    )
    subs = await server.db.players.count_documents({'reminder_enabled': True})
    print(f'Підписників з reminder_enabled=True: {subs}')
    sent = await server.broadcast_daily_reminders()
    print(f'Розіслано нагадувань: {sent} (дата {today})')


if __name__ == '__main__':
    asyncio.run(main())
