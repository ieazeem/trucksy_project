from django.urls import path
from .views import (
    DriverViewSet, driver_status_api, update_driver_status, all_drivers_status,
    driver_history, driver_detail, dashboard, export_drivers_excel
)
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'drivers', DriverViewSet, basename='driver')

urlpatterns = [
    path('drivers/<int:pk>/status/', driver_status_api, name='driver-status'),
    path('drivers/<int:pk>/update/', update_driver_status, name='update-driver-status'),
    path('drivers/all/', all_drivers_status, name='all-drivers-status'),
    path('drivers/<int:pk>/history/', driver_history, name='driver-history'),
    path('drivers/<int:pk>/detail/', driver_detail, name='driver-detail'),
    path('dashboard/', dashboard, name='dashboard'),
    path('export/drivers/', export_drivers_excel, name='export-drivers-excel'),
]

urlpatterns += router.urls
