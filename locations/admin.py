from django.contrib import admin
from .models import Location

# ----------------------------
# Live Location Admin
# ----------------------------
@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ("id", "driver", "latitude", "longitude", "weight", "timestamp")
    list_filter = ("driver", "timestamp")
    search_fields = ("driver__name", "driver__truck_id")
