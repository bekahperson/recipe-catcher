#!/usr/bin/env python3
"""Generate the store screenshots from one template.

Originally only screenshot-03 had a source; 01 and 02 existed solely as 1280x800
rasters from an external tool, which is why 03's headline overflow could not be
corrected without a redraw and why neither could be re-exported at a higher
resolution. This renders all three from the same markup instead.

Two output sets, because the stores want different things:
  chrome/ 1280x800  — the Chrome Web Store accepts ONLY 1280x800 or 640x400,
                      and rejects PNGs with an alpha channel
  amo/    2400x1500 — AMO recommends up to 2400x1800 and asks for a 1.6:1
                      ratio; 2400x1500 is exactly 1.6:1 and 1.875x of 1280x800,
                      so the same layout renders sharp at device scale 1.875
                      rather than being upscaled

Colours in both themes are sampled from the original screenshots; the amounts
are what extension/units.js actually renders in each system.

Usage:  ./store/screenshots/src/make-screenshots.py [--chrome] [--amo]
        (no flag = both)
"""
import os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.dirname(os.path.dirname(HERE))   # the store/ directory
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

LIGHT = dict(bg="#ece5db", card="#ffffff", fg="#23201d", muted="#7a746c",
             accent="#b4513a", panel="#faf8f5", border="#e7e2da", rule="#efe9e0",
             brand="#4a453f", inactive="#5c5751", track="#f5f1ea", tile="#f5f1ea",
             onfg="#ffffff", shadow="rgba(35,32,29,.13)")
DARK = dict(bg="#0f0e0c", card="#221f1c", fg="#f0ece5", muted="#a49d93",
            accent="#e0785f", panel="#1a1815", border="#35312c", rule="#35312c",
            brand="#c9c2b8", inactive="#a49d93", track="#2a2622", tile="#2a2622",
            onfg="#191715", shadow="rgba(0,0,0,.45)")

METRIC = ["168 g blanched almond flour", "120 g powdered sugar",
          "3 large egg whites (100 g)", "100 g granulated sugar"]
IMPERIAL = ["5.9 oz blanched almond flour", "4.2 oz powdered sugar",
            "3 large egg whites (3.5 oz)", "3.5 oz granulated sugar"]

BULLETS = ["Metric or imperial in a click", "A tickable shopping list",
           "Estimated nutrition per serving"]

VARIANTS = [
    dict(n=1, theme=LIGHT, head="Just the recipe.",
         sub="No ads. No pop-ups. No life story.", units="Metric", ings=METRIC),
    dict(n=2, theme=DARK, head="Cook, don't scroll.",
         sub="The clean version of any recipe page.", units="Metric", ings=METRIC),
    dict(n=3, theme=LIGHT, head="Clean and simple.",
         sub="Convert, scale, shop, and print.", units="Imperial", ings=IMPERIAL),
]

TEMPLATE = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
  :root{{--bg:{bg};--card:{card};--fg:{fg};--muted:{muted};--accent:{accent};
        --panel:{panel};--border:{border};--rule:{rule};}}
  *{{box-sizing:border-box;margin:0;padding:0;}}
  html,body{{width:1280px;height:800px;overflow:hidden;}}
  body{{background:var(--bg);color:var(--fg);
       font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;
       -webkit-font-smoothing:antialiased;}}
  .serif{{font-family:"Playfair Display",Georgia,serif;font-weight:700;}}
  .left{{position:absolute;left:64px;top:186px;width:548px;}}
  .left h1{{font-size:60px;line-height:1.06;letter-spacing:-.015em;}}
  .sub{{margin-top:14px;font-size:24px;letter-spacing:.015em;color:var(--muted);}}
  ul{{margin-top:22px;padding-left:2px;list-style:none;}}
  li{{display:flex;align-items:center;gap:14px;font-size:24px;line-height:1;
     letter-spacing:.015em;margin-bottom:27px;}}
  li:last-child{{margin-bottom:0;}}
  .dot{{width:14px;height:14px;border-radius:50%;background:var(--accent);flex:0 0 14px;}}
  .card{{position:absolute;left:654px;top:62px;width:536px;height:680px;
        background:var(--card);border-radius:20px;
        box-shadow:0 18px 44px {shadow};padding:27px;}}
  .chead{{display:flex;align-items:center;justify-content:space-between;
         padding-bottom:20px;border-bottom:1px solid var(--rule);}}
  .brand{{font-size:17px;font-weight:600;color:{brand};}}
  .toggle{{display:flex;background:{track};border-radius:999px;padding:4px;}}
  .toggle span{{font-size:13px;font-weight:600;padding:7px 15px;border-radius:999px;color:{inactive};}}
  .toggle .on{{background:var(--accent);color:{onfg};}}
  .rtitle{{margin-top:22px;font-size:31px;line-height:1.15;}}
  .meta{{margin-top:7px;font-size:15px;color:var(--muted);}}
  .times{{display:flex;margin-top:26px;}}
  .times>div{{width:107px;}}
  .times .lbl{{font-size:11px;font-weight:600;letter-spacing:.09em;color:var(--muted);}}
  .times .val{{margin-top:6px;font-size:17px;font-weight:700;}}
  .sechead{{margin-top:26px;font-size:13px;font-weight:700;letter-spacing:.09em;color:var(--accent);}}
  .ing{{margin-top:14px;list-style:none;}}
  .ing li{{font-size:16px;margin-bottom:20px;gap:16px;}}
  .ing .dot{{width:7px;height:7px;flex:0 0 7px;}}
  .nutri{{position:absolute;left:27px;right:27px;bottom:27px;background:var(--panel);
         border:1px solid var(--border);border-radius:14px;padding:18px 20px;}}
  .nutri .h{{font-size:13px;font-weight:700;letter-spacing:.09em;color:var(--accent);}}
  .cal{{display:flex;align-items:baseline;gap:9px;margin-top:6px;}}
  .cal b{{font-size:41px;font-weight:700;letter-spacing:-.02em;}}
  .cal span{{font-size:13px;color:var(--muted);}}
  .tiles{{display:flex;gap:12px;margin-top:14px;}}
  .tile{{flex:1;background:{tile};border:1px solid var(--border);border-radius:10px;
        padding:11px 0;text-align:center;}}
  .tile b{{display:block;font-size:15px;font-weight:700;}}
  .tile span{{font-size:12px;color:var(--muted);}}
</style></head>
<body>
  <div class="left">
    <h1 class="serif">{head}</h1>
    <p class="sub">{sub}</p>
    <ul>{bullets}</ul>
  </div>
  <div class="card">
    <div class="chead">
      <div class="brand">Recipe Catcher</div>
      <div class="toggle"><span class="{impcls}">Imperial</span><span class="{metcls}">Metric</span></div>
    </div>
    <div class="rtitle serif">French Macaron Recipe</div>
    <div class="meta">By John Kanell &middot; Makes 36</div>
    <div class="times">
      <div><div class="lbl">PREP</div><div class="val">50 min</div></div>
      <div><div class="lbl">COOK</div><div class="val">20 min</div></div>
      <div><div class="lbl">TOTAL</div><div class="val">110 min</div></div>
    </div>
    <div class="sechead">INGREDIENTS</div>
    <ul class="ing">{ings}</ul>
    <div class="nutri">
      <div class="h">NUTRITION</div>
      <div class="cal"><b>110</b><span>cal / serving</span></div>
      <div class="tiles">
        <div class="tile"><b>2 g</b><span>Protein</span></div>
        <div class="tile"><b>6 g</b><span>Fat</span></div>
        <div class="tile"><b>12 g</b><span>Carbs</span></div>
      </div>
    </div>
  </div>
</body></html>
"""


def build_html(v):
    t = v["theme"]
    return TEMPLATE.format(
        head=v["head"], sub=v["sub"],
        bullets="".join(f'<li><i class="dot"></i>{b}</li>' for b in BULLETS),
        ings="".join(f'<li><i class="dot"></i>{i}</li>' for i in v["ings"]),
        impcls="on" if v["units"] == "Imperial" else "",
        metcls="on" if v["units"] == "Metric" else "",
        **t)


def render(html, out, scale):
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, "s.html")
        open(page, "w").write(html)
        cmd = [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
               "--virtual-time-budget=8000", "--window-size=1280,800",
               f"--screenshot={out}", f"file://{page}"]
        if scale != 1:
            cmd.insert(-1, f"--force-device-scale-factor={scale}")
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)


def main():
    args = sys.argv[1:]
    do_chrome = not args or "--chrome" in args
    do_amo = not args or "--amo" in args
    for v in VARIANTS:
        html = build_html(v)
        open(os.path.join(HERE, f"screenshot-{v['n']:02d}.html"), "w").write(html)
        if do_chrome:
            d = os.path.join(STORE, "screenshots", "chrome"); os.makedirs(d, exist_ok=True)
            p = os.path.join(d, f"screenshot-{v['n']:02d}-1280x800.png")
            render(html, p, 1); print(f"  {os.path.relpath(p, STORE)}  1280x800")
        if do_amo:
            d = os.path.join(STORE, "screenshots", "amo"); os.makedirs(d, exist_ok=True)
            p = os.path.join(d, f"screenshot-{v['n']:02d}-2400x1500.png")
            render(html, p, 1.875); print(f"  {os.path.relpath(p, STORE)}  2400x1500")
    return 0


if __name__ == "__main__":
    sys.exit(main())
