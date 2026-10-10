from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class Truck(models.Model):
    class Kind(models.TextChoices):
        PICKUP = "pickup", "Pickup (1 ton)"
        BOX = "box", "Box truck (3–7 ton)"
        FLATBED = "flatbed", "Flatbed"
        REEFER = "reefer", "Refrigerated (reefer)"
        TRAILER = "trailer", "Trailer / Semi"
        TANKER = "tanker", "Tanker"

    plate_number = models.CharField(max_length=20, unique=True)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.BOX)
    make = models.CharField(max_length=50, blank=True)
    model = models.CharField(max_length=50, blank=True)
    year = models.PositiveIntegerField(null=True, blank=True)
    capacity_kg = models.PositiveIntegerField(default=3000)
    registration_expiry = models.DateField(null=True, blank=True)
    insurance_expiry = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["plate_number"]

    def __str__(self):
        return f"{self.plate_number} · {self.get_kind_display()}"


class Driver(models.Model):
    class Status(models.TextChoices):
        OFFLINE = "offline", "Offline"
        AVAILABLE = "available", "Available"
        ON_JOB = "on_job", "On a job"
        BREAK = "break", "On break"

    # Each driver logs into the app with their phone number + a PIN.
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="driver")
    full_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, unique=True)
    cpr = models.CharField("CPR number", max_length=20, blank=True)
    license_number = models.CharField(max_length=40, blank=True)
    license_expiry = models.DateField(null=True, blank=True)
    truck = models.ForeignKey(Truck, null=True, blank=True, on_delete=models.SET_NULL, related_name="drivers")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OFFLINE)

    # Denormalised "last known position" so the live map is one cheap query.
    last_lat = models.FloatField(null=True, blank=True)
    last_lng = models.FloatField(null=True, blank=True)
    last_speed_kmh = models.FloatField(null=True, blank=True)
    last_heading = models.FloatField(null=True, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return self.full_name

    @property
    def is_live(self):
        if not self.last_seen:
            return False
        window = timedelta(minutes=settings.TRUCKSY_ONLINE_WINDOW_MIN)
        return timezone.now() - self.last_seen <= window and self.status != self.Status.OFFLINE

    @property
    def active_load(self):
        from loads.models import Load

        return self.loads.filter(status__in=Load.ACTIVE_STATUSES).order_by("scheduled_pickup", "id").first()
