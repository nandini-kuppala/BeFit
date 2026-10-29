"""End-to-end smoke test against a running server.

    MONGODB_DB=befit_qa uvicorn app.main:app --port 8010 &
    python tests/smoke_api.py http://127.0.0.1:8010

Uses a throwaway account and deletes it at the end. Point it at a test
database, never the real one. Network-tier lookups (Gemini/USDA) are skipped
unless --network is passed, so it costs no API quota by default.
"""

import concurrent.futures as cf
import sys
import time
import uuid

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8010"
NETWORK = "--network" in sys.argv
c = httpx.Client(base_url=BASE, timeout=60)
failures = 0


def check(label: str, cond: bool, detail: object = "") -> None:
    global failures
    print(("  ok  " if cond else "  FAIL ") + label + (f"  {detail}" if not cond and detail != "" else ""))
    failures += 0 if cond else 1


def timed(method: str, path: str, **kw) -> httpx.Response:
    t = time.perf_counter()
    r = c.request(method, path, **kw)
    print(f"        {method} {path.split('?')[0]} -> {r.status_code} in {(time.perf_counter() - t) * 1000:.0f} ms")
    return r


email = f"qa-{uuid.uuid4().hex[:8]}@example.com"
pw = "correct horse battery"
r = timed("POST", "/auth/register", json={"email": email, "password": pw})
check("register", r.status_code == 201, r.text)
tok = r.json()["access_token"]
c.headers["Authorization"] = f"Bearer {tok}"

r = timed("POST", "/me/onboard", json={
    "name": "QA", "age": 21, "height_cm": 158, "weight_kg": 65, "goal_weight_kg": 55,
    "health_conditions": [{"name": "Hypothyroidism"}],
})
check("onboard", r.status_code == 201, r.text)

# ---- search
for q, expect in [("idli", "Idli"), ("idly", "Idli"), ("roti", "Chapati"), ("bhindi", "Bhindi fry"),
                  ("pumpkin seeds", None), ("sajje", "Bajra (raw)"), ("chiken curry", "Chicken curry"),
                  ("dal tadka", "Dal with ghee tadka"), ("ghee roast", "Ghee dosa")]:
    r = timed("GET", "/food/search", params={"q": q})
    names = [x["name"] for x in r.json()["results"]]
    if expect:
        check(f"search {q!r} -> {expect}", names[:3] and expect in names[:3], names[:5])
    else:
        check(f"search {q!r} has no sesame/flax false match", not any(n.lower().startswith(("sesame", "flax")) for n in names[:1]), names[:5])

r = c.get("/food/search", params={"q": "idli"})
idli = r.json()["results"][0]
check("idli default portion is 1 idli", idli["portions"][0]["label"] == "1 idli", idli["portions"][:2])
check("idli has variants", idli["variants_count"] >= 1, idli["variants_count"])

r = timed("GET", f"/food/{idli['id']}")
check("food detail lists variants", any(v["name"] == "Rava idli" for v in r.json()["variants"]), r.text[:200])

chap = c.get("/food/search", params={"q": "chapati"}).json()["results"][0]
c65 = c.get("/food/search", params={"q": "chicken 65"}).json()["results"][0]

# ---- logging
r = timed("POST", "/logs/food", json={"meal": "breakfast", "items": [
    {"food_id": idli["id"], "quantity": 3, "unit": "idli"},
    {"food_id": chap["id"], "quantity": 2, "unit": "roti"},
]})
check("log breakfast", r.status_code == 201, r.text)
log = r.json()
items = {i["name"]: i for i in log["items"]}
check("3 idli = 120 g", items["Idli"]["grams"] == 120.0, items["Idli"])
check("2 roti of chapati = 70 g", items["Chapati"]["grams"] == 70.0, items["Chapati"])

r = timed("POST", "/logs/food", json={"meal": "breakfast", "items": [
    {"food_id": c65["id"], "quantity": 3, "unit": "pieces"}]})
check("3 pieces chicken 65 = 60 g", r.json()["items"][-1]["grams"] == 60.0, r.json()["items"][-1])
check("same meal appended, not duplicated", len(r.json()["items"]) == 3, len(r.json()["items"]))
log_id = r.json()["_id"] if "_id" in r.json() else r.json()["id"]

# concurrent writes must not lose items
with cf.ThreadPoolExecutor(6) as pool:
    futs = [pool.submit(lambda: httpx.post(f"{BASE}/logs/food", headers=c.headers, json={
        "meal": "lunch", "items": [{"food_id": idli["id"], "quantity": 1, "unit": "idli"}]}, timeout=60)) for _ in range(6)]
    codes = [f.result().status_code for f in futs]
check("6 concurrent lunch logs all succeed", codes.count(201) == 6, codes)

day = timed("GET", "/logs/day").json()
lunch = next(m for m in day["meals"] if m["meal"] == "lunch")
check("concurrent logs: 6 items, one meal", len(lunch["items"]) == 6, len(lunch["items"]))

# edit an item
bf = next(m for m in day["meals"] if m["meal"] == "breakfast")
item = next(i for i in bf["items"] if i["name"] == "Idli")
r = timed("PATCH", f"/logs/food/{bf['log_id']}/items/{item['id']}", json={"quantity": 2})
check("edit quantity -> 80 g", r.status_code == 200 and r.json()["grams"] == 80.0, r.text)
r = timed("PATCH", f"/logs/food/{bf['log_id']}/items/{item['id']}", json={"meal": "dinner"})
check("move item to dinner", r.status_code == 200, r.text)
day = c.get("/logs/day").json()
dinner = next(m for m in day["meals"] if m["meal"] == "dinner")
check("moved item is in dinner", any(i["id"] == item["id"] for i in dinner["items"]), dinner)

# delete by id
r = timed("DELETE", f"/logs/food/{dinner['log_id']}/items/{item['id']}")
check("delete item by id", r.status_code == 204, r.text)
day = c.get("/logs/day").json()
check("dinner log removed when empty", next(m for m in day["meals"] if m["meal"] == "dinner")["log_id"] is None)

# quick add + copy meal
r = timed("POST", "/logs/food", json={"meal": "snack", "items": [{"quick": {"name": "Canteen samosa", "kcal": 260, "fat_g": 14}}]})
check("quick add", r.status_code == 201 and r.json()["items"][0]["nutrients"]["kcal"] == 260, r.text)
today = day["date"]
r = timed("POST", "/logs/food/copy", json={"from_date": today, "from_meal": "breakfast", "to_meal": "dinner"})
check("copy breakfast to dinner", r.status_code == 201 and len(r.json()["items"]) == 2, r.text[:200])

r = timed("GET", "/food/recent")
rec = r.json()
check("recent foods include idli", any(x["food"]["name"] == "Idli" for x in rec["recent"]), rec)
check("frequent: idli first", rec["frequent"] and rec["frequent"][0]["food"]["name"] == "Idli", [x["food"]["name"] for x in rec["frequent"]])

r = timed("GET", "/logs/history", params={"days": 7})
check("history 7 days", r.status_code == 200 and len(r.json()) == 7, r.text[:200])

# water / undo
c.post("/logs/water", json={"ml": 250}); c.post("/logs/water", json={"ml": 500})
r = c.delete("/logs/water/last")
check("water undo leaves 250", r.json()["entries"][-1]["ml"] == 250 and len(r.json()["entries"]) == 1, r.text)

# saved meal round trip
r = timed("POST", "/meals", json={"name": "Idli breakfast", "items": [
    {"food_id": idli["id"], "quantity": 2, "unit": "idli"}]})
check("create saved meal", r.status_code == 201 and r.json()["items"][0]["portions"], r.text[:200])
meal_id = r.json()["id"]
r = timed("POST", f"/meals/{meal_id}/log", json={"scale": 1.5, "meal": "snack"})
check("log saved meal x1.5", r.status_code == 201, r.text)
check("saved meal list hydrated", c.get("/meals").json()[0]["times_logged"] == 1)

# custom food + recipe + correction
r = timed("POST", "/food/custom", json={"name": "QA Protein Bar", "basis_grams": 60, "kcal": 210, "protein_g": 20, "carbs_g": 22, "fat_g": 7, "serving_label": "1 bar", "serving_grams": 60})
check("custom food", r.status_code == 201 and r.json()["portions"][0]["label"] == "1 bar", r.text[:300])
r = c.post("/food/custom", json={"name": "Bad", "basis_grams": 10, "kcal": 500})
check("impossible custom food rejected", r.status_code == 422, r.status_code)
oats = c.get("/food/search", params={"q": "rolled oats"}).json()["results"][0]
milk = c.get("/food/search", params={"q": "milk cow"}).json()["results"][0]
r = timed("POST", "/food/recipe", json={"name": "QA overnight oats", "ingredients": [
    {"food_id": oats["id"], "name": "oats", "grams": 40}, {"food_id": milk["id"], "name": "milk", "grams": 200}],
    "servings": 1, "serving_label": "1 jar"})
check("recipe", r.status_code == 201 and r.json()["is_recipe"], r.text[:300])
r = timed("POST", f"/food/{idli['id']}/correct", json={"per_100g": {**idli["per_100g"], "kcal": 140}})
check("correction becomes personal", r.status_code == 200 and r.json()["is_personal"], r.text[:200])
s = c.get("/food/search", params={"q": "idli"}).json()["results"]
check("personal correction shadows shared idli", s[0]["is_personal"] and sum(1 for x in s if x["name"] == "Idli") == 1, [(x["name"], x["is_personal"]) for x in s[:3]])

# chat threads summary
r = c.get("/chat/threads")
check("chat threads list", r.status_code == 200, r.text)

if NETWORK:
    r = timed("POST", "/voice/parse", json={"text": "2 roti aur ek katori dal and a glass of buttermilk"})
    check("voice parse", r.status_code == 200 and len(r.json()["items"]) >= 3, r.text[:500])
    print("        ", [(i["name"], i["quantity"], i["unit"], i["grams"]) for i in r.json().get("items", [])])
    r = timed("POST", "/food/resolve", json={"name": "pumpkin seeds"})
    check("resolve pumpkin seeds", r.status_code == 200 and "pumpkin" in r.json()["name"].lower(), r.text[:200])
    r = timed("POST", "/food/resolve", json={"name": "pumpkin seeds"})
    check("second resolve served locally", r.status_code == 200)

# export + delete account
r = timed("GET", "/auth/me/export")
check("export", r.status_code == 200 and "food_logs" in r.json(), r.text[:200])
r = timed("POST", "/auth/me/delete", json={"password": "wrong"})
check("delete needs password", r.status_code == 401)
r = timed("POST", "/auth/me/delete", json={"password": pw})
check("delete account", r.status_code == 204, r.text)
r = c.get("/logs/day")
check("token dead after delete", r.status_code == 401, r.status_code)

print(f"\n{failures} failure(s)")
sys.exit(1 if failures else 0)
