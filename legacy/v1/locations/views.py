from rest_framework import viewsets
from .models import Location
from .serializers import LocationSerializer
import csv
from django.http import HttpResponse

class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.order_by("-timestamp")
    serializer_class = LocationSerializer

# ---------------------------
# Export locations to Excel
# ---------------------------
def export_locations_excel(request):
    # Get all locations with driver info
    locations = Location.objects.select_related('driver').all().order_by('-timestamp')

    # Prepare HTTP response with CSV content
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="driver_locations.csv"'

    writer = csv.writer(response)
    # CSV header
    writer.writerow(['Driver', 'Latitude', 'Longitude', 'Weight', 'Timestamp'])

    # Write each location
    for loc in locations:
        writer.writerow([
            loc.driver.name if loc.driver else '',
            loc.latitude,
            loc.longitude,
            loc.weight if loc.weight else '',
            loc.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        ])

    return response
