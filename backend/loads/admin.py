from django.contrib import admin

from .models import Load, LoadEvent


class LoadEventInline(admin.TabularInline):
    model = LoadEvent
    extra = 0
    readonly_fields = ("status", "note", "lat", "lng", "created_by", "created_at")
    can_delete = False


@admin.register(Load)
class LoadAdmin(admin.ModelAdmin):
    list_display = ("reference", "customer_name", "pickup_address", "dropoff_address", "status", "driver", "price", "scheduled_pickup")
    list_filter = ("status",)
    search_fields = ("reference", "customer_name", "pickup_address", "dropoff_address")
    readonly_fields = ("reference", "tracking_code", "picked_up_at", "delivered_at")
    inlines = [LoadEventInline]
