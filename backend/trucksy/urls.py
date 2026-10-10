from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.contrib.admin.views.decorators import staff_member_required
from django.shortcuts import render
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from fleet import views as fleet
from loads import views as loads
from reports import views as reports

router = DefaultRouter()
router.register("trucks", fleet.TruckViewSet, basename="truck")
router.register("drivers", fleet.DriverViewSet, basename="driver")
router.register("loads", loads.LoadViewSet, basename="load")

admin.site.site_header = "Trucksy Admin"
admin.site.site_title = "Trucksy"
admin.site.index_title = "Operations data"


@staff_member_required(login_url="/login/")
def dashboard(request):
    return render(request, "dashboard/app.html")


api = [
    path("health/", fleet.health),
    # driver app
    path("auth/driver/login/", fleet.DriverLoginView.as_view()),
    path("auth/logout/", fleet.LogoutView.as_view()),
    path("me/", fleet.MeView.as_view()),
    path("me/status/", fleet.MeStatusView.as_view()),
    path("me/location/", fleet.MeLocationView.as_view()),
    path("me/sensor/", fleet.MeSensorView.as_view()),
    path("me/loads/", fleet.MeLoadsView.as_view()),
    path("me/loads/<int:pk>/advance/", fleet.MeLoadAdvanceView.as_view()),
    # dispatcher
    path("dashboard/", loads.DashboardView.as_view()),
    path("drivers/<int:pk>/history/", reports.DriverHistoryView.as_view()),
    # Excel exports (dispatcher only)
    path("reports/operations.xlsx", reports.OperationsReportView.as_view()),
    path("reports/loads.xlsx", reports.LoadsExportView.as_view()),
    path("reports/drivers.xlsx", reports.DriversExportView.as_view()),
    path("reports/drivers/<int:pk>/route.xlsx", reports.DriverRouteExportView.as_view()),
    path("", include(router.urls)),
    # public
    path("public/track/<str:code>/", loads.public_track_api),
]

urlpatterns = [
    path("", dashboard, name="dashboard"),
    path("login/", auth_views.LoginView.as_view(template_name="dashboard/login.html",
                                                 redirect_authenticated_user=True), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("t/<str:code>/", loads.public_track_page, name="track"),
    path("api/", include(api)),
    path("admin/", admin.site.urls),
]
