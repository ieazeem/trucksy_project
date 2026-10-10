from django.contrib import admin
from .models import Load

@admin.register(Load)
class LoadAdmin(admin.ModelAdmin):
    list_display = ("pickup_location", "drop_location", "weight_capacity", "status", "assigned_driver")
    search_fields = ("pickup_location", "drop_location")
    list_filter = ("status",)
