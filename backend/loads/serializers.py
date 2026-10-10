from rest_framework import serializers

from fleet.models import Driver
from fleet.serializers import DriverMiniSerializer, TruckMiniSerializer

from .models import Load, LoadEvent
from .places import lookup


class LoadEventSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    by = serializers.SerializerMethodField()
    reference = serializers.CharField(source="load.reference", read_only=True)

    class Meta:
        model = LoadEvent
        fields = ["id", "reference", "status", "status_label", "note", "lat", "lng", "by", "created_at"]

    def get_by(self, obj):
        u = obj.created_by
        if not u:
            return "System"
        if hasattr(u, "driver"):
            return u.driver.full_name
        return u.get_full_name() or u.username


class LoadSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    driver = DriverMiniSerializer(read_only=True)
    driver_id = serializers.PrimaryKeyRelatedField(
        source="driver", queryset=Driver.objects.filter(is_active=True),
        allow_null=True, required=False, write_only=True,
    )
    truck = serializers.SerializerMethodField()
    next_driver_status = serializers.CharField(read_only=True, allow_null=True)
    tracking_url = serializers.SerializerMethodField()

    class Meta:
        model = Load
        fields = [
            "id", "reference", "tracking_code", "tracking_url",
            "customer_name", "customer_phone",
            "pickup_address", "pickup_lat", "pickup_lng",
            "dropoff_address", "dropoff_lat", "dropoff_lng",
            "cargo_description", "weight_kg", "price", "notes",
            "status", "status_label", "next_driver_status",
            "driver", "driver_id", "truck",
            "scheduled_pickup", "picked_up_at", "delivered_at", "proof_receiver_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["reference", "tracking_code", "status", "picked_up_at", "delivered_at",
                            "proof_receiver_name", "created_at", "updated_at"]

    def validate(self, attrs):
        # Fill map coordinates for known Bahrain places when none were given.
        for side in ("pickup", "dropoff"):
            addr = attrs.get(f"{side}_address")
            if addr and attrs.get(f"{side}_lat") is None:
                coords = lookup(addr)
                if coords:
                    attrs[f"{side}_lat"], attrs[f"{side}_lng"] = coords
        return attrs

    def get_truck(self, obj):
        if obj.driver and obj.driver.truck:
            return TruckMiniSerializer(obj.driver.truck).data
        return None

    def get_tracking_url(self, obj):
        request = self.context.get("request")
        path = f"/t/{obj.tracking_code}/"
        return request.build_absolute_uri(path) if request else path

    def create(self, validated):
        driver = validated.get("driver")
        load = super().create(validated)
        user = self.context["request"].user if "request" in self.context else None
        load.log(Load.Status.PENDING, "Load created", user=user)
        if driver:
            load.assign(driver, by_user=user)
        return load

    def update(self, instance, validated):
        driver_changed = "driver" in validated and validated["driver"] != instance.driver
        new_driver = validated.pop("driver", None)
        load = super().update(instance, validated)
        if driver_changed:
            user = self.context["request"].user if "request" in self.context else None
            load.assign(new_driver, by_user=user)
        return load


class DriverLoadSerializer(LoadSerializer):
    """Driver app view of a job — no price, no internal notes needed beyond instructions."""

    class Meta(LoadSerializer.Meta):
        fields = [f for f in LoadSerializer.Meta.fields if f not in {"price", "driver_id"}]


class AdvanceSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Load.Status.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)
    lat = serializers.FloatField(required=False, allow_null=True)
    lng = serializers.FloatField(required=False, allow_null=True)
    receiver_name = serializers.CharField(required=False, allow_blank=True, max_length=120)


class PublicTrackSerializer(serializers.ModelSerializer):
    """What a customer sees from the share link — nothing sensitive."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    driver_first_name = serializers.SerializerMethodField()
    truck_plate = serializers.SerializerMethodField()
    live_location = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()

    class Meta:
        model = Load
        fields = ["reference", "status", "status_label", "pickup_address", "dropoff_address",
                  "pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng",
                  "scheduled_pickup", "picked_up_at", "delivered_at", "proof_receiver_name",
                  "driver_first_name", "truck_plate", "live_location", "events"]

    def get_driver_first_name(self, obj):
        return obj.driver.full_name.split()[0] if obj.driver else None

    def get_truck_plate(self, obj):
        return obj.driver.truck.plate_number if obj.driver and obj.driver.truck else None

    def get_live_location(self, obj):
        # Only share the truck's position while the job is actually moving.
        d = obj.driver
        if d and obj.is_active and d.last_lat is not None:
            return {"lat": d.last_lat, "lng": d.last_lng, "at": d.last_seen}
        return None

    def get_events(self, obj):
        return [
            {"status": e.status, "label": e.get_status_display(), "at": e.created_at}
            for e in obj.events.order_by("created_at")
        ]
