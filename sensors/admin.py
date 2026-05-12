from django.contrib import admin
from .models import SensorData

@admin.register(SensorData)
class SensorDataAdmin(admin.ModelAdmin):
    list_display = ("driver", "weight", "timestamp")
    search_fields = ("driver__truck_id",)
    list_filter = ("timestamp",)
