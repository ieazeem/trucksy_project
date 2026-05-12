from django.db import models
from drivers.models import Driver

class Load(models.Model):
    pickup_location = models.CharField(max_length=200)
    drop_location = models.CharField(max_length=200)
    weight_capacity = models.FloatField(help_text="Weight in tons")
    assigned_driver = models.ForeignKey(Driver, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=[
        ("open", "Open"),
        ("assigned", "Assigned"),
        ("completed", "Completed")
    ], default="open")

    def __str__(self):
        return f"Load {self.id} - {self.pickup_location} → {self.drop_location}"
