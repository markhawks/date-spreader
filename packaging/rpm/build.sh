#!/usr/bin/env bash
# Builds the Date Spreader RPM for RHEL 10.3+ (noarch, system Python + EPEL).
#
#   packaging/rpm/build.sh                      # with mock, in a clean EL10 + EPEL chroot (e.g. from Fedora)
#   packaging/rpm/build.sh --rpmbuild           # with rpmbuild, directly on RHEL 10.3 (EPEL enabled)
#   options: --ref REF (git commit/tag to package, default HEAD)
#            --mock-config NAME (default alma+epel-10-x86_64)  --without-check (skip the tests)
#
# The sources are taken from git (committed files only: never data/ or .env).
# Result: dist/rpm/  (datespreader-VERSION-1.el10.noarch.rpm and the .src.rpm)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REF="HEAD"
MODE="mock"
MOCK_CONFIG="alma+epel-10-x86_64"
CHECK=(--with check)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --rpmbuild) MODE="rpmbuild"; shift ;;
    --mock-config) MOCK_CONFIG="$2"; shift 2 ;;
    --without-check) CHECK=(--without check); shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

cd "$ROOT"
VERSION="$(git show "$REF:app/__init__.py" | sed -n 's/^__version__ = "\(.*\)"/\1/p')"
[[ -n "$VERSION" ]] || { echo "Version not found in app/__init__.py at $REF" >&2; exit 1; }
OUT="$ROOT/dist/rpm"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT" "$WORK/SOURCES" "$WORK/SPECS"

git archive --format=tar.gz --prefix="datespreader-$VERSION/" -o "$WORK/SOURCES/datespreader-$VERSION.tar.gz" "$REF"
git show "$REF:packaging/rpm/datespreader.sysusers" > "$WORK/SOURCES/datespreader.sysusers"
git show "$REF:packaging/rpm/datespreader.spec" > "$WORK/SPECS/datespreader.spec"
echo "Date Spreader $VERSION from $(git rev-parse --short "$REF") – $MODE"

if [[ "$MODE" == "mock" ]]; then
  command -v mock >/dev/null || { echo "mock not found (dnf install mock)" >&2; exit 1; }
  mock -r "$MOCK_CONFIG" --quiet --buildsrpm --define "ds_version $VERSION" \
       --spec "$WORK/SPECS/datespreader.spec" --sources "$WORK/SOURCES" --resultdir "$WORK/srpm"
  mock -r "$MOCK_CONFIG" --quiet --rebuild "$WORK"/srpm/*.src.rpm --define "ds_version $VERSION" "${CHECK[@]}" \
       --resultdir "$WORK/result"
  cp "$WORK"/result/*.rpm "$OUT/"
  cp "$WORK"/result/build.log "$OUT/build-$VERSION.log" 2>/dev/null || true
else
  command -v rpmbuild >/dev/null || { echo "rpmbuild not found (dnf install rpm-build systemd-rpm-macros python3-devel)" >&2; exit 1; }
  rpmbuild -ba --define "_topdir $WORK" --define "ds_version $VERSION" "${CHECK[@]}" "$WORK/SPECS/datespreader.spec"
  cp "$WORK"/RPMS/noarch/*.rpm "$WORK"/SRPMS/*.rpm "$OUT/"
fi
ls -1 "$OUT"/*"$VERSION"*.rpm
