#!/usr/bin/env bash
# Signs the seeded development account in through the preview proxy and writes
# the resulting session as Playwright storage state for Niteshift to deliver.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
. .niteshift/files/dev-account.sh

base="http://localhost:${PORT:-3000}"
jar="$(mktemp)"
trap 'rm -f "$jar"' EXIT

curl -sf --retry 60 --retry-connrefused --retry-delay 2 -o /dev/null "$base/auth/get-csrf-token/"

csrf="$(curl -sf -c "$jar" "$base/auth/get-csrf-token/" | python3 -c 'import json,sys; print(json.load(sys.stdin)["csrf_token"])')"
curl -sf -o /dev/null -b "$jar" -c "$jar" \
  -X POST "$base/auth/sign-in/" \
  -H "X-CSRFToken: $csrf" \
  -H "Referer: $base/" \
  --data-urlencode "email=$PLANE_DEV_EMAIL" \
  --data-urlencode "password=$PLANE_DEV_PASSWORD"

python3 - "$jar" "$NITESHIFT_AUTH_STATE_FILE" <<'PY'
import json
import sys
from http.cookiejar import MozillaCookieJar

jar_path, state_path = sys.argv[1], sys.argv[2]
jar = MozillaCookieJar(jar_path)
jar.load(ignore_discard=True, ignore_expires=True)

cookies = [
    {
        "name": cookie.name,
        "value": cookie.value,
        "domain": cookie.domain,
        "path": cookie.path,
        "expires": cookie.expires if cookie.expires else -1,
        "httpOnly": bool(cookie.get_nonstandard_attr("HttpOnly", False)),
        "secure": cookie.secure,
        "sameSite": "Lax",
    }
    for cookie in jar
]
if not any(cookie["name"] == "session-id" for cookie in cookies):
    raise SystemExit("sign-in did not return a session cookie")

with open(state_path, "w") as handle:
    json.dump({"cookies": cookies, "origins": []}, handle)
PY
