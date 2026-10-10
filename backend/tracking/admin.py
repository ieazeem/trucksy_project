from django.contrib import admin

from .models import LocationPing, SensorReading


@admin.register(LocationPing)
class LocationPingAdmin(admin.ModelAdmin):
    list_display = ("driver", "lat", "lng", "speed_kmh", "load", "recorded_at")
    list_filter = ("driver",)
    date_hierarchy = "recorded_at"


@admin.register(SensorReading)
class SensorReadingAdmin(admin.ModelAdmin):
    list_display = ("driver", "temperature_c", "weight_kg", "load", "recorded_at")
