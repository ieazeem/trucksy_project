"""Build demo/trucksy-dashboard-demo.html: the real dispatch console (same HTML/CSS/JS as backend/)
wired to an in-browser demo API (demo-api.js), in ONE file you can open by double-clicking.

    python demo/build_demo.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACK = ROOT / "backend"
OUT = ROOT / "demo" / "trucksy-dashboard-demo.html"
LAND = ROOT / "demo" / "bahrain-land.json"

html = (BACK / "templates/dashboard/app.html").read_text()
truck_svg = (BACK / "templates/dashboard/_truck.svg").read_text().strip()
css = (BACK / "static/dashboard/trucksy.css").read_text()
leaflet_css = (BACK / "static/vendor/leaflet/leaflet.css").read_text()
app_js = (BACK / "static/dashboard/app.js").read_text()
demo_js = (ROOT / "demo/demo-api.js").read_text()
land = LAND.read_text()

# --- template tags -> static values
html = html.replace("{% load static %}", "")
html = html.replace('{% include "dashboard/_truck.svg" %}', truck_svg)
html = html.replace("{{ request.user.get_full_name|default:request.user.username }}", "Ops Manager")
html = re.sub(r"\{% csrf_token %\}", "", html)
html = html.replace("{% url 'logout' %}", "#")
body = html[html.index("<body>") + 6: html.index("<script src=")]

# The map: no external tiles in a standalone file, so draw Bahrain's coastline from bundled GeoJSON.
app_js = re.sub(
    r"function tiles\(\) \{.*?\n  \}\n",
    """function tiles() {
    return L.geoJSON(window.TRUCKSY_LAND, { interactive: false,
      style: { color: "#4a4f55", weight: 1, fillColor: "#2e3033", fillOpacity: 1 } });
  }
""",
    app_js, count=1, flags=re.S,
)
assert "TRUCKSY_LAND" in app_js

demo_ui = """
<div class="demo-bar" role="note">
  <strong>Demo</strong> — sample Bahrain data running in your browser. Trucks move by themselves; try <em>New load</em>,
  assign a waiting load to Rashid, or open <em>Drivers → Route history</em>. Reload to start over.
  <button type="button" class="demo-close" aria-label="Hide demo notice" onclick="this.parentElement.hidden=true">×</button>
</div>
"""
demo_css = """
.demo-bar { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 1500; max-width: min(760px, calc(100vw - 32px));
  background: #000; color: #e5e7eb; border: 1px solid #34d399; border-radius: 10px; padding: 9px 14px; font-size: 13px;
  box-shadow: 0 0 18px rgba(52,211,153,.35); }
.demo-bar strong { color: #34d399; margin-right: 4px; }
.demo-bar { padding-right: 40px; }
.demo-close { position: absolute; top: 4px; right: 6px; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: #c9cdd2; font-size: 20px; cursor: pointer; }
.demo-close:hover { color: #34d399; }
#map, #drawer-map { background: #141618 !important; }
@media (max-width: 820px) { .demo-bar { bottom: 78px; } }
"""
demo_guard = """
// Demo only: real downloads and server pages are not available in a standalone file.
document.addEventListener("click", (e) => {
  const a = e.target.closest("a, form button");
  if (!a) return;
  const href = a.getAttribute && a.getAttribute("href") || "";
  const msg = a.hasAttribute("download") ? "In the live app this downloads the Excel file."
    : href.includes("/t/") ? "In the live app this opens the customer tracking page."
    : href === "/admin/" ? "In the live app this opens the admin back office."
    : a.closest("form[action='#']") ? "In the live app this signs you out." : null;
  if (msg) { e.preventDefault(); e.stopPropagation();
    const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(window.__dt); window.__dt = setTimeout(() => t.classList.remove("show"), 2600); }
}, true);
"""

page = f"""<title>Trucksy Dispatch Demo</title>
<style>
{leaflet_css}
{css}
{demo_css}
</style>
{body}
{demo_ui}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>window.TRUCKSY_LAND = {land};</script>
<script>
{demo_js}
</script>
<script>
{demo_guard}
</script>
<script>
{app_js}
</script>
"""
OUT.write_text(page)
print(f"wrote {OUT} ({len(page) // 1024} KB)")
