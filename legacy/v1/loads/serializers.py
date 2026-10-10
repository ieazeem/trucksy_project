from rest_framework import serializers
from .models import Load

class LoadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Load
        fields = "__all__"
