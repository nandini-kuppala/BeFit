"""The user's calendar, not the server's.

Every date default in the API goes through here. `datetime.date.today()` reads
the host clock, and a cloud host runs in UTC — five and a half hours behind
India, which is enough to file a midnight snack under the wrong day.
"""

import datetime as dt
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.core.config import get_settings


@lru_cache
def zone() -> ZoneInfo:
    return ZoneInfo(get_settings().app_timezone)


def local_now() -> dt.datetime:
    return dt.datetime.now(zone())


def local_today() -> dt.date:
    return local_now().date()
