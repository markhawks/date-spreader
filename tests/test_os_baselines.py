"""Up-to-date versions of the operating systems (GET/PUT /api/os-baselines)."""

RHEL = "Red Hat Enterprise Linux"


def test_defaults(client):
    got = client.get("/api/os-baselines").json()["baselines"]
    assert [(b["major"], b["minor"]) for b in got if b["family"] == RHEL] == [(7, 9), (8, 10), (9, 8), (10, 3)]


def test_change_and_checks(client):
    new = [{"family": RHEL, "major": 9, "minor": 9}, {"family": f" {RHEL} ", "major": 10, "minor": 4},
           {"family": "Rocky Linux", "major": 9, "minor": 6}]
    res = client.put("/api/os-baselines", json={"baselines": new})
    assert res.status_code == 200, res.text
    got = client.get("/api/os-baselines").json()["baselines"]
    assert [(b["family"], b["major"], b["minor"]) for b in got] == [(RHEL, 9, 9), (RHEL, 10, 4), ("Rocky Linux", 9, 6)]
    dup = [{"family": RHEL, "major": 9, "minor": 9}, {"family": RHEL.lower(), "major": 9, "minor": 8}]
    assert client.put("/api/os-baselines", json={"baselines": dup}).status_code == 422
    assert client.put("/api/os-baselines", json={"baselines": [{"family": RHEL, "major": 9}]}).status_code == 422
    assert client.put("/api/os-baselines", json={"baselines": []}).status_code == 200
    assert client.get("/api/os-baselines").json()["baselines"] == []      # all removed: nothing is outdated


def test_only_admins_change(anon):
    assert anon.put("/api/os-baselines", json={"baselines": []}).status_code in (401, 403)
