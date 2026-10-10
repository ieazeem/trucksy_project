from django.contrib import admin

from .models import Driver, Truck


@admin.register(Truck)
class TruckAdmin(admin.ModelAdmin):
    list_display = ("plate_number", "kind", "make", "model", "capacity_kg", "registration_expiry", "insurance_expiry", "is_active")
    list_filter = ("kind", "is_active")
    search_fields = ("plate_number", "make", "model")


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ("full_name", "phone", "truck", "status", "last_seen", "is_active")
    list_filter = ("status", "is_active")
    search_fields = ("full_name", "phone", "cpr", "license_number")
    raw_id_fields = ("user",)
