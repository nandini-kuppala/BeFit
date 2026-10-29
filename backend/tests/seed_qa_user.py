"""Create (or reset) a QA account with a few days of logs, for trying the app.

Test database only:  MONGODB_DB=befit_qa uvicorn … ; python tests/seed_qa_user.py http://127.0.0.1:8010
"""

import datetime as dt
import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8010"
QA_EMAIL = "qa-app@example.com"
# Fixture-only password for the throwaway QA database. Never reuse it.
QA_PASSWORD = "qa-befit-" + "fixture-2026"

c = httpx.Client(base_url=BASE, timeout=60)
r = c.post("/auth/login", json={"email": QA_EMAIL, "password": QA_PASSWORD})
if r.status_code == 200:
    c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    c.post("/auth/me/delete", json={"password": QA_PASSWORD})
    c.headers.pop("Authorization")

r = c.post("/auth/register", json={"email": QA_EMAIL, "password": QA_PASSWORD})
r.raise_for_status()
c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
c.post("/me/onboard", json={
    "name": "Asha", "age": 21, "height_cm": 158, "weight_kg": 65, "goal_weight_kg": 55,
    "health_conditions": [{"name": "Hypothyroidism"}],
    "medications": [{"name": "Levothyroxine", "dose": "100 mcg", "time": "06:30",
                     "empty_stomach": True, "food_gap_minutes": 60, "mineral_gap_minutes": 240}],
}).raise_for_status()


def food(q: str) -> str:
    return c.get("/food/search", params={"q": q}).json()["results"][0]["id"]


today = dt.date.today()
plan = [
    ("breakfast", [("idli", 3, "idli"), ("sambar", 1, "katori"), ("coconut chutney", 2, "tbsp")]),
    ("lunch", [("cooked white rice", 1, "katori"), ("dal plain", 1, "katori"), ("beans poriyal", 1, "katori")]),
    ("snack", [("tea with milk", 1, "cup"), ("roasted chana", 1, "handful")]),
    ("dinner", [("chapati", 2, "chapati"), ("chicken curry", 1, "katori")]),
]
for back in (3, 2, 1):
    day = (today - dt.timedelta(days=back)).isoformat()
    for meal, items in plan:
        c.post("/logs/food", json={"date": day, "meal": meal, "items": [
            {"food_id": food(q), "quantity": n, "unit": u} for q, n, u in items]}).raise_for_status()
print("QA account ready:", QA_EMAIL, f"(password in {__file__})")
