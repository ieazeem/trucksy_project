"""
python manage.py simulate_drivers   -> moves every on-job demo truck along its route every few seconds.
Great for demos: open the dashboard and watch trucks move. Ctrl+C to stop.
"""
import random
import time

from django.core.management.base import BaseCommand
from django.utils import timezone

from fleet.models import Driver
from loads.models import Load
from tracking.models import LocationPing


class Command(BaseCommand):
    help = "Simulate live truck movement for demos."

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=float, default=3.0)
        parser.add_argument("--steps", type=int, default=0, help="Stop after N ticks (0 = forever).")

    def handle(self, *args, **opts):
        tick = 0
        self.stdout.write("Simulating… Ctrl+C to stop.")
        while True:
            for d in Driver.objects.filter(is_active=True, status=Driver.Status.ON_JOB):
                load = d.active_load
                if not load or d.last_lat is None:
                    continue
                if load.status == Load.Status.IN_TRANSIT:
                    target = (load.dropoff_lat, load.dropoff_lng)
                elif load.status == Load.Status.TO_PICKUP:
                    target = (load.pickup_lat, load.pickup_lng)
                else:
                    continue
                if target[0] is None:
                    continue
                dlat, dlng = target[0] - d.last_lat, target[1] - d.last_lng
                dist = (dlat ** 2 + dlng ** 2) ** 0.5
                if dist < 0.0015:
                    continue
                step = min(1.0, 0.0018 / dist)
                d.last_lat += dlat * step + random.uniform(-0.0002, 0.0002)
                d.last_lng += dlng * step + random.uniform(-0.0002, 0.0002)
                d.last_speed_kmh = random.uniform(40, 80)
                d.last_seen = timezone.now()
                d.save(update_fields=["last_lat", "last_lng", "last_speed_kmh", "last_seen"])
                LocationPing.objects.create(driver=d, load=load, lat=d.last_lat, lng=d.last_lng,
                                            speed_kmh=d.last_speed_kmh)
            tick += 1
            if opts["steps"] and tick >= opts["steps"]:
                break
            time.sleep(opts["interval"])
