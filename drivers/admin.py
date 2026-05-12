# C:\USERS\AZEEM\ONEDRIVE\DESKTOP\AZEEM\TRANSPORT_aPP_PROJECT\TRANSPROT_APP\drivers\admin.py

from django.contrib import admin
from .models import Driver, LocationHistory


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ("name", "license_number", "phone", "assigned_vehicle", "joined_date")
    search_fields = ("name", "license_number")



@admin.register(LocationHistory)
class LocationHistoryAdmin(admin.ModelAdmin):
    list_display = ("driver", "latitude", "longitude", "timestamp")
    list_filter = ("driver",)
