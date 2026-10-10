from django.db import models
from django.utils import timezone


class LocationPing(models.Model):
    """One GPS point sent by the driver app. Replaces the old duplicate
    `drivers_locationhistory` + `locations_location` tables."""

    driver = models.ForeignKey("fleet.Driver", on_delete=models.CASCADE, related_name="pings")
    load = models.ForeignKey("loads.Load", null=True, blank=True, on_delete=models.SET_NULL, related_name="pings")
    lat = models.FloatField()
    lng = models.FloatField()
    speed_kmh = models.FloatField(null=True, blank=True)
    heading = models.FloatField(null=True, blank=True)
    accuracy_m = models.FloatField(null=True, blank=True)
    recorded_at = models.DateTimeField(default=timezone.now, db_index=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at"]
        indexes = [models.Index(fields=["driver", "-recorded_at"])]

    def __str__(self):
        return f"{self.driver} @ {self.lat:.5f},{self.lng:.5f}"


class SensorReading(models.Model):
    """Optional IoT data (cargo temperature for reefers, axle weight, etc.).
    Replaces the old duplicate `drivers_sensor` + `sensors_sensordata` tables."""

    driver = models.ForeignKey("fleet.Driver", on_delete=models.CASCADE, related_name="sensor_readings")
    load = models.ForeignKey("loads.Load", null=True, blank=True, on_delete=models.SET_NULL)
    temperature_c = models.FloatField(null=True, blank=True)
    weight_kg = models.FloatField(null=True, blank=True)
    recorded_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-recorded_at"]
