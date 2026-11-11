"""Translations: English (primary) and Italian dictionaries of the web UI and of the server.

The UI dictionaries are static/js/i18n/<module>.js files that must be valid JSON after
"export default" (see static/js/i18n.js). Every key used in the code must exist in both languages.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "static" / "js"
DICT_DIR = JS / "i18n"
PLACEHOLDER = re.compile(r"\{(\w+)\}")
# t("key") / t('key') in the code (the key must be a literal string)
T_CALL = re.compile(r"(?<![\w.$])t\(\s*([\"'])([^\"']+)\1")
HTML_KEY = re.compile(r'data-i18n(?:-title|-aria-label|-placeholder)?="([^"]+)"')


def load_dict(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    start = text.index("export default")
    body = text[start + len("export default"):].strip()
    assert body.endswith(";"), f"{path.name}: must end with '}};'"
    return json.loads(body[:-1])


DICTS = {p.stem: load_dict(p) for p in sorted(DICT_DIR.glob("*.js"))}


def all_keys(lang: str) -> dict[str, object]:
    merged: dict[str, object] = {}
    for d in DICTS.values():
        merged.update(d[lang])
    return merged


def test_every_dictionary_has_both_languages_with_the_same_keys():
    for name, d in DICTS.items():
        assert set(d) == {"en", "it"}, name
        assert set(d["en"]) == set(d["it"]), (
            f"{name}: only en {sorted(set(d['en']) - set(d['it']))}, only it {sorted(set(d['it']) - set(d['en']))}"
        )


def test_keys_are_prefixed_with_the_module_name():
    for name, d in DICTS.items():
        bad = [k for k in d["en"] if not k.startswith(f"{name}.")]
        assert not bad, f"{name}.js: keys must start with '{name}.': {bad}"


@pytest.mark.parametrize("name", sorted(DICTS))
def test_values_and_placeholders_match(name):
    d = DICTS[name]
    for key, en in d["en"].items():
        it = d["it"][key]
        if isinstance(en, dict):
            assert isinstance(it, dict) and "other" in en and "other" in it, f"{key}: plural needs 'other'"
            assert set(en) <= {"zero", "one", "two", "few", "many", "other"}, key
            en_texts, it_texts = list(en.values()), list(it.values())
        else:
            assert isinstance(en, str) and isinstance(it, str), key
            en_texts, it_texts = [en], [it]
        assert all(s.strip() for s in en_texts + it_texts), f"{key}: empty text"
        en_ph = set().union(*(set(PLACEHOLDER.findall(s)) for s in en_texts))
        it_ph = set().union(*(set(PLACEHOLDER.findall(s)) for s in it_texts))
        assert en_ph == it_ph, f"{key}: placeholders differ: en {en_ph}, it {it_ph}"


def test_every_key_used_in_the_code_exists():
    known = all_keys("en")
    missing = []
    for path in sorted(JS.glob("*.js")):
        if path.name == "i18n.js":
            continue
        for _, key in T_CALL.findall(path.read_text(encoding="utf-8")):
            if key not in known:
                missing.append(f"{path.name}: {key}")
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    missing += [f"index.html: {k}" for k in HTML_KEY.findall(html) if k not in known]
    assert not missing, missing


# --- server messages ----------------------------------------------------------------------

from app.i18n import MESSAGES, parse_accept_language, set_language, reset_language, tr  # noqa: E402

TR_CALL = re.compile(r"(?<![\w.])tr\(\s*([\"'])([^\"']+)\1")


def test_server_messages_have_both_languages_and_same_placeholders():
    for key, entry in MESSAGES.items():
        assert set(entry) == {"en", "it"}, key
        assert entry["en"].strip() and entry["it"].strip(), key
        assert set(PLACEHOLDER.findall(entry["en"])) == set(PLACEHOLDER.findall(entry["it"])), key


def test_every_server_message_key_used_exists():
    missing = []
    for path in sorted((ROOT / "app").rglob("*.py")):
        for _, key in TR_CALL.findall(path.read_text(encoding="utf-8")):
            if key not in MESSAGES:
                missing.append(f"{path.relative_to(ROOT)}: {key}")
    assert not missing, missing


def test_accept_language_and_tr():
    assert parse_accept_language("it-IT,it;q=0.9,en;q=0.8") == "it"
    assert parse_accept_language("de-DE,en;q=0.5") == "en"
    assert parse_accept_language(None) == "en"
    token = set_language("it")
    try:
        assert tr("common.changelog_missing") == "Changelog non disponibile."
    finally:
        reset_language(token)
    assert tr("common.changelog_missing") == "Changelog not available."
