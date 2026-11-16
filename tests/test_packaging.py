"""System files of the RPM (packaging/rpm/): a broken file there can break the host, not only the
portal (an invalid firewalld service file stops firewalld). These tests also run inside the RPM build."""

import configparser
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RPM = ROOT / "packaging" / "rpm"


def test_firewalld_service_is_valid_xml():
    path = RPM / "datespreader.firewalld.xml"
    text = path.read_text(encoding="utf-8")
    for comment in re.findall(r"<!--(.*?)-->", text, flags=re.S):
        assert "--" not in comment, "two hyphens inside an XML comment make the file invalid"
    root = ET.fromstring(text.encode())
    assert root.tag == "service"
    assert root.findtext("short")
    ports = root.findall("port")
    assert [(p.get("protocol"), p.get("port")) for p in ports] == [("tcp", "8000")]


def _unit(name: str) -> configparser.ConfigParser:
    cp = configparser.ConfigParser(strict=False, interpolation=None, delimiters=("=",))
    cp.optionxform = str
    cp.read_string((RPM / name).read_text(encoding="utf-8"))
    return cp


def test_systemd_units_point_to_the_packaged_paths():
    svc = _unit("datespreader.service")
    assert svc["Service"]["User"] == "datespreader"
    assert svc["Service"]["WorkingDirectory"] == "/usr/lib/datespreader"
    assert svc["Service"]["ReadWritePaths"] == "/var/lib/datespreader"
    assert "DATESPREADER_CONFIG=/etc/datespreader/datespreader.env" in (RPM / "datespreader.service").read_text()
    backup = _unit("datespreader-backup.service")
    assert backup["Service"]["ExecStart"].endswith("app.cli backup --scheduled")
    timer = _unit("datespreader-backup.timer")
    assert timer["Timer"]["Unit"] == "datespreader-backup.service"


def test_sysusers_and_config():
    lines = [ln for ln in (RPM / "datespreader.sysusers").read_text().splitlines() if ln and not ln.startswith("#")]
    assert lines and lines[0].split()[:2] == ["u", "datespreader"]
    env = (RPM / "datespreader.env").read_text()
    assert "DATABASE_PATH=/var/lib/datespreader/datespreader.sqlite3" in env
    assert re.search(r"^HOST=127\.0\.0\.1$", env, flags=re.M)   # not exposed on the network by default


def test_every_packaged_file_is_installed_by_the_spec():
    spec = (RPM / "datespreader.spec").read_text()
    for name in ("datespreader-cli.sh", "datespreader.service", "datespreader-backup.service",
                 "datespreader-backup.timer", "datespreader.env", "datespreader.firewalld.xml"):
        assert f"packaging/rpm/{name}" in spec, name
