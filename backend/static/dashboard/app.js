/* Trucksy dispatch console — plain JavaScript, no build step. */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const TZ = "Asia/Bahrain";
  const STAGES = ["assigned", "to_pickup", "loaded", "in_transit", "delivered"];
  const STATUS_LABEL = {
    pending: "Waiting", assigned: "Assigned", to_pickup: "Heading to pickup", loaded: "Loaded",
    in_transit: "In transit", delivered: "Delivered", cancelled: "Cancelled",
    available: "Available", on_job: "On a job", offline: "Offline", break: "On break",
  };

  const state = { view: "overview", dash: null, drivers: [], trucks: [], loadFilter: "", loadQuery: "", loadFrom: "", loadTo: "", lastOk: 0 };

  // ---------- helpers ----------
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const csrf = () => (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
  const money = (n) => Number(n || 0).toLocaleString("en-BH", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const money0 = (n) => Number(n || 0).toLocaleString("en-BH", { maximumFractionDigits: 0 });
  const fmtTime = (d) => d ? new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "—";
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ }) : "—";
  const fmtDT = (d) => d ? `${fmtDate(d)}, ${fmtTime(d)}` : "—";
  const ago = (d) => {
    if (!d) return "Never";
    const s = Math.max(0, (Date.now() - new Date(d)) / 1000);
    if (s < 60) return "Just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return fmtDate(d);
  };
  const daysUntil = (d) => d ? Math.round((new Date(d) - new Date()) / 86400000) : null;
  // Bahrain calendar day, offset in days from today, as YYYY-MM-DD
  const isoDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: TZ });
  const chip = (st, label) => `<span class="chip st-${esc(st)}">${esc(label || STATUS_LABEL[st] || st)}</span>`;
  const plate = (t) => t ? `<span class="plate">${esc(t.plate_number)}</span>` : `<span class="sub">No truck</span>`;
  const expiry = (d) => {
    if (!d) return `<span class="sub">Not set</span>`;
    const n = daysUntil(d);
    if (n < 0) return `<span class="warn">Expired ${fmtDate(d)}</span>`;
    if (n <= 30) return `<span class="warn">${fmtDate(d)} (${n} days)</span>`;
    return esc(fmtDate(d));
  };

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  async function api(path, opts = {}) {
    const res = await fetch(`/api/${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401 || res.status === 403) { location.href = "/login/?next=/"; throw new Error("auth"); }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data && (data.detail || Object.entries(data).map(([k, v]) => `${k.replace(/_/g, " ")}: ${[].concat(v).join(" ")}`).join(" · "));
      throw new Error(msg || `Request failed (${res.status})`);
    }
    return data;
  }

  // ---------- the road strip ----------
  function roadStrip(load) {
    const idx = Math.max(0, STAGES.indexOf(load.status));
    // Truck sits between stops: heading to pickup = 1/8, loaded = at pickup (1/4)… delivered = end.
    const pos = { assigned: 4, to_pickup: 14, loaded: 28, in_transit: 62, delivered: 96 }[load.status] ?? 4;
    const plateTxt = load.truck ? load.truck.plate_number : (load.driver ? load.driver.full_name.split(" ")[0] : "—");
    return `
      <div class="road" role="img" aria-label="${esc(STATUS_LABEL[load.status])}, step ${idx + 1} of ${STAGES.length}">
        <div class="road-done" style="width:${pos}%"></div>
        <span class="road-stop" style="left:28%"></span>
        <span class="road-stop" style="left:96%"></span>
        <span class="road-truck" style="left:${Math.min(Math.max(pos, 7), 92)}%">${esc(plateTxt)}</span>
      </div>
      <div class="road-ends"><span>${esc(load.pickup_address)}</span><span>${esc(load.dropoff_address)}</span></div>`;
  }

  // ---------- map ----------
  let map, truckLayer, routeLayer;
  const BAHRAIN = [26.17, 50.56];
  function tiles() {
    return L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, subdomains: "abcd",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    });
  }
  function initMap() {
    map = L.map("map", { zoomControl: true, scrollWheelZoom: true }).setView(BAHRAIN, 11);
    tiles().addTo(map);
    truckLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
  }
  function truckIcon(d) {
    const cls = d.status === "offline" || !d.is_live ? "offline" : d.status === "on_job" ? "" : "idle";
    const label = d.truck ? d.truck.plate_number : d.full_name.split(" ")[0];
    return L.divIcon({ className: "pin-wrap", html: `<span class="truck-pin ${cls}">${esc(label)}</span>`, iconSize: [0, 0] });
  }
  let fitted = false;
  function drawTrucks(drivers, loads) {
    truckLayer.clearLayers();
    routeLayer.clearLayers();
    const pts = [];
    const byDriver = Object.fromEntries(loads.filter((l) => l.driver).map((l) => [l.driver.id, l]));
    drivers.filter((d) => d.last_lat != null).forEach((d) => {
      const ld = byDriver[d.id];
      const m = L.marker([d.last_lat, d.last_lng], { icon: truckIcon(d), keyboard: true, title: d.full_name });
      m.bindPopup(`<strong>${esc(d.full_name)}</strong><br>${chip(d.status, d.status_label)}<br>
        ${ld ? `<a href="#" data-open-load="${ld.id}">${esc(ld.reference)}</a> → ${esc(ld.dropoff_address)}<br>` : ""}
        <span class="sub">${d.last_speed_kmh ? Math.round(d.last_speed_kmh) + " km/h · " : ""}${ago(d.last_seen)}</span>`);
      m.addTo(truckLayer);
      pts.push([d.last_lat, d.last_lng]);
      if (ld) {
        const dest = ld.status === "in_transit" || ld.status === "loaded" ? [ld.dropoff_lat, ld.dropoff_lng] : [ld.pickup_lat, ld.pickup_lng];
        if (dest[0] != null) {
          L.polyline([[d.last_lat, d.last_lng], dest], { color: "#34d399", weight: 2, dashArray: "6 6", opacity: 0.8 }).addTo(routeLayer);
          L.marker(dest, { icon: L.divIcon({ className: "pin-wrap", html: `<div class="place-pin ${ld.status === "in_transit" || ld.status === "loaded" ? "drop" : ""}"></div>`, iconSize: [14, 14] }) }).addTo(routeLayer);
        }
      }
    });
    if (!fitted && pts.length) { map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 }); fitted = true; }
    $("#map-meta").textContent = `${pts.length} trucks reporting`;
  }

  // ---------- overview ----------
  function renderOverview(d) {
    const k = d.kpis;
    $("#k-live").innerHTML = `${k.drivers_live}<small>/ ${k.drivers_total}</small>`;
    $("#k-active").textContent = k.loads_active;
    $("#k-pending").textContent = k.loads_pending;
    $("#k-delivered").textContent = k.delivered_today;
    $("#k-revenue").innerHTML = `${money0(k.revenue_today)}<small>BHD</small>`;

    const trips = d.active_loads;
    $("#trip-count").textContent = trips.length ? `${trips.length} jobs` : "";
    $("#trip-list").innerHTML = trips.length ? trips.map((l) => `
      <div class="trip" tabindex="0" data-open-load="${l.id}">
        <div class="trip-top"><span class="trip-ref">${esc(l.reference)}</span><span class="trip-cust">${esc(l.customer_name)}</span>${chip(l.status, l.status_label)}</div>
        ${roadStrip(l)}
      </div>`).join("")
      : `<div class="empty">No trucks on a job right now. Create a load and assign a driver to get one moving.</div>`;

    drawTrucks(d.drivers, trips);

    // 7-day chart
    const max = Math.max(1, ...d.trend.map((t) => t.deliveries));
    $("#bars").innerHTML = d.trend.map((t, i) => {
      const day = new Date(t.date + "T12:00:00");
      const label = i === d.trend.length - 1 ? "Today" : day.toLocaleDateString("en-GB", { weekday: "short" });
      return `<div class="bar-col" title="${t.deliveries} deliveries · ${money(t.revenue)} BHD">
        <span class="bar-n">${t.deliveries}</span>
        <div class="bar ${i === d.trend.length - 1 ? "today" : ""}" style="height:${(t.deliveries / max) * 100}%"></div>
        <span class="bar-day">${label}</span></div>`;
    }).join("");
    const weekRev = d.trend.reduce((a, t) => a + t.revenue, 0);
    const weekN = d.trend.reduce((a, t) => a + t.deliveries, 0);
    $("#chart-foot").innerHTML = `<span><b>${weekN}</b> deliveries</span><span><b>${money0(weekRev)}</b> BHD revenue</span><span><b>${weekN ? money(weekRev / weekN) : "0"}</b> BHD per job</span>`;

    $("#log").innerHTML = d.events.length ? d.events.map((e) => `
      <li><time>${fmtTime(e.created_at)}</time>
        <div><a href="#" data-open-load-ref="${esc(e.reference)}">${esc(e.reference)}</a> ${esc(e.status_label.toLowerCase())}
        <div class="who">${esc(e.by)}${e.note ? " — " + esc(e.note) : ""}</div></div></li>`).join("")
      : `<li><span></span><span class="sub">Job updates from drivers will appear here.</span></li>`;
  }

  async function refreshDashboard() {
    try {
      const d = await api("dashboard/");
      state.dash = d;
      state.drivers = d.drivers;
      state.lastOk = Date.now();
      if (state.view === "overview") renderOverview(d);
    } catch (e) {
      if (e.message !== "auth") console.warn(e);
    }
    $("#live-dot").classList.toggle("stale", Date.now() - state.lastOk > 30000);
  }

  // ---------- loads ----------
  let loadsSeq = 0;
  async function renderLoads() {
    const seq = ++loadsSeq; // ignore answers to older requests that arrive late
    const params = new URLSearchParams();
    if (state.loadFilter) params.set("status", state.loadFilter);
    if (state.loadQuery) params.set("q", state.loadQuery);
    if (state.loadFrom) params.set("from", state.loadFrom);
    if (state.loadTo) params.set("to", state.loadTo);
    // The Excel button always downloads exactly what the table shows.
    const xl = new URLSearchParams(params);
    if (!state.loadFrom && !state.loadTo) { xl.set("from", isoDay(-29)); xl.set("to", isoDay(0)); }
    $("#dl-loads").href = `/api/reports/loads.xlsx?${xl}`;
    const loads = await api(`loads/?${params}`);
    if (seq !== loadsSeq) return;
    $("#loads-body").innerHTML = loads.length ? loads.map((l) => `
      <tr class="clickable" tabindex="0" data-open-load="${l.id}">
        <td><strong>${esc(l.reference)}</strong><div class="sub">${esc(l.customer_name)}</div></td>
        <td>${esc(l.pickup_address)}<div class="sub">to ${esc(l.dropoff_address)}</div></td>
        <td>${l.driver ? esc(l.driver.full_name) : `<span class="sub">Unassigned</span>`}${l.truck ? `<div class="sub">${esc(l.truck.plate_number)}</div>` : ""}</td>
        <td>${chip(l.status, l.status_label)}</td>
        <td class="num">${Number(l.weight_kg).toLocaleString()} kg</td>
        <td class="num">${money(l.price)}</td>
        <td>${fmtDT(l.scheduled_pickup)}</td>
      </tr>`).join("")
      : `<tr><td colspan="7" class="empty">No loads match. Try another filter, or create a new load.</td></tr>`;
  }

  // ---------- drivers ----------
  async function renderDrivers() {
    const drivers = await api("drivers/");
    state.drivers = drivers;
    $("#drivers-body").innerHTML = drivers.length ? drivers.map((d) => `
      <tr${d.is_active ? "" : ' style="opacity:.5"'}>
        <td><strong>${esc(d.full_name)}</strong><div class="sub">CPR ${esc(d.cpr || "—")}</div></td>
        <td>${esc(d.phone)}</td>
        <td>${plate(d.truck)}</td>
        <td>${d.is_active ? chip(d.is_live ? d.status : "offline", d.is_live ? d.status_label : "Offline") : chip("cancelled", "Deactivated")}</td>
        <td>${ago(d.last_seen)}</td>
        <td>${expiry(d.license_expiry)}</td>
        <td style="white-space:nowrap">${d.is_active ? `<button class="btn btn-sm" data-route-history="${d.id}">Route history</button> <button class="btn btn-sm" data-reset-pin="${d.id}">Reset PIN</button>` : `<button class="btn btn-sm" data-route-history="${d.id}">Route history</button>`}</td>
      </tr>`).join("")
      : `<tr><td colspan="7" class="empty">No drivers yet. Add your first driver to give them app access.</td></tr>`;
  }

  // ---------- fleet ----------
  async function renderFleet() {
    const trucks = await api("trucks/");
    state.trucks = trucks;
    $("#trucks-body").innerHTML = trucks.length ? trucks.map((t) => `
      <tr>
        <td>${plate(t)}</td><td>${esc(t.kind_label)}</td>
        <td>${esc([t.make, t.model].filter(Boolean).join(" ") || "—")}${t.year ? `<div class="sub">${t.year}</div>` : ""}</td>
        <td class="num">${Number(t.capacity_kg).toLocaleString()} kg</td>
        <td>${t.driver_name ? esc(t.driver_name) : `<span class="sub">Unassigned</span>`}</td>
        <td>${expiry(t.registration_expiry)}</td><td>${expiry(t.insurance_expiry)}</td>
      </tr>`).join("")
      : `<tr><td colspan="7" class="empty">No trucks yet. Add a truck to assign it to a driver.</td></tr>`;
  }

  // ---------- load drawer ----------
  let drawerMap;
  async function openLoad(id) {
    const [l, events, route] = await Promise.all([api(`loads/${id}/`), api(`loads/${id}/events/`), api(`loads/${id}/route/`)]);
    if (!state.drivers.length) state.drivers = await api("drivers/");
    $("#d-title").textContent = l.reference;
    $("#d-sub").innerHTML = `${esc(l.customer_name)} &nbsp; ${chip(l.status, l.status_label)}`;
    const canAssign = !["delivered", "cancelled"].includes(l.status);
    const driverOpts = state.drivers.filter((d) => d.is_active).map((d) =>
      `<option value="${d.id}" ${l.driver && l.driver.id === d.id ? "selected" : ""}>${esc(d.full_name)}${d.truck ? " — " + esc(d.truck.plate_number) : ""} (${esc(STATUS_LABEL[d.status])})</option>`).join("");
    $("#drawer-body").innerHTML = `
      ${STAGES.includes(l.status) ? roadStrip(l) : ""}
      <div id="drawer-map"></div>
      <h3>Job</h3>
      <dl class="dl">
        <dt>Pickup</dt><dd>${esc(l.pickup_address)}<div class="sub">${fmtDT(l.scheduled_pickup)}</div></dd>
        <dt>Drop-off</dt><dd>${esc(l.dropoff_address)}</dd>
        <dt>Cargo</dt><dd>${esc(l.cargo_description || "—")} · ${Number(l.weight_kg).toLocaleString()} kg</dd>
        <dt>Price</dt><dd>${money(l.price)} BHD</dd>
        <dt>Customer phone</dt><dd>${l.customer_phone ? `<a href="tel:${esc(l.customer_phone)}">${esc(l.customer_phone)}</a>` : "—"}</dd>
        ${l.notes ? `<dt>Instructions</dt><dd>${esc(l.notes)}</dd>` : ""}
        ${l.proof_receiver_name ? `<dt>Received by</dt><dd>${esc(l.proof_receiver_name)} · ${fmtDT(l.delivered_at)}</dd>` : ""}
      </dl>
      ${canAssign ? `<h3>Driver</h3>
        <div class="assign-row"><label class="sr-only" for="assign-select">Driver</label>
          <select id="assign-select"><option value="">Unassigned</option>${driverOpts}</select>
          <button class="btn btn-primary" id="assign-btn">Save driver</button></div>` : ""}
      <h3>Share with the customer</h3>
      <div class="actions">
        <button class="btn" id="copy-link">Copy tracking link</button>
        <a class="btn" target="_blank" rel="noopener" href="${esc(l.tracking_url)}">Open tracking page</a>
        ${l.customer_phone ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${esc(l.customer_phone.replace(/[^0-9]/g, ""))}?text=${encodeURIComponent(`Your Trucksy delivery ${l.reference} can be tracked here: ${l.tracking_url}`)}">Send on WhatsApp</a>` : ""}
      </div>
      <h3>History</h3>
      <ul class="timeline">${events.slice().reverse().map((e) => `<li><strong>${esc(e.status_label)}</strong> <span class="sub">by ${esc(e.by)}</span>${e.note ? `<div>${esc(e.note)}</div>` : ""}<time>${fmtDT(e.created_at)}</time></li>`).join("")}</ul>
      ${canAssign ? `<div class="actions" style="margin-top:22px"><button class="btn btn-danger" id="cancel-load">Cancel this load</button></div>` : ""}`;

    document.body.classList.add("drawer-open");
    $("#drawer").setAttribute("aria-hidden", "false");
    $("#drawer-close").focus();

    // mini map with the GPS trail
    if (drawerMap) drawerMap.remove();
    drawerMap = L.map("drawer-map", { zoomControl: false, attributionControl: false }).setView(BAHRAIN, 11);
    tiles().addTo(drawerMap);
    const b = [];
    if (l.pickup_lat != null) { L.marker([l.pickup_lat, l.pickup_lng], { icon: L.divIcon({ className: "pin-wrap", html: '<div class="place-pin"></div>', iconSize: [14, 14] }) }).addTo(drawerMap).bindTooltip("Pickup"); b.push([l.pickup_lat, l.pickup_lng]); }
    if (l.dropoff_lat != null) { L.marker([l.dropoff_lat, l.dropoff_lng], { icon: L.divIcon({ className: "pin-wrap", html: '<div class="place-pin drop"></div>', iconSize: [14, 14] }) }).addTo(drawerMap).bindTooltip("Drop-off"); b.push([l.dropoff_lat, l.dropoff_lng]); }
    if (route.length) {
      const line = route.map((p) => [p.lat, p.lng]);
      L.polyline(line, { color: "#34d399", weight: 5, opacity: 0.9 }).addTo(drawerMap);
      L.polyline(line, { color: "#0b0b0b", weight: 1.5, dashArray: "4 4" }).addTo(drawerMap);
      b.push(...line);
    }
    setTimeout(() => { drawerMap.invalidateSize(); if (b.length) drawerMap.fitBounds(b, { padding: [24, 24], maxZoom: 13 }); }, 260);

    $("#copy-link").onclick = async () => {
      try { await navigator.clipboard.writeText(l.tracking_url); toast("Tracking link copied"); }
      catch { prompt("Copy this link", l.tracking_url); }
    };
    const assignBtn = $("#assign-btn");
    if (assignBtn) assignBtn.onclick = async () => {
      const v = $("#assign-select").value;
      try {
        await api(`loads/${l.id}/`, { method: "PATCH", body: { driver_id: v ? Number(v) : null } });
        toast(v ? "Driver assigned" : "Driver removed");
        refreshAll(); openLoad(l.id);
      } catch (e) { toast(e.message); }
    };
    const cancelBtn = $("#cancel-load");
    if (cancelBtn) cancelBtn.onclick = async () => {
      if (!confirm(`Cancel ${l.reference}? The driver will see it removed from their app.`)) return;
      await api(`loads/${l.id}/set_status/`, { method: "POST", body: { status: "cancelled", note: "Cancelled by dispatcher" } });
      toast("Load cancelled"); closeDrawer(); refreshAll();
    };
  }
  // ---------- route history (date range) ----------
  async function openRouteHistory(driverId, from = isoDay(0), to = isoDay(0)) {
    const h = await api(`drivers/${driverId}/history/?from=${from}&to=${to}`);
    const s = h.stats;
    const q = `from=${from}&to=${to}`;
    $("#d-title").textContent = h.driver.full_name;
    $("#d-sub").innerHTML = `Route history${h.driver.truck ? ` · <span class="plate">${esc(h.driver.truck)}</span>` : ""}`;
    $("#drawer-body").innerHTML = `
      <form class="hist-form" id="hist-form">
        <div class="field"><label for="h-from">From</label><input type="date" id="h-from" value="${from}" max="${isoDay(0)}"></div>
        <div class="field"><label for="h-to">To</label><input type="date" id="h-to" value="${to}" max="${isoDay(0)}"></div>
        <button class="btn btn-primary" type="submit">Show route</button>
      </form>
      <div class="quick">
        <button class="btn btn-sm" data-range="0,0">Today</button>
        <button class="btn btn-sm" data-range="-1,-1">Yesterday</button>
        <button class="btn btn-sm" data-range="-6,0">Last 7 days</button>
        <button class="btn btn-sm" data-range="-29,0">Last 30 days</button>
      </div>
      <div class="hist-stats">
        <div><b>${s.km.toLocaleString()} km</b><span>Distance driven</span></div>
        <div><b>${s.deliveries}</b><span>Deliveries</span></div>
        <div><b>${s.points.toLocaleString()}</b><span>GPS points</span></div>
        <div><b>${s.first ? fmtTime(s.first) : "—"}</b><span>First signal${s.first ? " · " + fmtDate(s.first) : ""}</span></div>
        <div><b>${s.last ? fmtTime(s.last) : "—"}</b><span>Last signal${s.last ? " · " + fmtDate(s.last) : ""}</span></div>
        <div><b>${s.max_speed_kmh != null ? Math.round(s.max_speed_kmh) + " km/h" : "—"}</b><span>Top speed</span></div>
      </div>
      ${s.points ? "" : `<p class="sub">No GPS signal from ${esc(h.driver.full_name)} in this period. Pick other dates, or check the driver was online.</p>`}
      ${s.truncated ? `<p class="warn">Showing the first 20,000 points. Pick a shorter period to see the full route.</p>` : ""}
      <div id="drawer-map"></div>
      <div class="actions"><a class="btn" href="/api/reports/drivers/${h.driver.id}/route.xlsx?${q}" download>Download Excel</a></div>
      ${h.deliveries.length ? `<h3>Deliveries</h3><ul class="timeline">${h.deliveries.map((d) =>
        `<li><a href="#" data-open-load-ref="${esc(d.reference)}">${esc(d.reference)}</a> · ${esc(d.dropoff)}<time>${fmtDT(d.at)}</time></li>`).join("")}</ul>` : ""}`;

    document.body.classList.add("drawer-open");
    $("#drawer").setAttribute("aria-hidden", "false");

    $("#hist-form").onsubmit = (e) => { e.preventDefault(); openRouteHistory(driverId, $("#h-from").value, $("#h-to").value); };
    $$("[data-range]").forEach((b) => b.onclick = () => {
      const [a, z] = b.dataset.range.split(",").map(Number);
      openRouteHistory(driverId, isoDay(a), isoDay(z));
    });

    if (drawerMap) drawerMap.remove();
    drawerMap = L.map("drawer-map", { zoomControl: true, attributionControl: false }).setView(BAHRAIN, 11);
    tiles().addTo(drawerMap);
    const line = h.points.map((p) => [p.lat, p.lng]);
    if (line.length) {
      L.polyline(line, { color: "#34d399", weight: 5, opacity: 0.9 }).addTo(drawerMap);
      L.polyline(line, { color: "#0b0b0b", weight: 1.5, dashArray: "4 4" }).addTo(drawerMap);
      L.marker(line[0], { icon: L.divIcon({ className: "pin-wrap", html: '<div class="place-pin"></div>', iconSize: [14, 14] }) })
        .addTo(drawerMap).bindTooltip(`Start ${fmtTime(s.first)}`);
      L.marker(line[line.length - 1], { icon: L.divIcon({ className: "pin-wrap", html: `<span class="truck-pin">${esc(h.driver.truck || "End")}</span>`, iconSize: [0, 0] }) })
        .addTo(drawerMap).bindTooltip(`Last ${fmtTime(s.last)}`);
    }
    h.deliveries.filter((d) => d.lat != null).forEach((d) =>
      L.marker([d.lat, d.lng], { icon: L.divIcon({ className: "pin-wrap", html: '<div class="place-pin drop"></div>', iconSize: [14, 14] }) })
        .addTo(drawerMap).bindTooltip(`${d.reference} delivered ${fmtTime(d.at)}`));
    setTimeout(() => { drawerMap.invalidateSize(); if (line.length) drawerMap.fitBounds(line, { padding: [24, 24], maxZoom: 14 }); }, 260);
  }

  function closeDrawer() {
    document.body.classList.remove("drawer-open");
    $("#drawer").setAttribute("aria-hidden", "true");
  }

  // ---------- forms ----------
  function formJSON(form) {
    const out = {};
    new FormData(form).forEach((v, k) => { if (v !== "") out[k] = v; });
    return out;
  }
  function fillSelect(sel, items, label, first) {
    sel.innerHTML = `<option value="">${first}</option>` + items.map((i) => `<option value="${i.id}">${esc(label(i))}</option>`).join("");
  }
  function wireDialog(id, path, errId, prepare, after) {
    const dlg = $(id);
    const form = $("form", dlg);
    form.addEventListener("submit", async (ev) => {
      if (ev.submitter && ev.submitter.value === "cancel") return; // let dialog close
      ev.preventDefault();
      $(errId).textContent = "";
      try {
        const body = prepare(formJSON(form));
        const res = await api(path, { method: "POST", body });
        dlg.close(); form.reset(); after(res);
      } catch (e) { $(errId).textContent = e.message; }
    });
    return dlg;
  }

  const dlgLoad = wireDialog("#dlg-load", "loads/", "#err-load", (b) => {
    if (b.driver_id) b.driver_id = Number(b.driver_id);
    if (b.scheduled_pickup) b.scheduled_pickup = new Date(b.scheduled_pickup).toISOString();
    return b;
  }, (l) => { toast(`${l.reference} created`); refreshAll(); });
  const dlgDriver = wireDialog("#dlg-driver", "drivers/", "#err-driver", (b) => {
    if (b.truck_id) b.truck_id = Number(b.truck_id);
    return b;
  }, (d) => { toast(`${d.full_name} can now sign in to the app`); refreshAll(); });
  const dlgTruck = wireDialog("#dlg-truck", "trucks/", "#err-truck", (b) => b, (t) => { toast(`Truck ${t.plate_number} added`); refreshAll(); });

  $("#btn-new-load").onclick = async () => {
    const drivers = (await api("drivers/")).filter((d) => d.is_active);
    fillSelect($("#f-driver"), drivers, (d) => `${d.full_name}${d.truck ? " — " + d.truck.plate_number : ""} (${STATUS_LABEL[d.status]})`, "Assign later");
    const now = new Date(Date.now() + 30 * 60000 - new Date().getTimezoneOffset() * 60000);
    $("#f-when").value = now.toISOString().slice(0, 16);
    $("#err-load").textContent = "";
    dlgLoad.showModal();
  };
  $("#btn-new-driver").onclick = async () => {
    const trucks = await api("trucks/");
    fillSelect($("#g-truck"), trucks, (t) => `${t.plate_number} — ${t.kind_label}`, "No truck yet");
    $("#err-driver").textContent = "";
    dlgDriver.showModal();
  };
  $("#btn-new-truck").onclick = () => { $("#err-truck").textContent = ""; dlgTruck.showModal(); };

  // ---------- navigation ----------
  const TITLES = { overview: "Live map", loads: "Loads", drivers: "Drivers", fleet: "Fleet" };
  function show(view) {
    state.view = view;
    $$(".nav button").forEach((b) => {
      if (b.dataset.view === view) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    $$(".view").forEach((v) => (v.hidden = v.id !== `view-${view}`));
    $("#page-title").textContent = TITLES[view];
    try { localStorage.setItem("trucksy.view", view); } catch {}
    refreshAll();
    if (view === "overview" && map) setTimeout(() => map.invalidateSize(), 50);
  }
  function refreshAll() {
    if (state.view === "overview") return refreshDashboard();
    if (state.view === "loads") return renderLoads().catch((e) => toast(e.message));
    if (state.view === "drivers") return renderDrivers().catch((e) => toast(e.message));
    if (state.view === "fleet") return renderFleet().catch((e) => toast(e.message));
  }

  $$(".nav button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
  $("#load-filter").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.loadFilter = b.dataset.f;
    $$("#load-filter button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderLoads();
  });
  const onDates = () => { state.loadFrom = $("#load-from").value; state.loadTo = $("#load-to").value; renderLoads(); };
  $("#load-from").addEventListener("change", onDates);
  $("#load-to").addEventListener("change", onDates);
  $("#dl-week").href = `/api/reports/operations.xlsx?from=${isoDay(-6)}&to=${isoDay(0)}`;
  let qT;
  $("#load-search").addEventListener("input", (e) => { clearTimeout(qT); qT = setTimeout(() => { state.loadQuery = e.target.value.trim(); renderLoads(); }, 250); });

  document.addEventListener("click", async (e) => {
    const o = e.target.closest("[data-open-load]");
    if (o) { e.preventDefault(); openLoad(o.dataset.openLoad); return; }
    const r = e.target.closest("[data-open-load-ref]");
    if (r) {
      e.preventDefault();
      const found = await api(`loads/?q=${encodeURIComponent(r.dataset.openLoadRef)}`);
      if (found[0]) openLoad(found[0].id);
      return;
    }
    const rh = e.target.closest("[data-route-history]");
    if (rh) { openRouteHistory(rh.dataset.routeHistory).catch((err) => toast(err.message)); return; }
    const p = e.target.closest("[data-reset-pin]");
    if (p) {
      const pin = prompt("New 4–12 digit PIN for this driver:");
      if (!pin) return;
      try { await api(`drivers/${p.dataset.resetPin}/`, { method: "PATCH", body: { pin } }); toast("PIN updated. Share it with the driver privately."); }
      catch (err) { toast(err.message); }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
    if (e.key === "Enter" && e.target.matches("[data-open-load]")) openLoad(e.target.dataset.openLoad);
  });
  $("#drawer-close").onclick = closeDrawer;
  $("#drawer-backdrop").onclick = closeDrawer;

  // ---------- clock & boot ----------
  const tick = () => { $("#clock").textContent = new Date().toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }) + " Bahrain"; };
  tick(); setInterval(tick, 15000);

  initMap();
  let start = "overview";
  try { start = localStorage.getItem("trucksy.view") || "overview"; } catch {}
  show(TITLES[start] ? start : "overview");
  setInterval(() => { if (!document.hidden) refreshAll(); }, 10000);
})();
