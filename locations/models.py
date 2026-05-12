from django.db import models
from drivers.models import Driver

class Location(models.Model):
    driver = models.ForeignKey(
        Driver,
        on_delete=models.CASCADE,
        related_name="driver_locations"  # <-- updated related_name
    )
    latitude = models.FloatField()
    longitude = models.FloatField()
    weight = models.FloatField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.driver.name} @ {self.timestamp}"
