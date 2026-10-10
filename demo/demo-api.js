/* Trucksy dashboard DEMO server.
   Answers the dashboard's /api/... requests inside the browser with realistic Bahrain demo data,
   and moves the trucks every few seconds — so the real dashboard code can be tried without a backend.
   Mirrors the Django API in backend/ (same JSON shapes). */
(() => {
  "use strict";
  // ---------- deterministic random ----------
  let seed = 42;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const iso = (t) => new Date(t).toISOString();
  const bhDate = (t) => new Date(t + 3 * HOUR).toISOString().slice(0, 10); // Bahrain calendar day
  const APP_URL = "https://trucksy-api.onrender.com";

  const PLACES = {
    "Khalifa Bin Salman Port, Hidd": [26.2027, 50.672], "Bahrain Logistics Zone, Hidd": [26.212, 50.66],
    "Mina Salman Port": [26.204, 50.61], "Sitra Industrial Area": [26.15, 50.63], "Salmabad Industrial Area": [26.1785, 50.526],
    "BIA Cargo Village, Muharraq": [26.2708, 50.6336], "Manama Central Market": [26.2318, 50.58], "Seef District, Manama": [26.2361, 50.5376],
    "Riffa Views": [26.13, 50.555], "Isa Town Industrial": [26.1736, 50.5478], "Hamad Town Roundabout 1": [26.115, 50.507],
    "King Fahd Causeway Customs": [26.186, 50.33], "Juffair, Manama": [26.212, 50.604], "Tubli Warehouses": [26.2, 50.56],
    "Budaiya Highway": [26.22, 50.45], "Askar Industrial Zone": [26.075, 50.617],
  };
  const ALIASES = { "hidd port": "Khalifa Bin Salman Port, Hidd", sitra: "Sitra Industrial Area", salmabad: "Salmabad Industrial Area",
    airport: "BIA Cargo Village, Muharraq", seef: "Seef District, Manama", riffa: "Riffa Views", "isa town": "Isa Town Industrial",
    "hamad town": "Hamad Town Roundabout 1", causeway: "King Fahd Causeway Customs", juffair: "Juffair, Manama", tubli: "Tubli Warehouses",
    budaiya: "Budaiya Highway", askar: "Askar Industrial Zone", "mina salman": "Mina Salman Port", muharraq: "BIA Cargo Village, Muharraq" };
  const lookup = (addr) => {
    const a = (addr || "").toLowerCase();
    for (const [n, c] of Object.entries(PLACES)) if (a && (n.toLowerCase() === a || a.includes(n.toLowerCase()))) return c;
    for (const [k, n] of Object.entries(ALIASES)) if (a.includes(k)) return PLACES[n];
    return null;
  };
  const CUSTOMERS = [["Pearl Coast Foods W.L.L.", "Chilled food cartons"], ["Gulf Steel Supplies", "Rebar bundles"], ["Island Furniture Co.", "Office furniture"],
    ["Bayview Electronics", "Boxed electronics"], ["Sitra Cold Store", "Frozen poultry"], ["Oasis Building Materials", "Cement bags"],
    ["Coral Bay Trading", "Mixed general cargo"], ["Manama Fresh Market", "Fresh produce crates"]];
  const KIND = { pickup: "Pickup (1 ton)", box: "Box truck (3–7 ton)", flatbed: "Flatbed", reefer: "Refrigerated (reefer)", trailer: "Trailer / Semi", tanker: "Tanker" };
  const LOAD_LABEL = { pending: "Pending", assigned: "Assigned", to_pickup: "Heading to pickup", loaded: "Loaded", in_transit: "In transit", delivered: "Delivered", cancelled: "Cancelled" };
  const DRIVER_LABEL = { offline: "Offline", available: "Available", on_job: "On a job", break: "On break" };
  const FLOW = { assigned: "to_pickup", to_pickup: "loaded", loaded: "in_transit", in_transit: "delivered" };
  const ACTIVE = ["assigned", "to_pickup", "loaded", "in_transit"];
  const RECEIVERS = ["Ahmed", "Fatima", "Store keeper", "Sameer", "Reception", "Hussain", "Maryam"];
  const ADMIN = "Ops Manager";

  // ---------- data ----------
  const now0 = Date.now();
  const trucks = [
    ["412 873", "reefer", "Isuzu", "NPR", 2021, 4000], ["538 120", "box", "Mitsubishi", "Fuso Canter", 2020, 3500],
    ["601 445", "flatbed", "Hino", "500", 2019, 9000], ["227 906", "trailer", "Mercedes-Benz", "Actros", 2022, 25000],
    ["375 551", "pickup", "Toyota", "Hilux", 2023, 1000], ["489 362", "box", "Isuzu", "FRR", 2018, 7000],
  ].map((t, i) => ({ id: i + 1, plate_number: t[0], kind: t[1], kind_label: KIND[t[1]], make: t[2], model: t[3], year: t[4], capacity_kg: t[5],
    registration_expiry: bhDate(now0 + rint(20, 300) * DAY), insurance_expiry: bhDate(now0 + (i === 0 ? 21 : i === 5 ? 25 : rint(60, 320)) * DAY), is_active: true }));
  const drivers = [["Yasir Ali", "34180130", "BH-48213"], ["Imran Khan", "36001122", "BH-55190"], ["Arun Kumar", "33447788", "BH-61022"],
    ["Abdullah Saleh", "39112233", "BH-30478"], ["Bilal Ahmed", "35667788", "BH-72815"], ["Rashid Mahmood", "38990011", "BH-19364"]]
    .map((d, i) => ({ id: i + 1, full_name: d[0], phone: d[1], cpr: String(rint(800000000, 999999999)), license_number: d[2],
      license_expiry: bhDate(now0 + (i === 4 ? 18 : rint(90, 900)) * DAY), truck_id: i + 1, status: "offline",
      last_lat: null, last_lng: null, last_speed_kmh: null, last_heading: null, last_seen: null, is_active: true, created_at: iso(now0 - 90 * DAY) }));
  const loads = [], events = [], pings = [];
  let loadSeq = 0, eventSeq = 0;
  const code = () => Array.from({ length: 10 }, () => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(rnd() * 55)]).join("");
  const logEvent = (ld, status, note, by, t, lat = null, lng = null) =>
    events.push({ id: ++eventSeq, load_id: ld.id, status, note: note || "", lat, lng, by, created_at: t });

  function newLoad({ status = "pending", driver = null, created = Date.now(), a, b, price, cust, weight, notes = "" }) {
    a = a || pick(Object.keys(PLACES)); do { b = b || pick(Object.keys(PLACES)); } while (b === a && !(b = null));
    const c = cust || pick(CUSTOMERS);
    const ld = { id: ++loadSeq, reference: "TRK-" + String(loadSeq).padStart(5, "0"), tracking_code: code(),
      customer_name: c[0], customer_phone: "+973 17" + rint(100000, 999999),
      pickup_address: a, pickup_lat: PLACES[a]?.[0] ?? null, pickup_lng: PLACES[a]?.[1] ?? null,
      dropoff_address: b, dropoff_lat: PLACES[b]?.[0] ?? null, dropoff_lng: PLACES[b]?.[1] ?? null,
      cargo_description: c[1], weight_kg: weight ?? pick([450, 800, 1200, 2500, 3200, 6000]), price: price ?? pick([28, 35, 45, 55, 65, 80, 95, 120, 150]),
      notes, status: "pending", driver_id: null, scheduled_pickup: iso(created + HOUR), picked_up_at: null, delivered_at: null,
      proof_receiver_name: "", created_at: iso(created), updated_at: iso(created) };
    loads.push(ld);
    logEvent(ld, "pending", "Load created", ADMIN, iso(created));
    if (driver) { ld.driver_id = driver.id; ld.status = "assigned"; logEvent(ld, "assigned", "Assigned to " + driver.full_name, ADMIN, iso(created + 5 * MIN)); }
    const seq = ["to_pickup", "loaded", "in_transit", "delivered"];
    if (seq.includes(status)) {
      let t = created + 5 * MIN;
      for (const st of seq.slice(0, seq.indexOf(status) + 1)) {
        t = Math.min(t + rint(12, 35) * MIN, Date.now() - rint(1, 4) * MIN);
        logEvent(ld, st, st === "delivered" ? "Goods received" : "", driver.full_name, iso(t));
        if (st === "loaded") ld.picked_up_at = iso(t);
        if (st === "delivered") { ld.delivered_at = iso(t); ld.proof_receiver_name = pick(RECEIVERS); }
      }
      ld.status = status; ld.updated_at = iso(t);
    } else if (status === "cancelled") {
      ld.status = "cancelled"; logEvent(ld, "cancelled", "Customer cancelled", ADMIN, iso(created + 30 * MIN));
    }
    return ld;
  }
  function trail(driver, ld, from, to, t0, t1, n) {
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      pings.push({ driver_id: driver.id, load_id: ld.id, lat: from[0] + (to[0] - from[0]) * f + (rnd() - 0.5) * 0.002,
        lng: from[1] + (to[1] - from[1]) * f + (rnd() - 0.5) * 0.002, speed_kmh: 35 + rnd() * 40, heading: rnd() * 360, recorded_at: iso(t0 + (t1 - t0) * f) });
    }
  }
  // a week of delivered work
  for (let d = 6; d >= 0; d--) {
    const n = rint(4, 7) + Math.floor((6 - d) / 2);
    for (let k = 0; k < n; k++) {
      let created = now0 - d * DAY - rint(3, 8) * HOUR;
      const drv = pick(drivers);
      const ld = newLoad({ status: "delivered", driver: drv, created });
      trail(drv, ld, [ld.pickup_lat, ld.pickup_lng], [ld.dropoff_lat, ld.dropoff_lng], Date.parse(ld.picked_up_at), Date.parse(ld.delivered_at), 10);
    }
  }
  newLoad({ status: "cancelled", created: now0 - 2 * DAY });
  // live jobs right now
  [[0, "in_transit", 0.6], [1, "to_pickup", 0.35], [2, "loaded", 1], [3, "in_transit", 0.25], [4, "assigned", 0]].forEach(([i, st, prog]) => {
    const d = drivers[i];
    const ld = newLoad({ status: st, driver: d, created: now0 - HOUR - rint(0, 40) * MIN });
    const pickupPt = [ld.pickup_lat, ld.pickup_lng], dropPt = [ld.dropoff_lat, ld.dropoff_lng];
    const start = st === "in_transit" ? pickupPt : [pickupPt[0] + (rnd() - 0.5) * 0.08, pickupPt[1] + (rnd() - 0.5) * 0.1];
    const end = st === "in_transit" ? dropPt : pickupPt;
    const pos = [start[0] + (end[0] - start[0]) * prog, start[1] + (end[1] - start[1]) * prog];
    if (prog > 0) trail(d, ld, start, pos, now0 - 30 * MIN, now0 - MIN, Math.max(3, Math.round(25 * prog)));
    Object.assign(d, { status: "on_job", last_lat: pos[0], last_lng: pos[1], last_speed_kmh: prog > 0 && prog < 1 ? 55 : 0, last_seen: iso(now0 - rint(5, 50) * 1000) });
  });
  Object.assign(drivers[5], { status: "available", last_lat: 26.212, last_lng: 50.66, last_seen: iso(now0 - 2 * MIN) });
  for (let k = 0; k < 3; k++) newLoad({ created: now0 - rint(5, 90) * MIN });

  // ---------- serializers ----------
  const truckMini = (t) => t && { id: t.id, plate_number: t.plate_number, kind: t.kind, kind_label: t.kind_label, make: t.make, model: t.model, capacity_kg: t.capacity_kg };
  const truckOf = (d) => trucks.find((t) => t.id === d.truck_id) || null;
  const isLive = (d) => !!d.last_seen && Date.now() - Date.parse(d.last_seen) <= 10 * MIN && d.status !== "offline";
  const sDriver = (d) => ({ id: d.id, full_name: d.full_name, phone: d.phone, cpr: d.cpr, license_number: d.license_number, license_expiry: d.license_expiry,
    truck: truckMini(truckOf(d)), status: d.status, status_label: DRIVER_LABEL[d.status], is_live: isLive(d), last_lat: d.last_lat, last_lng: d.last_lng,
    last_speed_kmh: d.last_speed_kmh, last_heading: d.last_heading, last_seen: d.last_seen, is_active: d.is_active, created_at: d.created_at });
  const sTruck = (t) => ({ ...t, driver_name: (drivers.find((d) => d.truck_id === t.id && d.is_active) || {}).full_name || null });
  const sLoad = (l) => {
    const d = drivers.find((x) => x.id === l.driver_id);
    return { ...l, price: Number(l.price).toFixed(3), status_label: LOAD_LABEL[l.status], next_driver_status: FLOW[l.status] || null,
      driver: d ? { id: d.id, full_name: d.full_name, phone: d.phone } : null, truck: d ? truckMini(truckOf(d)) : null,
      tracking_url: APP_URL + "/t/" + l.tracking_code + "/" };
  };
  const sEvent = (e) => ({ id: e.id, reference: loads.find((l) => l.id === e.load_id).reference, status: e.status, status_label: LOAD_LABEL[e.status],
    note: e.note, lat: e.lat, lng: e.lng, by: e.by, created_at: e.created_at });

  // ---------- business logic ----------
  function setStatus(l, st, by, note = "", receiver = "") {
    const t = iso(Date.now());
    l.status = st; l.updated_at = t;
    if (st === "loaded" && !l.picked_up_at) l.picked_up_at = t;
    if (st === "delivered") { l.delivered_at = t; l.proof_receiver_name = receiver || pick(RECEIVERS); }
    logEvent(l, st, note, by, t);
    const d = drivers.find((x) => x.id === l.driver_id);
    if (d && d.status !== "offline") d.status = loads.some((x) => x.driver_id === d.id && ACTIVE.includes(x.status)) ? "on_job" : "available";
  }
  function assign(l, driver) {
    l.driver_id = driver ? driver.id : null;
    if (driver && l.status === "pending") l.status = "assigned";
    else if (!driver && l.status === "assigned") l.status = "pending";
    l.updated_at = iso(Date.now());
    logEvent(l, l.status, driver ? "Assigned to " + driver.full_name : "Unassigned", ADMIN, iso(Date.now()));
    if (driver && driver.status !== "offline") driver.status = "on_job";
  }
  const hav = (a, b) => { const r = Math.PI / 180, h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
  const routeKm = (pts) => pts.slice(1).reduce((s, p, i) => { const k = hav([pts[i].lat, pts[i].lng], [p.lat, p.lng]); return s + (k < 3 ? k : 0); }, 0);
  function period(q, days) {
    const today = bhDate(Date.now());
    let to = /^\d{4}-\d{2}-\d{2}$/.test(q.get("to") || "") ? q.get("to") : today;
    let from = /^\d{4}-\d{2}-\d{2}$/.test(q.get("from") || "") ? q.get("from") : bhDate(Date.parse(to + "T12:00:00Z") - (days - 1) * DAY);
    if (from > to) [from, to] = [to, from];
    return { from, to, start: Date.parse(from + "T00:00:00+03:00"), end: Date.parse(to + "T00:00:00+03:00") + DAY };
  }

  // ---------- API ----------
  function dashboard() {
    const today = bhDate(Date.now());
    const deliveredToday = loads.filter((l) => l.status === "delivered" && bhDate(Date.parse(l.delivered_at)) === today);
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const day = bhDate(Date.now() - i * DAY);
      const ds = loads.filter((l) => l.status === "delivered" && bhDate(Date.parse(l.delivered_at)) === day);
      trend.push({ date: day, deliveries: ds.length, revenue: ds.reduce((s, l) => s + Number(l.price), 0) });
    }
    const counts = {};
    loads.forEach((l) => (counts[l.status] = (counts[l.status] || 0) + 1));
    const act = drivers.filter((d) => d.is_active);
    return {
      kpis: { drivers_live: act.filter(isLive).length, drivers_total: act.length, loads_active: ACTIVE.reduce((s, k) => s + (counts[k] || 0), 0),
        loads_pending: counts.pending || 0, delivered_today: deliveredToday.length, revenue_today: deliveredToday.reduce((s, l) => s + Number(l.price), 0),
        deliveries_week: trend.reduce((s, t) => s + t.deliveries, 0), trucks_total: trucks.length },
      status_counts: counts, trend, drivers: act.map(sDriver),
      active_loads: loads.filter((l) => ACTIVE.includes(l.status)).map(sLoad),
      events: events.slice().sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, 15).map(sEvent),
      currency: "BHD", server_time: iso(Date.now()),
    };
  }
  function listLoads(q) {
    let r = loads.slice();
    const st = q.get("status");
    if (st === "active") r = r.filter((l) => ACTIVE.includes(l.status)); else if (st) r = r.filter((l) => l.status === st);
    if (q.get("driver")) r = r.filter((l) => String(l.driver_id) === q.get("driver"));
    if (q.get("from") || q.get("to")) { const p = period(q, 30); r = r.filter((l) => { const t = Date.parse(l.scheduled_pickup); return t >= p.start && t < p.end; }); }
    if (q.get("q")) { const s = q.get("q").toLowerCase(); r = r.filter((l) => [l.reference, l.customer_name, l.pickup_address, l.dropoff_address].some((x) => x.toLowerCase().includes(s))); }
    return r.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(sLoad);
  }
  const bad = (msg, status = 400) => ({ status, body: { detail: msg } });

  function handle(method, path, q, body) {
    let m;
    if (path === "dashboard/") return { body: dashboard() };
    if (path === "loads/" && method === "GET") return { body: listLoads(q) };
    if (path === "loads/" && method === "POST") {
      const errs = {};
      ["customer_name", "pickup_address", "dropoff_address"].forEach((k) => { if (!(body[k] || "").trim()) errs[k] = ["This field is required."]; });
      if (Object.keys(errs).length) return { status: 400, body: errs };
      const drv = body.driver_id ? drivers.find((d) => d.id === Number(body.driver_id)) : null;
      const pu = lookup(body.pickup_address), dr = lookup(body.dropoff_address);
      const created = Date.now();
      const l = newLoad({ created, a: body.pickup_address, b: body.dropoff_address, cust: [body.customer_name, body.cargo_description || ""],
        price: Number(body.price || 0), weight: Number(body.weight_kg || 0), notes: body.notes || "" });
      Object.assign(l, { customer_phone: body.customer_phone || "", pickup_lat: pu?.[0] ?? null, pickup_lng: pu?.[1] ?? null,
        dropoff_lat: dr?.[0] ?? null, dropoff_lng: dr?.[1] ?? null, scheduled_pickup: body.scheduled_pickup || iso(created + 30 * MIN) });
      if (drv) assign(l, drv);
      return { status: 201, body: sLoad(l) };
    }
    if ((m = path.match(/^loads\/(\d+)\/(events\/|route\/|set_status\/)?$/))) {
      const l = loads.find((x) => x.id === Number(m[1]));
      if (!l) return bad("Not found.", 404);
      if (m[2] === "events/") return { body: events.filter((e) => e.load_id === l.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(sEvent) };
      if (m[2] === "route/") return { body: pings.filter((p) => p.load_id === l.id).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)) };
      if (m[2] === "set_status/") { setStatus(l, body.status, ADMIN, body.note || "Updated by dispatcher", body.receiver_name); return { body: sLoad(l) }; }
      if (method === "PATCH") {
        if ("driver_id" in body) { const d = body.driver_id ? drivers.find((x) => x.id === Number(body.driver_id)) : null; if ((d?.id ?? null) !== l.driver_id) assign(l, d); }
        return { body: sLoad(l) };
      }
      return { body: sLoad(l) };
    }
    if (path === "drivers/" && method === "GET") return { body: drivers.map(sDriver) };
    if (path === "drivers/" && method === "POST") {
      const phone = String(body.phone || "").replace(/[^\d+]/g, "");
      if (!body.full_name) return { status: 400, body: { full_name: ["This field is required."] } };
      if (phone.replace("+", "").length < 7) return { status: 400, body: { phone: ["Enter a valid phone number."] } };
      if (drivers.some((d) => d.phone === phone)) return { status: 400, body: { phone: ["A driver with this phone already exists."] } };
      if (!body.pin || String(body.pin).length < 4) return { status: 400, body: { pin: ["Set a 4–12 digit PIN for the driver's app login."] } };
      const d = { id: drivers.length + 1, full_name: body.full_name, phone, cpr: body.cpr || "", license_number: body.license_number || "",
        license_expiry: body.license_expiry || null, truck_id: body.truck_id ? Number(body.truck_id) : null, status: "offline", last_lat: null, last_lng: null,
        last_speed_kmh: null, last_heading: null, last_seen: null, is_active: true, created_at: iso(Date.now()) };
      drivers.push(d);
      return { status: 201, body: sDriver(d) };
    }
    if ((m = path.match(/^drivers\/(\d+)\/history\/$/))) {
      const d = drivers.find((x) => x.id === Number(m[1]));
      if (!d) return bad("Not found.", 404);
      const p = period(q, 1);
      const pts = pings.filter((x) => x.driver_id === d.id && Date.parse(x.recorded_at) >= p.start && Date.parse(x.recorded_at) < p.end).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
      const del = loads.filter((l) => l.driver_id === d.id && l.status === "delivered" && Date.parse(l.delivered_at) >= p.start && Date.parse(l.delivered_at) < p.end).sort((a, b) => a.delivered_at.localeCompare(b.delivered_at));
      return { body: { driver: { id: d.id, full_name: d.full_name, truck: truckOf(d)?.plate_number || null }, from: p.from, to: p.to,
        stats: { points: pts.length, km: Math.round(routeKm(pts) * 10) / 10, first: pts[0]?.recorded_at || null, last: pts[pts.length - 1]?.recorded_at || null,
          max_speed_kmh: pts.length ? Math.round(Math.max(...pts.map((x) => x.speed_kmh || 0))) : null, deliveries: del.length, truncated: false },
        points: pts.map((x) => ({ lat: x.lat, lng: x.lng, speed_kmh: x.speed_kmh, at: x.recorded_at, load: loads.find((l) => l.id === x.load_id)?.reference || null })),
        deliveries: del.map((l) => ({ reference: l.reference, dropoff: l.dropoff_address, lat: l.dropoff_lat, lng: l.dropoff_lng, at: l.delivered_at })) } };
    }
    if ((m = path.match(/^drivers\/(\d+)\/$/))) {
      const d = drivers.find((x) => x.id === Number(m[1]));
      if (!d) return bad("Not found.", 404);
      return { body: sDriver(d) }; // PIN reset accepted
    }
    if (path === "trucks/" && method === "GET") return { body: trucks.map(sTruck) };
    if (path === "trucks/" && method === "POST") {
      if (!body.plate_number) return { status: 400, body: { plate_number: ["This field is required."] } };
      if (trucks.some((t) => t.plate_number === body.plate_number)) return { status: 400, body: { plate_number: ["truck with this plate number already exists."] } };
      const t = { id: trucks.length + 1, plate_number: body.plate_number, kind: body.kind || "box", kind_label: KIND[body.kind || "box"], make: body.make || "",
        model: body.model || "", year: body.year ? Number(body.year) : null, capacity_kg: Number(body.capacity_kg || 3000),
        registration_expiry: body.registration_expiry || null, insurance_expiry: body.insurance_expiry || null, is_active: true };
      trucks.push(t);
      return { status: 201, body: sTruck(t) };
    }
    return bad("Not found.", 404);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, opts = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const i = url.pathname.indexOf("/api/");
    if (i === -1) return realFetch(input, opts);
    const path = url.pathname.slice(i + 5);
    const method = (opts.method || "GET").toUpperCase();
    let body = {};
    try { body = opts.body ? JSON.parse(opts.body) : {}; } catch {}
    await new Promise((r) => setTimeout(r, 60 + Math.random() * 120)); // feel like a network
    const res = handle(method, path, url.searchParams, body);
    const status = res.status || 200;
    return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(res.body), { status, headers: { "Content-Type": "application/json" } });
  };

  // ---------- simulation: drivers drive and work their jobs ----------
  const STEP = 0.0035;
  let ticks = 0;
  setInterval(() => {
    ticks++;
    const t = iso(Date.now());
    for (const d of drivers) {
      if (!d.is_active) continue;
      const l = loads.find((x) => x.driver_id === d.id && ACTIVE.includes(x.status));
      if (!l) { if (d.status === "available") d.last_seen = t; continue; }
      d.last_seen = t;
      if (l.status === "assigned") { if (rnd() < 0.25) setStatus(l, "to_pickup", d.full_name); continue; }
      if (l.status === "loaded") { if (rnd() < 0.3) setStatus(l, "in_transit", d.full_name); continue; }
      const target = l.status === "to_pickup" ? [l.pickup_lat, l.pickup_lng] : [l.dropoff_lat, l.dropoff_lng];
      if (target[0] == null || d.last_lat == null) continue;
      const dl = target[0] - d.last_lat, dg = target[1] - d.last_lng, dist = Math.hypot(dl, dg);
      if (dist < 0.003) {
        d.last_speed_kmh = 0;
        setStatus(l, l.status === "to_pickup" ? "loaded" : "delivered", d.full_name, l.status === "in_transit" ? "Goods received" : "");
        continue;
      }
      const f = Math.min(1, STEP / dist);
      d.last_lat += dl * f + (rnd() - 0.5) * 0.0004;
      d.last_lng += dg * f + (rnd() - 0.5) * 0.0004;
      d.last_speed_kmh = 40 + rnd() * 40;
      pings.push({ driver_id: d.id, load_id: l.id, lat: d.last_lat, lng: d.last_lng, speed_kmh: d.last_speed_kmh, heading: 0, recorded_at: t });
    }
    if (ticks % 25 === 0 && loads.filter((l) => l.status === "pending").length < 6) newLoad({ created: Date.now() }); // new customer order
  }, 3000);
})();
