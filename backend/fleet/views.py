"""Driver-app endpoints (`/api/auth/...`, `/api/me/...`) and dispatcher CRUD for drivers & trucks."""
from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from loads.models import Load
from loads.serializers import AdvanceSerializer, DriverLoadSerializer
from tracking.models import LocationPing, SensorReading
from tracking.serializers import PingInSerializer, SensorReadingSerializer

from .models import Driver, Truck
from .permissions import IsDispatcher, IsDriver
from .serializers import (
    DriverProfileSerializer, DriverSerializer, LoginSerializer, StatusSerializer, TruckSerializer,
    normalize_phone,
)


# ---------------------------------------------------------------- auth

class DriverLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        phone = normalize_phone(s.validated_data["phone"])
        user = authenticate(request, username=phone, password=s.validated_data["pin"])
        if not user or not hasattr(user, "driver") or not user.driver.is_active:
            return Response({"detail": "Wrong phone number or PIN."}, status=status.HTTP_400_BAD_REQUEST)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "driver": DriverProfileSerializer(user.driver).data})


class LogoutView(APIView):
    def post(self, request):
        if hasattr(request.user, "driver"):
            d = request.user.driver
            d.status = Driver.Status.OFFLINE
            d.save(update_fields=["status"])
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- driver "me"

class MeView(APIView):
    permission_classes = [IsDriver]

    def get(self, request):
        d = request.user.driver
        today = timezone.localdate()
        active = d.active_load
        return Response({
            "driver": DriverProfileSerializer(d).data,
            "active_load": DriverLoadSerializer(active, context={"request": request}).data if active else None,
            "stats": {
                "delivered_today": d.loads.filter(status=Load.Status.DELIVERED, delivered_at__date=today).count(),
                "delivered_total": d.loads.filter(status=Load.Status.DELIVERED).count(),
                "open_jobs": d.loads.filter(status__in=Load.ACTIVE_STATUSES).count(),
            },
        })


class MeStatusView(APIView):
    """Driver goes online / offline / on break."""

    permission_classes = [IsDriver]

    def post(self, request):
        s = StatusSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = request.user.driver
        new = s.validated_data["status"]
        if new == Driver.Status.AVAILABLE and d.loads.filter(status__in=Load.ACTIVE_STATUSES).exists():
            new = Driver.Status.ON_JOB
        d.status = new
        d.save(update_fields=["status"])
        return Response(DriverProfileSerializer(d).data)


class MeLocationView(APIView):
    """Receive one GPS point, or a batch: {"points": [...]} (used when the phone was offline)."""

    permission_classes = [IsDriver]

    def post(self, request):
        raw = request.data.get("points") if isinstance(request.data, dict) and "points" in request.data else [request.data]
        if not isinstance(raw, list) or not raw or len(raw) > 500:
            return Response({"detail": "Send 1–500 points."}, status=400)
        s = PingInSerializer(data=raw, many=True)
        s.is_valid(raise_exception=True)
        d = request.user.driver
        active = d.active_load
        now = timezone.now()
        pings = [
            LocationPing(driver=d, load=active, recorded_at=p.get("recorded_at") or now,
                         **{k: v for k, v in p.items() if k != "recorded_at"})
            for p in s.validated_data
        ]
        with transaction.atomic():
            LocationPing.objects.bulk_create(pings)
            latest = max(pings, key=lambda p: p.recorded_at)
            d.last_lat, d.last_lng = latest.lat, latest.lng
            d.last_speed_kmh, d.last_heading = latest.speed_kmh, latest.heading
            d.last_seen = now
            if d.status == Driver.Status.OFFLINE:
                d.status = Driver.Status.ON_JOB if active else Driver.Status.AVAILABLE
            d.save(update_fields=["last_lat", "last_lng", "last_speed_kmh", "last_heading", "last_seen", "status"])
        return Response({"saved": len(pings)}, status=201)


class MeSensorView(APIView):
    permission_classes = [IsDriver]

    def post(self, request):
        s = SensorReadingSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = request.user.driver
        s.save(driver=d, load=s.validated_data.get("load") or d.active_load)
        return Response(s.data, status=201)


class MeLoadsView(APIView):
    permission_classes = [IsDriver]

    def get(self, request):
        d = request.user.driver
        ctx = {"request": request}
        active = d.loads.filter(status__in=Load.ACTIVE_STATUSES).order_by("scheduled_pickup")
        history = d.loads.filter(status__in=[Load.Status.DELIVERED, Load.Status.CANCELLED]).order_by("-updated_at")[:30]
        return Response({
            "active": DriverLoadSerializer(active, many=True, context=ctx).data,
            "history": DriverLoadSerializer(history, many=True, context=ctx).data,
        })


class MeLoadAdvanceView(APIView):
    """Driver taps the big button: Start → Loaded → In transit → Delivered."""

    permission_classes = [IsDriver]

    def post(self, request, pk):
        d = request.user.driver
        load = Load.objects.filter(pk=pk, driver=d).first()
        if not load:
            return Response({"detail": "Job not found."}, status=404)
        s = AdvanceSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        target = s.validated_data["status"]
        if load.next_driver_status != target:
            return Response(
                {"detail": f"Can't move from '{load.get_status_display()}' to '{target}'."}, status=400
            )
        if target == Load.Status.DELIVERED and not s.validated_data.get("receiver_name"):
            return Response({"detail": "Enter the name of the person who received the goods."}, status=400)
        load.set_status(
            target, user=request.user, note=s.validated_data.get("note", ""),
            lat=s.validated_data.get("lat"), lng=s.validated_data.get("lng"),
            receiver=s.validated_data.get("receiver_name", ""),
        )
        return Response(DriverLoadSerializer(load, context={"request": request}).data)


# ---------------------------------------------------------------- dispatcher CRUD

class TruckViewSet(viewsets.ModelViewSet):
    permission_classes = [IsDispatcher]
    serializer_class = TruckSerializer
    queryset = Truck.objects.all().prefetch_related("drivers")


class DriverViewSet(viewsets.ModelViewSet):
    permission_classes = [IsDispatcher]
    serializer_class = DriverSerializer
    queryset = Driver.objects.select_related("truck", "user")

    def perform_destroy(self, instance):
        # Never hard-delete: keep their job history. Deactivate + revoke login.
        instance.is_active = False
        instance.status = Driver.Status.OFFLINE
        instance.save(update_fields=["is_active", "status"])
        Token.objects.filter(user=instance.user).delete()
        instance.user.is_active = False
        instance.user.save(update_fields=["is_active"])


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([])
def health(request):
    return Response({"ok": True, "service": "trucksy", "time": timezone.now()})
