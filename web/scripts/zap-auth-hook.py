"""ZAP scan hook that replays a seeded Playwright storage-state session.

The nightly DAST job seeds a disposable Postern stack with a real user session
and a real MFA-completed admin session.  Those storage-state files are copied
into the mounted ZAP work directory and this hook installs a Replacer rule that
sends the matching cookies on every request ZAP makes to the target.
"""

import json
import os
import re
from urllib.parse import urlparse

WRK_DIR = os.environ.get("ZAP_WORK_DIR", "/zap/wrk")
SESSION_FILE = os.environ.get("ZAP_SESSION_FILE", "zap-session.json")
SESSION_ROLE = os.environ.get("ZAP_SESSION_ROLE", "seeded")


def _cookie_header(target):
    session_path = os.path.join(WRK_DIR, SESSION_FILE)
    with open(session_path, "r", encoding="utf-8") as session_file:
        state = json.load(session_file)

    host = (os.environ.get("ZAP_SESSION_HOST") or urlparse(target).hostname or "").lower()
    pairs = []
    for cookie in state.get("cookies", []):
        domain = (cookie.get("domain") or "").lstrip(".").lower()
        if domain and not (host == domain or host.endswith("." + domain)):
            continue
        name = cookie.get("name")
        value = cookie.get("value")
        if name and value is not None:
            pairs.append("{}={}".format(name, value))

    if not pairs:
        raise RuntimeError(
            "No cookies in {} match target host {}".format(session_path, host)
        )
    return "; ".join(pairs)


def zap_started(zap, target):
    cookie = _cookie_header(target)
    target_pattern = re.escape(target.rstrip("/")) + r"(/.*)?$"
    zap.replacer.add_rule(
        description="Seeded {} session cookies".format(SESSION_ROLE),
        enabled=True,
        matchtype="REQ_HEADER",
        matchregex=False,
        matchstring="Cookie",
        replacement=cookie,
        initiators="",
        url=target_pattern,
    )
