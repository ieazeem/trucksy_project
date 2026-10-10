import secrets
from decimal import Decimal

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone


def _tracking_code():
    # Short, unguessable code used in the public customer tracking link.
    return secrets.token_urlsafe(8)


class Load(models.Model):
    """A delivery job: move cargo from A to B for a customer."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ASSIGNED = "assigned", "Assigned"
        TO_PICKUP = "to_pickup", "Heading to pickup"
        LOADED = "loaded", "Loaded"
        IN_TRANSIT = "in_transit", "In transit"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    ACTIVE_STATUSES = [Status.ASSIGNED, Status.TO_PICKUP, Status.LOADED, Status.IN_TRANSIT]

    # The only moves a driver is allowed to make from the app.
    DRIVER_FLOW = {
        Status.ASSIGNED: Status.TO_PICKUP,
        Status.TO_PICKUP: Status.LOADED,
        Status.LOADED: Status.IN_TRANSIT,
        Status.IN_TRANSIT: Status.DELIVERED,
    }

    reference = models.CharField(max_length=20, unique=True, editable=False)
    tracking_code = models.CharField(max_length=20, unique=True, default=_tracking_code, editable=False)

    customer_name = models.CharField(max_length=120)
    customer_phone = models.CharField(max_length=20, blank=True)

    pickup_address = models.CharField(max_length=255)
    pickup_lat = models.FloatField(null=True, blank=True)
    pickup_lng = models.FloatField(null=True, blank=True)
    dropoff_address = models.CharField(max_length=255)
    dropoff_lat = models.FloatField(null=True, blank=True)
    dropoff_lng = models.FloatField(null=True, blank=True)

    cargo_description = models.CharField(max_length=255, blank=True)
    weight_kg = models.PositiveIntegerField(default=0)
    price = models.DecimalField(max_digits=10, decimal_places=3, default=Decimal("0.000"))
    notes = models.TextField(blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    driver = models.ForeignKey(
        "fleet.Driver", null=True, blank=True, on_delete=models.SET_NULL, related_name="loads"
    )

    scheduled_pickup = models.DateTimeField(default=timezone.now)
    picked_up_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    proof_receiver_name = models.CharField(max_length=120, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reference} · {self.customer_name}"

    def save(self, *args, **kwargs):
        if not self.reference:
            with transaction.atomic():
                super().save(*args, **kwargs)
                self.reference = f"TRK-{self.pk:05d}"
                super().save(update_fields=["reference"])
            return
        super().save(*args, **kwargs)

    # ---- business logic -------------------------------------------------

    @property
    def is_active(self):
        return self.status in self.ACTIVE_STATUSES

    @property
    def next_driver_status(self):
        return self.DRIVER_FLOW.get(self.status)

    def assign(self, driver, by_user=None):
        self.driver = driver
        if driver and self.status == self.Status.PENDING:
            self.status = self.Status.ASSIGNED
        elif not driver and self.status == self.Status.ASSIGNED:
            self.status = self.Status.PENDING
        self.save()
        self.log(self.status, f"Assigned to {driver.full_name}" if driver else "Unassigned", user=by_user)

    def set_status(self, new_status, *, user=None, note="", lat=None, lng=None, receiver=""):
        now = timezone.now()
        self.status = new_status
        if new_status == self.Status.LOADED and not self.picked_up_at:
            self.picked_up_at = now
        if new_status == self.Status.DELIVERED:
            self.delivered_at = now
            if receiver:
                self.proof_receiver_name = receiver
        self.save()
        self.log(new_status, note, user=user, lat=lat, lng=lng)

        # Keep the driver's status in sync with their work.
        if self.driver_id:
            from fleet.models import Driver

            busy = self.driver.loads.filter(status__in=self.ACTIVE_STATUSES).exists()
            target = Driver.Status.ON_JOB if busy else Driver.Status.AVAILABLE
            if self.driver.status != Driver.Status.OFFLINE and self.driver.status != target:
                self.driver.status = target
                self.driver.save(update_fields=["status"])

    def log(self, status, note="", *, user=None, lat=None, lng=None):
        return LoadEvent.objects.create(
            load=self, status=status, note=note, lat=lat, lng=lng, created_by=user
        )


class LoadEvent(models.Model):
    """Audit trail — every status change, who did it, and where."""

    load = models.ForeignKey(Load, on_delete=models.CASCADE, related_name="events")
    status = models.CharField(max_length=20, choices=Load.Status.choices)
    note = models.CharField(max_length=255, blank=True)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.load.reference} → {self.status}"
