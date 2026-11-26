#!/usr/bin/env python3
"""Operator-run signed-session UAT. Only synthetic PR #1367 hosted fixtures.
No password, session cookie, JWT, response body or student identifiers are logged.
Requires Python 3.10+; no third-party dependencies. Never run against production.
"""
import argparse
import getpass
import http.cookiejar
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import warnings

API = "https://dse-pms-evidence1367-uat.onrender.com"
AUTH = "https://ep-young-voice-bif6nm9u.neonauth.c-5.ap-southeast-1.aws.neon.tech/evidence1367/auth"
AUTH_ORIGIN = urllib.parse.urlsplit(AUTH).scheme + "://" + urllib.parse.urlsplit(AUTH).netloc
ROOT = "/api/qa/assessment-evidence"
SPEC = "13670000-0000-4000-8000-000000000002"
OFFERINGS = {"M1": "13670000-0000-4000-8000-000000000101", "M2": "13670000-0000-4000-8000-000000000102"}
TERM = "Synthetic hosted evidence UAT"
ACTORS = {
    "lecturer": ("evidence1367-lecturer@example.test", "lecturer"),
    "coordinator": ("evidence1367-coordinator@example.test", "program_coordinator"),
    "student": ("evidence1367-student@example.test", "student"),
    "unrelated": ("evidence1367-unassigned@example.test", "lecturer"),
}
warnings.filterwarnings("error", category=getpass.GetPassWarning)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def call(opener, url, *, token=None, payload=None, origin=None, expected=200):
    require(url.startswith(API + "/") or url.startswith(AUTH + "/"), "Unexpected target")
    headers = {"Accept": "application/json"}
    if token:
        require(url.startswith(API + "/"), "Refusing to send API bearer token elsewhere")
        headers["Authorization"] = "Bearer " + token
    if origin:
        headers["Origin"] = origin
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, headers=headers, data=data,
                                 method="POST" if data is not None else "GET")
    try:
        response = opener.open(req, timeout=90)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        status = response.code
        # No bodies in exceptions or terminal output, including auth errors.
        require(status == expected, f"{req.method} {urllib.parse.urlsplit(url).path}: expected {expected}, got {status}")
        if status >= 400:
            return None
        try:
            return json.load(response)
        except (ValueError, UnicodeError):
            raise RuntimeError("Expected JSON response") from None

def login(actor, token_only, sessions):
    email, role = ACTORS[actor]
    if token_only:
        token = getpass.getpass(f"Signed Neon JWT for {email}: ")
    else:
        password = getpass.getpass(f"Password for {email}: ")
        require(bool(password), "Missing password")
        opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        call(opener, AUTH + "/sign-in/email", origin=AUTH_ORIGIN,
             payload={"email": email, "password": password, "rememberMe": False})
        del password
        sessions.append(opener)
        token = call(opener, AUTH + "/token", origin=AUTH_ORIGIN).get("token")
    require(isinstance(token, str) and len(token.split(".")) == 3, "Missing signed JWT")
    me = call(urllib.request.build_opener(NoRedirect()), API + "/api/auth/me", token=token)
    require(me.get("email") == email and role in me.get("roles", []), f"Unexpected identity or role for {actor}")
    print(f"PASS authenticated identity: {actor}", flush=True)
    return token

def path(offering, item, population):
    return f"{ROOT}/offerings/{offering}/specs/{SPEC}/assessments/{item}/populations/{population}"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--token-only", action="store_true", help="Use existing genuine short-lived Neon JWTs; no password sign-in test")
    parser.add_argument("--execute", action="store_true", help="Explicitly authorize appending synthetic evidence revisions")
    args = parser.parse_args()
    if not args.execute:
        print("Dry run: fixed synthetic staging targets only. Add --execute to sign in and append synthetic evidence.")
        return
    api_opener = urllib.request.build_opener(NoRedirect())
    sessions = []
    def api(route, actor=None, payload=None, expected=200):
        return call(api_opener, API + route, token=tokens.get(actor), payload=payload, expected=expected)
    tokens = {}
    try:
        for actor in ACTORS:
            tokens[actor] = login(actor, args.token_only, sessions)
        dashboard = ROOT + "/programmes/dse/dashboard?" + urllib.parse.urlencode({"term": TERM, "search": "TSA301-UAT"})
        api(dashboard, expected=401)
        for actor in ("student", "lecturer", "unrelated"):
            api(dashboard, actor, expected=404)
        initial = api(dashboard, "coordinator")
        require(initial["totalOfferings"] == 2 and {r["offeringId"] for r in initial["rows"]} == set(OFFERINGS.values()), "Unexpected staging offerings")
        targets = []
        for section, offering in OFFERINGS.items():
            context = ROOT + "/offerings/" + offering + "/context"
            for actor in ("student", "unrelated"):
                api(context, actor, expected=404)
            for actor in ("lecturer", "coordinator"):
                c = api(context, actor)
                require(c["courseSpecId"] == SPEC and len(c["students"]) == 3 and all(s["studentCode"].startswith("UAT1367-" + section + "-") for s in c["students"]), "Non-synthetic roster")
            for item, population, count, marks in (
                ("uat-lab", "individual", 3, [40,70,90]),
                ("uat-project", "group", 1, [80]),
                ("uat-project", "component", 3, [60,70,80])):
                route = path(offering, item, population)
                data = api(route, "lecturer")
                eligible = data["eligibleResults"]
                require(data["population"] == population and len(eligible) == count and sorted(s["score"] for s in eligible) == marks and all(s["maxScore"] == 100 for s in eligible), "Unexpected source population")
                if population == "group":
                    require(len(eligible[0]["memberEnrollmentIds"]) == 3, "Group membership mismatch")
                api(route, "student", expected=404)
                api(route, "unrelated", expected=404)
                chosen = [max(eligible, key=lambda s: s["score"])] if population == "individual" else eligible
                targets.extend((section, item, population, route, s["resultId"]) for s in chosen)
        # Reject a cross-section group source before any mutation.
        g1 = next(t for t in targets if t[0] == "M1" and t[2] == "group")
        g2 = next(t for t in targets if t[0] == "M2" and t[2] == "group")
        api(g2[3] + "/results/" + g1[4] + "/history", "lecturer", expected=404)
        print("PASS scoped roster, dashboard, source populations and cross-section denial", flush=True)
        for section, item, population, route, source in targets:
            root = route + "/results/" + source
            history = api(root + "/history", "lecturer")["revisions"]
            rev = history[0]["revision"] if history else 0
            # Reference is intentionally a synthetic placeholder. This test verifies workflow,
            # not actual external file existence/permissions or the hosted upload service.
            draft = {"action": "revise" if rev else "create", "expectedRevision": rev,
                     "selectionReason": "Synthetic hosted UAT only; not student evidence",
                     "workReference": f"https://drive.google.com/file/d/synthetic-uat1367-{section.lower()}-{population}/view"}
            api(root + "/revisions", "coordinator", draft, 403)
            created = api(root + "/revisions", "lecturer", draft, 201)
            require(created["status"] == "draft" and created["revision"] == rev + 1, "Draft lifecycle mismatch")
            submitted = api(root + "/revisions", "lecturer",
                            {"action": "submit", "expectedRevision": rev + 1, "confirmedMarkedWork": True}, 201)
            require(submitted["status"] == "submitted", "Submission lifecycle mismatch")
            review = {"action": "verify", "expectedRevision": rev + 2,
                      "reviewReason": "Synthetic independent workflow test only",
                      "confirmedRestrictedWorkAndMarks": True}
            api(root + "/revisions", "lecturer", review, 403)
            verified = api(root + "/revisions", "coordinator", review, 201)
            require(verified["status"] == "verified" and verified["revision"] == rev + 3, "Verification lifecycle mismatch")
            h = api(root + "/history", "coordinator")["revisions"][:3]
            require([x["status"] for x in h] == ["verified", "submitted", "draft"] and h[0]["actorId"] != h[1]["actorId"] and h[1]["actorId"] == h[2]["actorId"], "History or reviewer separation mismatch")
            print(f"PASS {section} {population}: draft, submit, self-review denied, independent verification and history", flush=True)
        final = api(dashboard, "coordinator")
        for row in final["rows"]:
            actual = {a["population"]: a for a in row["assessments"]}
            for population, expected in (("individual", 1), ("group", 1), ("component", 3)):
                require(actual[population]["verified"] == expected and actual[population]["stale"] == 0, "Dashboard coverage mismatch")
            require(actual["group"]["gap"] == actual["component"]["gap"] == 0, "Group coverage incomplete")
            require(actual["individual"]["gap"] == 2, "Unexpected individual sample gap")
        require(len(targets) == 10, "Unexpected lifecycle count")
        print("PASS 10 signed-session evidence lifecycles; coordinator coverage and access boundaries", flush=True)
        print("Synthetic evidence remains in staging for review; uploads and real student evidence not tested.")
    finally:
        for session in sessions:
            try:
                call(session, AUTH + "/sign-out", payload={}, origin=AUTH_ORIGIN)
            except Exception:
                print("Warning: a synthetic provider session could not be signed out; revoke it in Neon.", file=sys.stderr)
        tokens.clear()

if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print("UAT FAILED: " + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        # Avoid printing network URLs, raw HTTP response bodies, or credentials.
        print("UAT FAILED: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
