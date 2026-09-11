#!/usr/bin/env python3
"""Firefox smoke test for Recipe Catcher — the browser half of the test suite.

`scripts/run-tests.sh` covers the parsing logic with no browser. This drives a real
Firefox: installs dist/firefox as a temporary add-on, opens a local recipe page, and
checks the whole path end to end — content script injects, prompt appears, Catch opens
the reader, and the reader's metric toggle and servings scaler actually work.

Deliberately serves a LOCAL fixture rather than a live recipe site: real sites reflow as
ads load (which moves the prompt out from under the click) and some block automated
browsers outright, so they produce flaky results that say nothing about our code.

    brew install geckodriver firefox     # one time
    ./scripts/build-webext.sh            # produces dist/firefox
    ./scripts/smoke-firefox.py [--headless]

Exits non-zero if any check fails.
"""
import functools, http.server, json, os, subprocess, sys, threading, time
import urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADDON = os.path.join(ROOT, "dist", "firefox")
FIXTURES = os.path.join(ROOT, "test", "fixtures")
PORT = 8765
BASE = "http://127.0.0.1:4444"

failures = []


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f"  ({detail})" if detail else ""))
    if not ok:
        failures.append(label)
    return ok


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            return json.loads(resp.read() or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:400]}")


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=FIXTURES)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    headless = "--headless" in sys.argv
    if not os.path.isdir(ADDON):
        print("dist/firefox missing — run ./scripts/build-webext.sh first", file=sys.stderr)
        return 1

    gecko = subprocess.Popen(["geckodriver", "--port", "4444", "--allow-system-access"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    httpd = serve()
    time.sleep(2.5)

    opts = {"args": ["-headless"]} if headless else {}
    sess = req("POST", "/session", {"capabilities": {"alwaysMatch": {
        "browserName": "firefox", "moz:firefoxOptions": opts}}})
    S = f"/session/{sess['value']['sessionId']}"
    print(f"Firefox {sess['value']['capabilities'].get('browserVersion')}"
          f"{' (headless)' if headless else ''}\n")

    def content(js): return req("POST", S + "/execute/sync", {"script": js, "args": []})["value"]
    def handles(): return set(req("GET", S + "/window/handles")["value"])
    def click(text):
        e = req("POST", S + "/element",
                {"using": "xpath", "value": f"//button[normalize-space()='{text}']"})["value"]
        req("POST", S + f"/element/{list(e.values())[0]}/click", {})
    def ingredients():
        return content("const t=document.body.innerText;"
                       "return t.slice(t.indexOf('INGREDIENTS')+11, t.indexOf('INSTRUCTIONS')).trim();")

    try:
        req("POST", S + "/moz/addon/install", {"path": ADDON, "temporary": True})
        req("POST", S + "/window/rect", {"width": 1400, "height": 950})
        req("POST", S + "/url", {"url": f"http://127.0.0.1:{PORT}/recipe.html"})

        print("content script + prompt")
        seen = False
        for _ in range(20):
            if content("return !!document.getElementById('recipe-catcher-suggest');"):
                seen = True
                break
            time.sleep(1)
        # No permissions.request() call anywhere in our code, so this also demonstrates
        # whether this Firefox grants MV3 host_permissions at install.
        check("on-page prompt appears with no manual host grant", seen)
        if not seen:
            return 1

        time.sleep(1.5)
        print("\ncatch -> reader")
        geo = content("""
            const host=document.getElementById('recipe-catcher-suggest');
            const r=host.getBoundingClientRect();
            let minX=1e9,maxX=-1,minY=1e9,maxY=-1,n=0;
            for(let y=Math.ceil(r.top);y<=Math.floor(r.bottom);y+=2)
              for(let x=Math.ceil(r.left);x<=Math.floor(r.right);x+=2)
                if(document.elementFromPoint(x,y)===host){
                  n++; if(x<minX)minX=x; if(x>maxX)maxX=x;
                  if(y<minY)minY=y; if(y>maxY)maxY=y;}
            return {minX,maxX,minY,maxY,n};
        """)
        if not check("prompt card is hit-testable", geo and geo["n"] > 0):
            return 1

        # The card lives in a CLOSED shadow root, so its button can't be queried — click
        # by coordinate instead. Scan left->right: the icon and label are inert, the Catch
        # button comes next, and the dismiss (x) is furthest right, so we always find
        # Catch before we could accidentally dismiss the prompt.
        main_h = list(handles())[0]
        cy = (geo["minY"] + geo["maxY"]) // 2
        reader = None
        for x in range(geo["minX"] + 6, geo["maxX"] - 18, 8):
            before = handles()
            req("POST", S + "/actions", {"actions": [{
                "type": "pointer", "id": "m", "parameters": {"pointerType": "mouse"},
                "actions": [{"type": "pointerMove", "origin": "viewport", "x": x, "y": cy},
                            {"type": "pointerDown", "button": 0},
                            {"type": "pause", "duration": 40},
                            {"type": "pointerUp", "button": 0}]}]})
            time.sleep(1.2)
            new = handles() - before
            if new:
                h = list(new)[0]
                req("POST", S + "/window", {"handle": h})
                if req("GET", S + "/url")["value"].startswith("moz-extension://"):
                    reader = h
                    break
                req("DELETE", S + "/window")          # something else opened a tab
                req("POST", S + "/window", {"handle": main_h})
        if not check("Catch opens the extension's reader page", reader is not None):
            return 1
        time.sleep(2)

        body = content("return document.body.innerText;")
        check("reader shows the recipe title", "Dutch Oven Bread" in body)
        check("oven temp annotated with °C", "232°C" in body, "450 degrees F (232°C)")

        print("\nreader controls")
        imperial = ingredients()
        click("Metric"); time.sleep(1.5)
        metric = ingredients()
        check("metric weighs dry goods in grams", "375 g" in metric, metric.splitlines()[0])
        check("metric shows liquids in ml", " ml" in metric)

        click("Imperial"); time.sleep(1)
        base = ingredients()
        click("+"); time.sleep(1.5)
        scaled = ingredients()
        check("servings scaler rescales quantities", base != scaled,
              f"{base.splitlines()[0]} -> {scaled.splitlines()[0]}")
        check("nutrition block present", "NUTRITION" in content("return document.body.innerText;"))

        print()
        if failures:
            print(f"{len(failures)} FAILED: {', '.join(failures)}")
            return 1
        print("ALL GREEN")
        return 0
    finally:
        try: req("DELETE", S)
        except Exception: pass
        httpd.shutdown()
        gecko.terminate()


if __name__ == "__main__":
    sys.exit(main())
