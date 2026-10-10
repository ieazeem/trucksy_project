from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from .models import Driver, Truck

User = get_user_model()


def normalize_phone(raw: str) -> str:
    """Keep digits and a leading +. '+973 3418-0130' -> '+97334180130'."""
    raw = (raw or "").strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    return ("+" + digits) if raw.startswith("+") else digits


class TruckSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    driver_name = serializers.SerializerMethodField()

    class Meta:
        model = Truck
        fields = [
            "id", "plate_number", "kind", "kind_label", "make", "model", "year", "capacity_kg",
            "registration_expiry", "insurance_expiry", "is_active", "driver_name",
        ]

    def get_driver_name(self, obj):
        d = obj.drivers.filter(is_active=True).first()
        return d.full_name if d else None


class TruckMiniSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Truck
        fields = ["id", "plate_number", "kind", "kind_label", "make", "model", "capacity_kg"]


class DriverSerializer(serializers.ModelSerializer):
    """Used by dispatchers to list / create / edit drivers."""

    truck = TruckMiniSerializer(read_only=True)
    truck_id = serializers.PrimaryKeyRelatedField(
        source="truck", queryset=Truck.objects.all(), allow_null=True, required=False, write_only=True
    )
    pin = serializers.CharField(write_only=True, required=False, min_length=4, max_length=12)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    is_live = serializers.BooleanField(read_only=True)

    class Meta:
        model = Driver
        fields = [
            "id", "full_name", "phone", "cpr", "license_number", "license_expiry",
            "truck", "truck_id", "status", "status_label", "is_live",
            "last_lat", "last_lng", "last_speed_kmh", "last_heading", "last_seen",
            "is_active", "pin", "created_at",
        ]
        read_only_fields = ["last_lat", "last_lng", "last_speed_kmh", "last_heading", "last_seen", "created_at"]

    def validate_phone(self, value):
        phone = normalize_phone(value)
        if len(phone.lstrip("+")) < 7:
            raise serializers.ValidationError("Enter a valid phone number.")
        qs = Driver.objects.filter(phone=phone)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A driver with this phone already exists.")
        return phone

    def validate(self, attrs):
        if not self.instance and not attrs.get("pin"):
            raise serializers.ValidationError({"pin": "Set a 4–12 digit PIN for the driver's app login."})
        return attrs

    @transaction.atomic
    def create(self, validated):
        pin = validated.pop("pin")
        user = User.objects.create_user(username=validated["phone"], password=pin,
                                        first_name=validated["full_name"][:150])
        return Driver.objects.create(user=user, **validated)

    @transaction.atomic
    def update(self, instance, validated):
        pin = validated.pop("pin", None)
        driver = super().update(instance, validated)
        user = driver.user
        user.username = driver.phone
        user.first_name = driver.full_name[:150]
        if pin:
            user.set_password(pin)
        user.save()
        return driver


class DriverMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Driver
        fields = ["id", "full_name", "phone"]


class DriverProfileSerializer(serializers.ModelSerializer):
    """What the driver sees about themselves in the app."""

    truck = TruckMiniSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Driver
        fields = ["id", "full_name", "phone", "cpr", "license_number", "license_expiry",
                  "truck", "status", "status_label", "last_seen"]


class LoginSerializer(serializers.Serializer):
    phone = serializers.CharField()
    pin = serializers.CharField()


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[Driver.Status.AVAILABLE, Driver.Status.OFFLINE, Driver.Status.BREAK])
