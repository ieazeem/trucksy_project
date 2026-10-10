"""
python manage.py seed_demo            -> creates a realistic Bahrain demo (safe to re-run with --reset)
python manage.py seed_demo --reset    -> wipes trucks/drivers/loads first

Creates:
  • dispatcher login  admin / trucksy123   (change it!)
  • 6 trucks, 6 drivers (app login = phone + PIN 1234)
  • a week of delivered jobs, live jobs on the road, and pending jobs
"""
import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from fleet.models import Driver, Truck
from loads.models import Load, LoadEvent
from tracking.models import LocationPing

User = get_user_model()

from loads.places import PLACES  # noqa: E402

CUSTOMERS = [
    ("Pearl Coast Foods W.L.L.", "Chilled food cartons"),
    ("Gulf Steel Supplies", "Rebar bundles"),
    ("Island Furniture Co.", "Office furniture"),
    ("Bayview Electronics", "Boxed electronics"),
    ("Sitra Cold Store", "Frozen poultry"),
    ("Oasis Building Materials", "Cement bags"),
    ("Coral Bay Trading", "Mixed general cargo"),
    ("Manama Fresh Market", "Fresh produce crates"),
]

DRIVERS = [
    ("Yasir Ali", "34180130", "BH-48213"),
    ("Imran Khan", "36001122", "BH-55190"),
    ("Arun Kumar", "33447788", "BH-61022"),
    ("Abdullah Saleh", "39112233", "BH-30478"),
    ("Bilal Ahmed", "35667788", "BH-72815"),
    ("Rashid Mahmood", "38990011", "BH-19364"),
]

TRUCKS = [
    ("412 873", Truck.Kind.REEFER, "Isuzu", "NPR", 2021, 4000),
    ("538 120", Truck.Kind.BOX, "Mitsubishi", "Fuso Canter", 2020, 3500),
    ("601 445", Truck.Kind.FLATBED, "Hino", "500", 2019, 9000),
    ("227 906", Truck.Kind.TRAILER, "Mercedes-Benz", "Actros", 2022, 25000),
    ("375 551", Truck.Kind.PICKUP, "Toyota", "Hilux", 2023, 1000),
    ("489 362", Truck.Kind.BOX, "Isuzu", "FRR", 2018, 7000),
]


def lerp(a, b, t):
    return a + (b - a) * t


class Command(BaseCommand):
    help = "Seed a realistic Bahrain demo dataset."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing fleet/load data first.")
        parser.add_argument("--admin-password", default="trucksy123")

    @transaction.atomic
    def handle(self, *args, **opts):
        rnd = random.Random(42)
        now = timezone.now()

        if opts["reset"]:
            LocationPing.objects.all().delete()
            LoadEvent.objects.all().delete()
            Load.objects.all().delete()
            for d in Driver.objects.all():
                d.user.delete()
            Truck.objects.all().delete()

        admin, created = User.objects.get_or_create(username="admin", defaults={
            "is_staff": True, "is_superuser": True, "first_name": "Ops", "last_name": "Manager",
            "email": "ops@trucksy.local"})
        if created:
            admin.set_password(opts["admin_password"])
            admin.save()

        trucks = []
        for plate, kind, make, model, year, cap in TRUCKS:
            t, _ = Truck.objects.get_or_create(plate_number=plate, defaults=dict(
                kind=kind, make=make, model=model, year=year, capacity_kg=cap,
                registration_expiry=(now + timedelta(days=rnd.randint(20, 300))).date(),
                insurance_expiry=(now + timedelta(days=rnd.randint(10, 320))).date()))
            trucks.append(t)

        drivers = []
        for i, (name, phone, lic) in enumerate(DRIVERS):
            user, ucreated = User.objects.get_or_create(username=phone, defaults={"first_name": name})
            if ucreated:
                user.set_password("1234")
                user.save()
            d, _ = Driver.objects.get_or_create(user=user, defaults=dict(
                full_name=name, phone=phone, cpr=f"{rnd.randint(800000000, 999999999)}",
                license_number=lic, license_expiry=(now + timedelta(days=rnd.randint(60, 900))).date(),
                truck=trucks[i]))
            drivers.append(d)

        if Load.objects.exists() and not opts["reset"]:
            self.stdout.write(self.style.WARNING("Loads already exist — skipping job creation (use --reset)."))
            return

        names = list(PLACES)

        def new_load(status, driver=None, created=None, price=None):
            a, b = rnd.sample(names, 2)
            cust, cargo = rnd.choice(CUSTOMERS)
            created = created or now
            ld = Load(
                customer_name=cust, customer_phone=f"+973 17{rnd.randint(100000, 999999)}",
                pickup_address=a, pickup_lat=PLACES[a][0], pickup_lng=PLACES[a][1],
                dropoff_address=b, dropoff_lat=PLACES[b][0], dropoff_lng=PLACES[b][1],
                cargo_description=cargo, weight_kg=rnd.choice([450, 800, 1200, 2500, 3200, 6000]),
                price=price or Decimal(rnd.choice([28, 35, 45, 55, 65, 80, 95, 120, 150])),
                scheduled_pickup=created + timedelta(hours=1), driver=driver,
                status=Load.Status.PENDING,
            )
            ld.save()
            Load.objects.filter(pk=ld.pk).update(created_at=created)
            ld.created_at = created
            LoadEvent.objects.create(load=ld, status=Load.Status.PENDING, note="Load created",
                                     created_by=admin, created_at=created)
            if driver:
                LoadEvent.objects.create(load=ld, status=Load.Status.ASSIGNED, note=f"Assigned to {driver.full_name}",
                                         created_by=admin, created_at=created + timedelta(minutes=5))
            flow = [Load.Status.ASSIGNED, Load.Status.TO_PICKUP, Load.Status.LOADED, Load.Status.IN_TRANSIT,
                    Load.Status.DELIVERED]
            if status in flow:
                t = created + timedelta(minutes=5)
                for st in flow[1:flow.index(status) + 1]:
                    t = min(t + timedelta(minutes=rnd.randint(12, 35)), now - timedelta(minutes=rnd.randint(1, 4)))
                    LoadEvent.objects.create(load=ld, status=st, created_by=driver.user, created_at=t,
                                             note="Goods received by store keeper" if st == Load.Status.DELIVERED else "")
                    if st == Load.Status.LOADED:
                        ld.picked_up_at = t
                    if st == Load.Status.DELIVERED:
                        ld.delivered_at = t
                        ld.proof_receiver_name = rnd.choice(["Ahmed", "Fatima", "Store keeper", "Sameer", "Reception"])
                ld.status = status
                ld.save()
            elif status == Load.Status.CANCELLED:
                ld.status = status
                ld.save()
                LoadEvent.objects.create(load=ld, status=status, note="Customer cancelled", created_by=admin,
                                         created_at=created + timedelta(minutes=30))
            return ld

        # A week of history (more deliveries on recent days so the trend climbs).
        for days_ago in range(6, -1, -1):
            for _ in range(rnd.randint(4, 7) + (6 - days_ago) // 2):
                created = (now - timedelta(days=days_ago)).replace(hour=rnd.randint(6, 11), minute=rnd.randint(0, 59))
                if created > now - timedelta(hours=3):
                    created = now - timedelta(hours=rnd.randint(3, 6))
                new_load(Load.Status.DELIVERED, rnd.choice(drivers), created)
        new_load(Load.Status.CANCELLED, None, now - timedelta(days=2))

        # Live jobs on the road right now, with a GPS trail.
        live = [
            (drivers[0], Load.Status.IN_TRANSIT, 0.62),
            (drivers[1], Load.Status.TO_PICKUP, 0.35),
            (drivers[2], Load.Status.LOADED, 0.0),
            (drivers[3], Load.Status.IN_TRANSIT, 0.25),
            (drivers[4], Load.Status.ASSIGNED, 0.0),
        ]
        for d, st, progress in live:
            ld = new_load(st, d, now - timedelta(hours=1, minutes=rnd.randint(0, 40)))
            # Heading to pickup: drive from a nearby point towards pickup; in transit: pickup → drop-off.
            if st == Load.Status.IN_TRANSIT:
                a = (ld.pickup_lat, ld.pickup_lng)
                b = (ld.dropoff_lat, ld.dropoff_lng)
            else:
                b = (ld.pickup_lat, ld.pickup_lng)
                a = (b[0] + rnd.uniform(-0.05, 0.05), b[1] + rnd.uniform(-0.06, 0.06))
                if st in (Load.Status.LOADED, Load.Status.ASSIGNED):
                    progress = 1.0 if st == Load.Status.LOADED else 0.0
            steps = max(2, int(30 * progress))
            pings = []
            for i in range(steps + 1):
                tt = progress * i / steps
                lat = lerp(a[0], b[0], tt) + rnd.uniform(-0.0012, 0.0012)
                lng = lerp(a[1], b[1], tt) + rnd.uniform(-0.0012, 0.0012)
                pings.append(LocationPing(driver=d, load=ld, lat=lat, lng=lng, speed_kmh=rnd.uniform(35, 75),
                                          heading=rnd.uniform(0, 360),
                                          recorded_at=now - timedelta(seconds=(steps - i) * 60)))
            LocationPing.objects.bulk_create(pings)
            last = pings[-1]
            d.last_lat, d.last_lng, d.last_speed_kmh = last.lat, last.lng, (0 if progress in (0, 1) else last.speed_kmh)
            d.last_heading = last.heading
            d.last_seen = now - timedelta(seconds=rnd.randint(5, 60))
            d.status = Driver.Status.ON_JOB
            d.save()

        # One driver available and idle at the port, one offline.
        d = drivers[5]
        d.last_lat, d.last_lng = PLACES["Bahrain Logistics Zone, Hidd"]
        d.last_seen, d.status = now - timedelta(minutes=2), Driver.Status.AVAILABLE
        d.save()

        for _ in range(3):
            new_load(Load.Status.PENDING, None, now - timedelta(minutes=rnd.randint(5, 90)))

        self.stdout.write(self.style.SUCCESS(
            "Demo ready.\n  Dashboard login: admin / %s\n  Driver app login: phone 34180130 (Yasir) / PIN 1234"
            % opts["admin_password"]))
