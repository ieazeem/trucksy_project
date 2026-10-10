from rest_framework.permissions import BasePermission


class IsDispatcher(BasePermission):
    """Office staff (Django staff users) — can manage everything."""

    message = "Dispatcher access required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsDriver(BasePermission):
    """A logged-in driver using the mobile app."""

    message = "Driver account required."

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and hasattr(u, "driver") and u.driver.is_active)
