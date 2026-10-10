from rest_framework import serializers

from .models import LocationPing, SensorReading


class PingInSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
    speed_kmh = serializers.FloatField(required=False, allow_null=True)
    heading = serializers.FloatField(required=False, allow_null=True)
    accuracy_m = serializers.FloatField(required=False, allow_null=True)
    recorded_at = serializers.DateTimeField(required=False)


class PingSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocationPing
        fields = ["lat", "lng", "speed_kmh", "heading", "recorded_at"]


class SensorReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SensorReading
        fields = ["id", "temperature_c", "weight_kg", "recorded_at", "load"]
        read_only_fields = ["id"]
