"""Preview diagnostics: capture page exceptions / console output around an action.

Complements tools/preview_shot.py (which asserts geometry + screenshots) by
answering "why did it break" -- it subscribes to Runtime.exceptionThrown and
Runtime.consoleAPICalled, performs an optional click, and dumps what the page
said, plus a DOM snapshot before/after.

Usage:
  python tools/preview_diag.py                       # load preview, report console
  python tools/preview_diag.py --click ".wbtn"       # open settings via gear
  python tools/preview_diag.py --click ".wbtn" --theme light --html
"""

import argparse
import json
import time
import urllib.request

import websocket


def find_page(port):
    data = json.loads(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=5).read())
    pages = [t for t in data if t.get("type") == "page"]
    if not pages:
        raise SystemExit("no page target on port %d" % port)
    return pages[0]["webSocketDebuggerUrl"]


class Diag:
    def __init__(self, port):
        self.ws = websocket.create_connection(find_page(port), timeout=30, suppress_origin=True)
        self.mid = 0
        self.log = []

    def cmd(self, method, **params):
        self.mid += 1
        mid = self.mid
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError("%s -> %s" % (method, json.dumps(msg["error"])))
                return msg.get("result", {})
            self._record(msg)

    def _record(self, msg):
        method = msg.get("method")
        params = msg.get("params", {})
        if method == "Runtime.exceptionThrown":
            det = params.get("exceptionDetails", {})
            exc = det.get("exception", {}) or {}
            self.log.append({
                "kind": "exception",
                "text": det.get("text"),
                "desc": exc.get("description") or exc.get("value"),
                "url": det.get("url"),
                "line": det.get("lineNumber"),
                "col": det.get("columnNumber"),
                "stack": (det.get("stackTrace", {}) or {}).get("callFrames", [])[:6],
            })
        elif method == "Runtime.consoleAPICalled":
            self.log.append({
                "kind": "console:" + str(params.get("type")),
                "text": " ".join(str(a.get("value", a.get("description", ""))) for a in params.get("args", [])),
            })
        elif method == "Log.entryAdded":
            e = params.get("entry", {})
            self.log.append({"kind": "log:" + str(e.get("level")), "text": e.get("text")})

    def drain(self, seconds=1.5):
        self.ws.settimeout(seconds)
        try:
            while True:
                self._record(json.loads(self.ws.recv()))
        except Exception:
            pass
        finally:
            self.ws.settimeout(30)

    def eval(self, expr):
        r = self.cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if r.get("exceptionDetails"):
            return {"__exception": json.dumps(r["exceptionDetails"])[:500]}
        return r.get("result", {}).get("value")

    def snap(self):
        return self.eval(
            "(() => JSON.stringify({"
            " app: !!document.querySelector('.app-shell'),"
            " rootChildren: document.getElementById('root') ? document.getElementById('root').children.length : -1,"
            " files: !!document.querySelector('.b-files'),"
            " emptyEditor: !!document.querySelector('.editor-empty'),"
            " nav: document.querySelectorAll('.a-nav-item').length,"
            " themecards: document.querySelectorAll('.a-themecard').length,"
            " textLen: (document.body.innerText||'').length,"
            " head: (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,90)"
            "}))()"
        )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9223)
    ap.add_argument("--base", default="http://localhost:5183")
    ap.add_argument("--theme", default="dark")
    ap.add_argument("--click", default="")
    ap.add_argument("--html", action="store_true", help="dump first 600 chars of body HTML after the action")
    args = ap.parse_args()

    d = Diag(args.port)
    d.cmd("Page.enable")
    d.cmd("Runtime.enable")
    d.cmd("Log.enable")
    d.cmd("Emulation.setDeviceMetricsOverride", width=1600, height=1000,
          deviceScaleFactor=1, mobile=False)
    d.cmd("Page.navigate", url="%s/preview.html?theme=%s" % (args.base, args.theme))

    deadline = time.time() + 25
    ready = False
    while time.time() < deadline:
        time.sleep(0.3)
        if d.eval("!!document.querySelector('.app-shell')"):
            ready = True
            break
    d.drain(1.0)
    print("READY %s" % ready)
    print("BEFORE %s" % d.snap())

    if args.click:
        print("CLICK %s -> %s" % (args.click, d.eval(
            "(() => { const el=document.querySelector(%s); if(!el) return 'MISSING';"
            " el.click(); return 'CLICKED'; })()" % json.dumps(args.click))))
        time.sleep(1.6)
        d.drain(1.5)
        print("AFTER  %s" % d.snap())
        if args.html:
            html = d.eval("document.body.innerHTML.slice(0,600)")
            print("HTML   %s" % html)

    print("---- page log (%d entries) ----" % len(d.log))
    for entry in d.log:
        if entry["kind"] == "exception":
            print("[EXCEPTION] %s" % entry.get("text"))
            print("   desc: %s" % str(entry.get("desc"))[:1200])
            print("   at %s:%s:%s" % (entry.get("url"), entry.get("line"), entry.get("col")))
            for fr in entry.get("stack") or []:
                print("   in %s (%s:%s)" % (fr.get("functionName"), fr.get("url"), fr.get("lineNumber")))
        else:
            print("[%s] %s" % (entry["kind"], str(entry["text"])[:1200]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())