"""Excel exports + driver route history (ported and upgraded from v1's export_drivers_excel
and driver_history). All dispatcher-only."""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font
from rest_framework.response import Response
from rest_framework.views import APIView

from fleet.models import Driver, Truck
from fleet.permissions import IsDispatcher
from loads.models import Load
from tracking.gaps import find_gaps, gap_minutes
from tracking.models import LocationPing

from .excel import D, DT, GREEN, KG, KM, MONEY, Sheet, local, parse_period, route_km, xlsx_response

MAX_POINTS = 20000


def _filtered_loads(params, start, end):
    """Same filters as the dashboard's Loads tab, plus the date range (on scheduled pickup)."""
    qs = (Load.objects.select_related("driver", "driver__truck")
          .filter(scheduled_pickup__gte=start, scheduled_pickup__lt=end)
          .order_by("scheduled_pickup", "id"))
    st = params.get("status")
    if st == "active":
        qs = qs.filter(status__in=Load.ACTIVE_STATUSES)
    elif st:
        qs = qs.filter(status=st)
    if params.get("driver"):
        qs = qs.filter(driver_id=params["driver"])
    if params.get("q"):
        q = params["q"]
        qs = qs.filter(Q(reference__icontains=q) | Q(customer_name__icontains=q)
                       | Q(pickup_address__icontains=q) | Q(dropoff_address__icontains=q))
    return qs


LOAD_COLUMNS = [
    ("Reference", 12), ("Status", 16), ("Customer", 28), ("Customer phone", 16),
    ("Pickup", 30), ("Drop-off", 30), ("Cargo", 24), ("Weight", 11, KG), ("Price", 14, MONEY),
    ("Driver", 18), ("Truck", 11), ("Scheduled pickup", 18, DT), ("Picked up", 18, DT),
    ("Delivered", 18, DT), ("Received by", 18), ("Tracking link", 40),
]


def _load_sheet(wb, loads, request, first=False, title_row=None):
    sh = Sheet(wb, "Loads", LOAD_COLUMNS, first=first, title_row=title_row)
    for ld in loads:
        sh.add([
            ld.reference, ld.get_status_display(), ld.customer_name, ld.customer_phone,
            ld.pickup_address, ld.dropoff_address, ld.cargo_description, ld.weight_kg, ld.price,
            ld.driver.full_name if ld.driver else "", (ld.driver.truck.plate_number if ld.driver and ld.driver.truck else ""),
            local(ld.scheduled_pickup), local(ld.picked_up_at), local(ld.delivered_at), ld.proof_receiver_name,
            request.build_absolute_uri(f"/t/{ld.tracking_code}/"),
        ])
    sh.finish({1: "count", 8: "sum", 9: "sum"})
    return sh


def _driver_rows(start, end):
    """Per-driver stats for the period: deliveries, revenue, km driven, last seen."""
    delivered = defaultdict(lambda: [0, Decimal("0")])
    for ld in Load.objects.filter(status=Load.Status.DELIVERED, delivered_at__gte=start, delivered_at__lt=end):
        if ld.driver_id:
            delivered[ld.driver_id][0] += 1
            delivered[ld.driver_id][1] += ld.price
    km = defaultdict(float)
    pts = defaultdict(list)
    for driver_id, lat, lng in (LocationPing.objects.filter(recorded_at__gte=start, recorded_at__lt=end)
                                .order_by("driver_id", "recorded_at").values_list("driver_id", "lat", "lng")[:200000]):
        pts[driver_id].append((lat, lng))
    for driver_id, p in pts.items():
        km[driver_id] = route_km(p)
    return delivered, km


DRIVER_COLUMNS = [
    ("Driver", 22), ("Phone", 14), ("CPR", 13), ("Licence no.", 14), ("Licence expiry", 15, D),
    ("Truck", 11), ("Truck type", 20), ("Status", 12), ("Last signal", 18, DT),
    ("Last latitude", 13), ("Last longitude", 13), ("Deliveries", 11), ("Revenue", 14, MONEY), ("Distance", 11, KM),
    ("Active", 9),
]


def _driver_sheet(wb, start, end, first=False, title_row=None):
    delivered, km = _driver_rows(start, end)
    sh = Sheet(wb, "Drivers", DRIVER_COLUMNS, first=first, title_row=title_row)
    for d in Driver.objects.select_related("truck").order_by("-is_active", "full_name"):
        n, rev = delivered.get(d.id, (0, Decimal("0")))
        sh.add([
            d.full_name, d.phone, d.cpr, d.license_number, d.license_expiry,
            d.truck.plate_number if d.truck else "", d.truck.get_kind_display() if d.truck else "",
            d.get_status_display() if d.is_live else "Offline", local(d.last_seen),
            d.last_lat, d.last_lng, n, rev, round(km.get(d.id, 0.0), 1), "Yes" if d.is_active else "No",
        ])
    sh.finish({1: "count", 12: "sum", 13: "sum", 14: "sum"})
    return sh


class OperationsReportView(APIView):
    """The weekly/monthly management report: Summary, Daily, Loads, Drivers, Fleet."""

    permission_classes = [IsDispatcher]

    def get(self, request):
        d_from, d_to, start, end = parse_period(request.query_params)
        loads = list(_filtered_loads(request.query_params, start, end))
        delivered = [ld for ld in Load.objects.filter(status=Load.Status.DELIVERED,
                                                      delivered_at__gte=start, delivered_at__lt=end)]
        revenue = sum((ld.price for ld in delivered), Decimal("0"))
        period = f"{d_from:%d %b %Y} – {d_to:%d %b %Y}"

        wb = Workbook()
        ws = wb.active
        ws.title = "Summary"
        ws["A1"] = "Trucksy operations report"
        ws["A1"].font = Font(bold=True, size=16, color=GREEN)
        ws["A2"] = f"Period: {period}   ·   Generated {timezone.localtime():%d %b %Y %H:%M} (Bahrain)"
        rows = [
            ("Loads scheduled in period", len(loads), None),
            ("Delivered", len(delivered), None),
            ("Cancelled", sum(1 for ld in loads if ld.status == Load.Status.CANCELLED), None),
            ("Still open (pending or on the road)",
             sum(1 for ld in loads if ld.status == Load.Status.PENDING or ld.is_active), None),
            ("Revenue from deliveries", revenue, MONEY),
            ("Average price per delivery", (revenue / len(delivered)) if delivered else 0, MONEY),
            ("Active drivers", Driver.objects.filter(is_active=True).count(), None),
            ("Active trucks", Truck.objects.filter(is_active=True).count(), None),
        ]
        for i, (label, value, fmt) in enumerate(rows, start=4):
            ws.cell(row=i, column=1, value=label)
            c = ws.cell(row=i, column=2, value=value)
            c.font = Font(bold=True)
            if fmt:
                c.number_format = fmt
        ws.column_dimensions["A"].width = 38
        ws.column_dimensions["B"].width = 18
        ws.cell(row=13, column=1, value="See the other tabs for daily totals, every load, and each driver.").font = Font(italic=True, color="566172")

        # Daily totals
        daily = Sheet(wb, "Daily", [("Date", 14, D), ("Deliveries", 12), ("Revenue", 14, MONEY)])
        by_day = defaultdict(lambda: [0, Decimal("0")])
        for ld in delivered:
            day = timezone.localtime(ld.delivered_at).date()
            by_day[day][0] += 1
            by_day[day][1] += ld.price
        day = d_from
        while day <= d_to:
            n, rev = by_day.get(day, (0, Decimal("0")))
            daily.add([day, n, rev])
            day += timedelta(days=1)
        daily.finish({1: "Total", 2: "sum", 3: "sum"})

        _load_sheet(wb, loads, request)
        _driver_sheet(wb, start, end)

        fleet = Sheet(wb, "Fleet", [("Plate", 11), ("Type", 22), ("Make", 14), ("Model", 14), ("Year", 8),
                                     ("Capacity", 12, KG), ("Registration expiry", 18, D), ("Insurance expiry", 16, D),
                                     ("Driver", 20)])
        for t in Truck.objects.prefetch_related("drivers"):
            drv = t.drivers.filter(is_active=True).first()
            fleet.add([t.plate_number, t.get_kind_display(), t.make, t.model, t.year, t.capacity_kg,
                       t.registration_expiry, t.insurance_expiry, drv.full_name if drv else ""])
        fleet.finish()

        return xlsx_response(wb, f"trucksy-report_{d_from}_{d_to}.xlsx")


class LoadsExportView(APIView):
    """Exactly what the Loads tab shows (filters + date range) as Excel."""

    permission_classes = [IsDispatcher]

    def get(self, request):
        d_from, d_to, start, end = parse_period(request.query_params, default_days=30)
        wb = Workbook()
        _load_sheet(wb, _filtered_loads(request.query_params, start, end), request, first=True,
                    title_row=f"Trucksy loads · {d_from:%d %b %Y} – {d_to:%d %b %Y}")
        return xlsx_response(wb, f"trucksy-loads_{d_from}_{d_to}.xlsx")


class DriversExportView(APIView):
    """Driver list with documents, truck, last position and period performance (v1's export, upgraded)."""

    permission_classes = [IsDispatcher]

    def get(self, request):
        d_from, d_to, start, end = parse_period(request.query_params, default_days=30)
        wb = Workbook()
        _driver_sheet(wb, start, end, first=True,
                      title_row=f"Trucksy drivers · performance {d_from:%d %b %Y} – {d_to:%d %b %Y}")
        return xlsx_response(wb, f"trucksy-drivers_{timezone.localdate()}.xlsx")


def _history(driver, start, end):
    pings = list(LocationPing.objects.filter(driver=driver, recorded_at__gte=start, recorded_at__lt=end)
                 .select_related("load").order_by("recorded_at")[:MAX_POINTS])
    km = route_km([(p.lat, p.lng) for p in pings])
    deliveries = list(driver.loads.filter(status=Load.Status.DELIVERED, delivered_at__gte=start, delivered_at__lt=end)
                      .order_by("delivered_at"))
    return pings, km, deliveries


class DriverHistoryView(APIView):
    """GET /api/drivers/<id>/history/?from=YYYY-MM-DD&to=YYYY-MM-DD — route trail for a date range."""

    permission_classes = [IsDispatcher]

    def get(self, request, pk):
        driver = get_object_or_404(Driver.objects.select_related("truck"), pk=pk)
        d_from, d_to, start, end = parse_period(request.query_params, default_days=1)
        pings, km, deliveries = _history(driver, start, end)
        gaps = find_gaps(pings) if end > timezone.now() else find_gaps(pings, now=end)
        return Response({
            "driver": {"id": driver.id, "full_name": driver.full_name,
                       "truck": driver.truck.plate_number if driver.truck else None},
            "from": d_from, "to": d_to,
            "stats": {
                "points": len(pings),
                "km": round(km, 1),
                "first": pings[0].recorded_at if pings else None,
                "last": pings[-1].recorded_at if pings else None,
                "max_speed_kmh": round(max((p.speed_kmh or 0) for p in pings), 0) if pings else None,
                "deliveries": len(deliveries),
                "truncated": len(pings) >= MAX_POINTS,
                "gaps": len(gaps),
            },
            "gap_alert_minutes": gap_minutes(),
            "gaps": gaps,
            "points": [{"lat": p.lat, "lng": p.lng, "speed_kmh": p.speed_kmh, "at": p.recorded_at,
                        "load": p.load.reference if p.load else None} for p in pings],
            "deliveries": [{"reference": ld.reference, "dropoff": ld.dropoff_address,
                            "lat": ld.dropoff_lat, "lng": ld.dropoff_lng, "at": ld.delivered_at}
                           for ld in deliveries],
        })


class DriverRouteExportView(APIView):
    """Route history as Excel: summary + every GPS point (with a Google Maps link per point)."""

    permission_classes = [IsDispatcher]

    def get(self, request, pk):
        driver = get_object_or_404(Driver.objects.select_related("truck"), pk=pk)
        d_from, d_to, start, end = parse_period(request.query_params, default_days=1)
        pings, km, deliveries = _history(driver, start, end)
        gaps = find_gaps(pings) if end > timezone.now() else find_gaps(pings, now=end)

        wb = Workbook()
        ws = wb.active
        ws.title = "Summary"
        ws["A1"] = f"Route history — {driver.full_name}"
        ws["A1"].font = Font(bold=True, size=15, color=GREEN)
        ws["A2"] = f"{d_from:%d %b %Y} – {d_to:%d %b %Y}"
        for i, (label, value, fmt) in enumerate([
            ("Truck", driver.truck.plate_number if driver.truck else "—", None),
            ("GPS points", len(pings), None),
            ("Distance driven", round(km, 1), KM),
            ("First signal", local(pings[0].recorded_at) if pings else None, DT),
            ("Last signal", local(pings[-1].recorded_at) if pings else None, DT),
            ("Deliveries completed", len(deliveries), None),
            ("Signal gaps during jobs", len(gaps), None),
        ], start=4):
            ws.cell(row=i, column=1, value=label)
            c = ws.cell(row=i, column=2, value=value)
            c.font = Font(bold=True)
            if fmt and value is not None:
                c.number_format = fmt
        ws.column_dimensions["A"].width = 24
        ws.column_dimensions["B"].width = 22

        dl = Sheet(wb, "Deliveries", [("Reference", 12), ("Customer", 26), ("Drop-off", 30),
                                      ("Delivered", 18, DT), ("Received by", 18)])
        for ld in deliveries:
            dl.add([ld.reference, ld.customer_name, ld.dropoff_address, local(ld.delivered_at), ld.proof_receiver_name])
        dl.finish()

        gp = Sheet(wb, "Signal gaps", [("Job", 12), ("Signal lost", 18, DT), ("Signal back", 18, DT), ("Minutes", 10),
                                       ("Km moved meanwhile", 18, KM), ("Last position", 14)])
        for g in gaps:
            gp.add([g["load"], local(g["start"]), local(g["end"]) if g["end"] else "Still silent", g["minutes"],
                    g["km_moved"], "Open map"])
            cell = gp.ws.cell(row=gp.row, column=6)
            cell.hyperlink = f"https://www.google.com/maps?q={g['lat']:.6f},{g['lng']:.6f}"
            cell.font = Font(color="059669", underline="single")
        gp.finish()

        gps = Sheet(wb, "GPS points", [("Time", 18, DT), ("Latitude", 12), ("Longitude", 12),
                                       ("Speed (km/h)", 13), ("Job", 12), ("Map", 14)])
        for p in pings:
            gps.add([local(p.recorded_at), round(p.lat, 6), round(p.lng, 6),
                     round(p.speed_kmh, 0) if p.speed_kmh is not None else None,
                     p.load.reference if p.load else "", "Open map"])
            cell = gps.ws.cell(row=gps.row, column=6)
            cell.hyperlink = f"https://www.google.com/maps?q={p.lat:.6f},{p.lng:.6f}"
            cell.font = Font(color="059669", underline="single")
        gps.finish()

        safe = "".join(ch for ch in driver.full_name if ch.isalnum() or ch in " -").strip().replace(" ", "-")
        return xlsx_response(wb, f"route_{safe}_{d_from}_{d_to}.xlsx")
