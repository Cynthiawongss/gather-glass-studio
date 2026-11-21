# Writes shots.json: each shot seeds one of the drafts in pieces/ (made by hand in the live app) and captures it.
import json, pathlib
here = pathlib.Path(__file__).parent
def seed(name):
    d = (here / 'pieces' / f'{name}.json').read_text()
    return f"localStorage.setItem('gather.draft', {json.dumps(d)}); localStorage.setItem('gather.lang','en');"
ready = "window.__glass && document.getElementById('coach').textContent.length > 0"
done = "document.body.dataset.mode === 'done'"
finish = [{"until": ready}, {"wait": 1200}, {"click": "#finishBtn"}, {"until": done}, {"wait": 2500}]
# Drag down on the finished piece to look at it a little more from above (the app's own turn-and-tilt drag).
def look_down(px):
    return ("(async () => { const c = document.getElementById('stage'); const x = innerWidth / 2, y = innerHeight / 2;"
            " const e = (t, yy) => c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: yy, button: 0, buttons: 1, pointerId: 3, bubbles: true }));"
            f" e('pointerdown', y); for (let i = 1; i <= 10; i++) {{ e('pointermove', y + {px} * i / 10); await new Promise(r => setTimeout(r, 30)); }} e('pointerup', y + {px}); }})()")
def keep(name): return [{"type": "#nameInput", "text": name}, {"click": "#saveBtn"}, {"wait": 1500}]
shots = [
  {"url": "http://127.0.0.1:8013/", "out": "../docs/01-tree-workshop.jpg", "setup": "localStorage.clear(); " + seed('tree'), "until": ready, "wait": 2500},
  {"url": "http://127.0.0.1:8013/", "out": "../docs/02-vessel-hot.jpg", "setup": seed('vessel'), "until": ready, "wait": 2000},
  {"url": "http://127.0.0.1:8013/", "out": "../docs/03-vessel-cooled.jpg", "setup": seed('vessel'), "steps": finish},
  {"url": "http://127.0.0.1:8013/", "out": "../docs/04-tree-cooled.jpg", "setup": seed('tree'), "steps": finish},
  {"url": "http://127.0.0.1:8013/", "out": "../docs/05-flower-cooled.jpg", "setup": seed('flower'), "steps": finish + [look_down(70), {"wait": 1500}]},
]
json.dump({"defaults": {"size": "1440x1000", "scale": 2, "lang": "en-US", "still": False, "timeout": 120000, "hide": ".reticle, #toast"}, "shots": shots},
          open(here / 'shots.json', 'w'), indent=1)
print('shots.json written')

# Cover material: the same pieces with the interface hidden, so the cover can crop them freely.
ui = ".top, .kinds, .tray, .thermo, .dock, .reticle, #toast"
panels = [
  {"url": "http://127.0.0.1:8013/", "out": "panel-hot.jpg", "setup": "localStorage.clear(); " + seed('vessel'), "until": ready, "wait": 2000},
  {"url": "http://127.0.0.1:8013/", "out": "panel-vessel.jpg", "setup": seed('vessel'), "steps": finish},
  {"url": "http://127.0.0.1:8013/", "out": "panel-tree.jpg", "setup": seed('tree'), "steps": finish},
  {"url": "http://127.0.0.1:8013/", "out": "panel-flower.jpg", "setup": seed('flower'), "steps": finish + [look_down(70), {"wait": 1500}]},
]
json.dump({"defaults": {"size": "1440x1000", "scale": 2, "lang": "en-US", "still": False, "timeout": 120000, "hide": ui}, "shots": panels},
          open(here / 'cover-panels.json', 'w'), indent=1)
print('cover-panels.json written')
