"""Tip of the day: every tip in static/js/tips.js has its text in both languages, and vice versa."""

import json
import re
from pathlib import Path

JS = Path(__file__).resolve().parent.parent / "static" / "js"


def test_every_tip_has_a_text_and_every_text_a_tip():
    ids = re.findall(r'\{ id: "([a-z0-9_]+)"', (JS / "tips.js").read_text())
    assert len(ids) == len(set(ids)) >= 30
    src = (JS / "i18n" / "tips.js").read_text()
    data = json.loads(src[src.index("{"): src.rindex("}") + 1])
    for lang in ("en", "it"):
        texts = {k.removeprefix("tips.tip.") for k in data[lang] if k.startswith("tips.tip.")}
        assert texts == set(ids), lang
        assert all(len(data[lang][f"tips.tip.{i}"]) <= 300 for i in ids)


def test_tip_actions_are_known():
    actions = set(re.findall(r'action: "([a-z]+)"', (JS / "tips.js").read_text()))
    assert actions <= {"inventory", "gantt", "settings"}
