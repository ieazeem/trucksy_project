# transprot_app/urls.py
from django.contrib import admin
from django.urls import path, include
from django.shortcuts import redirect
from rest_framework.routers import DefaultRouter
from django.conf import settings
from django.conf.urls.static import static

from drivers.views import (
    DriverViewSet,
    driver_detail,
    driver_status_api,
    update_driver_status,
    all_drivers_status,
    driver_history,
    dashboard,
    export_drivers_excel
)

# ------------------------
# Router for API endpoints
# ------------------------
router = DefaultRouter()
router.register(r'drivers', DriverViewSet, basename='drivers')

# ------------------------
# URL patterns
# ------------------------
urlpatterns = [
    path('admin/', admin.site.urls),

    # API endpoints
    path('api/', include(router.urls)),
    path('api/driver/<int:pk>/status/', driver_status_api, name="driver_status_api"),
    path('api/driver/<int:pk>/update/', update_driver_status, name="update_driver_status"),
    path('api/drivers/status/all/', all_drivers_status, name="all_drivers_status"),
    path('api/drivers/<int:pk>/history/', driver_history, name="driver_history"),

    # Dashboard pages
    path('dashboard/', dashboard, name='dashboard'),
    path('dashboard/driver/<int:pk>/', driver_detail, name="driver_detail"),

    # Export Excel
    path('export/drivers/', export_drivers_excel, name='export_drivers_excel'),

    # Redirect root to dashboard
    path('', lambda request: redirect('dashboard/')),
]

# ------------------------
# Serve static files in development
# ------------------------
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
