"""Generate the character theme blocks for frontend/app/globals.css.

    python tools/character_themes.py > /tmp/themes.css

Each theme takes its hue from the character colour; every text and accent
token is raised until it clears WCAG AA (4.5:1) against the card and hover
surfaces, and the report at the end lists the weakest ratio per theme.
frontend/lib/character-themes.test.ts re-checks the committed CSS.
"""

import colorsys, json, sys

def hex_to_rgb(h): h=h.lstrip("#"); return tuple(int(h[i:i+2],16)/255 for i in (0,2,4))
def rgb_to_hex(r,g,b): return "#%02x%02x%02x" % tuple(max(0,min(255,round(c*255))) for c in (r,g,b))
def lum(h):
    def ch(c): return c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    r,g,b=hex_to_rgb(h); return 0.2126*ch(r)+0.7152*ch(g)+0.0722*ch(b)
def contrast(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
def hsl(h,s,l): return rgb_to_hex(*colorsys.hls_to_rgb(h/360, l, s))
def hue_of(hexc):
    r,g,b=hex_to_rgb(hexc); hh,ll,ss=colorsys.rgb_to_hls(r,g,b); return hh*360, ss, ll
def lighten_until(hexc, against, target, step=0.01, up=True):
    hh,ss,ll=hue_of(hexc); l=ll
    for _ in range(120):
        c=hsl(hh,ss,l)
        if all(contrast(c,a)>=target for a in against): return c
        l = l+step if up else l-step
        l=max(0.0,min(1.0,l))
    return hsl(hh,ss,l)

CHARS = {
    "ironclad": ("#d53b27", 4, 0.30),
    "silent": ("#23935b", 150, 0.30),
    "defect": ("#3873a9", 210, 0.34),
    "necrobinder": ("#bf5a85", 318, 0.26),
    "regent": ("#f07c1e", 28, 0.30),
}
STATUS = {"--success":"#34d399","--danger":"#f87171","--warning":"#fbbf24","--info":"#38bdf8","--special":"#c084fc","--accent-teal":"#45cfd8"}
out=[]; report=[]
for name,(base,hue,sat) in CHARS.items():
    bg=hsl(hue,sat,0.055); bg2=hsl(hue,sat,0.08); card=hsl(hue,sat,0.11); hover=hsl(hue,sat,0.15)
    border=hsl(hue,sat*0.8,0.20); border_acc=hsl(hue,sat*0.8,0.28)
    text=lighten_until(hsl(hue,0.18,0.86),[hover],7.0)
    text2=lighten_until(hsl(hue,0.14,0.74),[hover],5.5)
    muted=lighten_until(hsl(hue,0.12,0.66),[hover],4.6)
    accent=lighten_until(base,[card,hover],4.6)
    accent_light=lighten_until(accent,[card],5.5)
    on_accent=bg if contrast(bg,accent)>=4.5 else "#000000"
    glow_h=hue
    css=f''':root[data-theme="{name}"] {{
  --bg-primary: {bg};
  --bg-secondary: {bg2};
  --bg-card: {card};
  --bg-card-hover: {hover};
  --scrim: #000000;
  --text-primary: {text};
  --text-secondary: {text2};
  --text-muted: {muted};
  --text-on-accent: {on_accent};
  --text-on-fill: #ffffff;
  --border-subtle: {border};
  --border-accent: {border_acc};
  --accent-gold: {accent};
  --accent-gold-light: {accent_light};
  --shadow-card: none;
}}'''
    out.append(css)
    checks={
        "text/hover":contrast(text,hover),"text2/hover":contrast(text2,hover),"muted/hover":contrast(muted,hover),
        "muted/card":contrast(muted,card),"accent/card":contrast(accent,card),"accent/hover":contrast(accent,hover),
        "on-accent/accent":contrast(on_accent,accent),"accent-light/card":contrast(accent_light,card),
    }
    for k,v in STATUS.items(): checks[k+"/card"]=contrast(v,card)
    worst=min(checks.values())
    report.append((name, accent, round(worst,2), {k:round(v,2) for k,v in checks.items() if v<4.6}))
print("\n\n".join(out))
print("/*REPORT*/")
for r in report: print(r)
