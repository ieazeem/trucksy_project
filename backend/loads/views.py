from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from fleet.models import Driver, Truck
from fleet.permissions import IsDispatcher
from fleet.serializers import DriverSerializer
from tracking.serializers import PingSerializer

from .models import Load, LoadEvent
from .serializers import AdvanceSerializer, LoadEventSerializer, LoadSerializer, PublicTrackSerializer
from tracking.gaps import gap_minutes, silent_drivers


class LoadViewSet(viewsets.ModelViewSet):
    permission_classes = [IsDispatcher]
    serializer_class = LoadSerializer

    def get_queryset(self):
        qs = Load.objects.select_related("driver", "driver__truck")
        p = self.request.query_params
        if p.get("status") == "active":
            qs = qs.filter(status__in=Load.ACTIVE_STATUSES)
        elif p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("driver"):
            qs = qs.filter(driver_id=p["driver"])
        if p.get("from") or p.get("to"):
            from reports.excel import parse_period
            _, _, start, end = parse_period(p, default_days=30)
            qs = qs.filter(scheduled_pickup__gte=start, scheduled_pickup__lt=end)
        if p.get("q"):
            q = p["q"]
            qs = qs.filter(Q(reference__icontains=q) | Q(customer_name__icontains=q)
                           | Q(pickup_address__icontains=q) | Q(dropoff_address__icontains=q))
        return qs

    @action(detail=True, methods=["post"])
    def set_status(self, request, pk=None):
        """Dispatcher override — can move a load to any status (e.g. cancel)."""
        load = self.get_object()
        s = AdvanceSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        load.set_status(s.validated_data["status"], user=request.user,
                        note=s.validated_data.get("note") or "Updated by dispatcher",
                        receiver=s.validated_data.get("receiver_name", ""))
        return Response(self.get_serializer(load).data)

    @action(detail=True, methods=["get"])
    def events(self, request, pk=None):
        load = self.get_object()
        return Response(LoadEventSerializer(load.events.select_related("created_by", "load"), many=True).data)

    @action(detail=True, methods=["get"])
    def route(self, request, pk=None):
        load = self.get_object()
        pings = load.pings.order_by("recorded_at")[:2000]
        return Response(PingSerializer(pings, many=True).data)


class DashboardView(APIView):
    """Everything the dispatcher home screen needs, in one request."""

    permission_classes = [IsDispatcher]

    def get(self, request):
        now = timezone.now()
        today = timezone.localdate()
        window = now - timedelta(minutes=10)

        drivers = Driver.objects.filter(is_active=True).select_related("truck")
        delivered_today = Load.objects.filter(status=Load.Status.DELIVERED, delivered_at__date=today)
        revenue_today = delivered_today.aggregate(s=Sum("price"))["s"] or Decimal("0")
        week_start = today - timedelta(days=6)

        by_day = {
            r["delivered_at__date"]: r
            for r in Load.objects.filter(status=Load.Status.DELIVERED, delivered_at__date__gte=week_start)
            .values("delivered_at__date").annotate(n=Count("id"), revenue=Sum("price"))
        }
        trend = []
        for i in range(7):
            day = week_start + timedelta(days=i)
            r = by_day.get(day, {})
            trend.append({"date": day.isoformat(), "deliveries": r.get("n", 0),
                          "revenue": float(r.get("revenue") or 0)})

        counts = dict(Load.objects.values_list("status").annotate(n=Count("id")))
        on_time_base = Load.objects.filter(status=Load.Status.DELIVERED, delivered_at__date__gte=week_start)

        return Response({
            "kpis": {
                "drivers_live": drivers.filter(last_seen__gte=window).exclude(status=Driver.Status.OFFLINE).count(),
                "drivers_total": drivers.count(),
                "loads_active": sum(counts.get(s, 0) for s in Load.ACTIVE_STATUSES),
                "loads_pending": counts.get(Load.Status.PENDING, 0),
                "delivered_today": delivered_today.count(),
                "revenue_today": float(revenue_today),
                "deliveries_week": on_time_base.count(),
                "trucks_total": Truck.objects.filter(is_active=True).count(),
            },
            "status_counts": counts,
            "trend": trend,
            "drivers": DriverSerializer(drivers, many=True).data,
            "active_loads": LoadSerializer(
                Load.objects.filter(status__in=Load.ACTIVE_STATUSES).select_related("driver", "driver__truck"),
                many=True, context={"request": request},
            ).data,
            "events": LoadEventSerializer(
                LoadEvent.objects.select_related("load", "created_by", "created_by__driver")[:15], many=True
            ).data,
            "alerts": silent_drivers(drivers, now),
            "currency": "BHD",
            "gap_alert_minutes": gap_minutes(),
            "server_time": now,
        })


# ---------------------------------------------------------------- public customer tracking

@api_view(["GET"])
@permission_classes([AllowAny])
def public_track_api(request, code):
    load = get_object_or_404(Load.objects.select_related("driver", "driver__truck"), tracking_code=code)
    return Response(PublicTrackSerializer(load).data)


def public_track_page(request, code):
    load = get_object_or_404(Load, tracking_code=code)
    return render(request, "dashboard/track.html", {"load": load, "code": code})
