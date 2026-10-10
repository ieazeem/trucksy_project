from django.db import models
from drivers.models import Driver

class SensorData(models.Model):
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE)
    timestamp = models.DateTimeField(auto_now_add=True)
    weight = models.FloatField(help_text="Current load weight in tons")

    def __str__(self):
        return f"Sensor {self.driver.truck_id} - {self.weight} tons at {self.timestamp}"

