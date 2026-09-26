"""Генерує валідний Telegram initData для тестів: python make_init_data.py [user_id] [first_name] [username]"""
import hashlib
import hmac
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / '.env')


def make_init_data(user_id=123456789, first_name='Тест', username='tester', photo_url=None, start_param=None):
    token = os.environ['TELEGRAM_BOT_TOKEN']
    user = {'id': user_id, 'first_name': first_name, 'username': username, 'language_code': 'uk'}
    if photo_url:
        user['photo_url'] = photo_url
    pairs = {'auth_date': str(int(time.time())), 'query_id': 'AAHtest', 'user': json.dumps(user, ensure_ascii=False, separators=(',', ':'))}
    if start_param:
        pairs['start_param'] = start_param
    check = '\n'.join(f'{k}={v}' for k, v in sorted(pairs.items()))
    secret = hmac.new(b'WebAppData', token.encode(), hashlib.sha256).digest()
    pairs['hash'] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(pairs)


if __name__ == '__main__':
    uid = int(sys.argv[1]) if len(sys.argv) > 1 else 123456789
    name = sys.argv[2] if len(sys.argv) > 2 else 'Тест'
    uname = sys.argv[3] if len(sys.argv) > 3 else 'tester'
    sp = sys.argv[4] if len(sys.argv) > 4 else None
    print(make_init_data(uid, name, uname, start_param=sp))
