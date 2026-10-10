"""Signal gaps: stretches of a job where the driver's phone recorded nothing.

The driver app stores GPS points on the phone when there is no internet and uploads them later,
so a dead zone does NOT leave a gap. A gap in the *recorded* points means the phone recorded
nothing at all: it was switched off, the app was closed or logged out, or GPS was turned off.
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from loads.models import Load
from reports.excel import haversine_km

# Steps a driver can only be in while actually driving a job.
MOVING = [Load.Status.TO_PICKUP, Load.Status.LOADED, Load.Status.IN_TRANSIT]


def gap_minutes():
    return getattr(settings, "TRUCKSY_GAP_ALERT_MIN", 10)


def find_gaps(pings, now=None):
    """pings: LocationPings ordered by recorded_at (with .load). Returns gaps that happened during a job."""
    limit = timedelta(minutes=gap_minutes())
    gaps = []
    for a, b in zip(pings, pings[1:]):
        if a.load_id and b.load_id and b.recorded_at - a.recorded_at >= limit:
            gaps.append({
                "start": a.recorded_at, "end": b.recorded_at,
                "minutes": round((b.recorded_at - a.recorded_at).total_seconds() / 60),
                "km_moved": round(haversine_km((a.lat, a.lng), (b.lat, b.lng)), 1),
                "lat": a.lat, "lng": a.lng, "resume_lat": b.lat, "resume_lng": b.lng,
                "load": a.load.reference if a.load else None, "ongoing": False,
            })
    now = now or timezone.now()
    if pings:
        last = pings[-1]
        if last.load_id and last.load and last.load.status in MOVING and now - last.recorded_at >= limit:
            gaps.append({
                "start": last.recorded_at, "end": None,
                "minutes": round((now - last.recorded_at).total_seconds() / 60), "km_moved": None,
                "lat": last.lat, "lng": last.lng, "resume_lat": None, "resume_lng": None,
                "load": last.load.reference, "ongoing": True,
            })
    return gaps


def silent_drivers(drivers, now=None):
    """Live alerts: drivers on a moving job whose phone has gone quiet."""
    now = now or timezone.now()
    limit = timedelta(minutes=gap_minutes())
    out = []
    for d in drivers:
        load = d.loads.filter(status__in=MOVING).order_by("scheduled_pickup", "id").first()
        if not load:
            continue
        if d.last_seen and now - d.last_seen < limit:
            continue
        out.append({
            "driver_id": d.id, "driver": d.full_name, "truck": d.truck.plate_number if d.truck else None,
            "load_id": load.id, "load": load.reference, "status_label": load.get_status_display(),
            "last_seen": d.last_seen, "lat": d.last_lat, "lng": d.last_lng,
            "minutes": round((now - d.last_seen).total_seconds() / 60) if d.last_seen else None,
        })
    out.sort(key=lambda a: -(a["minutes"] or 10**6))
    return out
