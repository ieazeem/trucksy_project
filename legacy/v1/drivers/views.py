from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.shortcuts import get_object_or_404, render
from django.http import HttpResponse
import datetime
import openpyxl
from .models import Driver, LocationHistory
from .serializers import DriverSerializer

# ---------------- Driver ViewSet ----------------
class DriverViewSet(viewsets.ModelViewSet):
    queryset = Driver.objects.all()
    serializer_class = DriverSerializer

# ---------------- Driver APIs ----------------
@api_view(['GET'])
def driver_status_api(request, pk):
    driver = get_object_or_404(Driver, pk=pk)
    latest_location = driver.driver_location_history.order_by('-timestamp').first()
    data = {
        "id": driver.id,
        "name": driver.name,
        "latitude": latest_location.latitude if latest_location else None,
        "longitude": latest_location.longitude if latest_location else None,
        "timestamp": latest_location.timestamp if latest_location else None,
        "active": True if latest_location else False
    }
    return Response(data)

@api_view(['POST'])
def update_driver_status(request, pk):
    driver = get_object_or_404(Driver, pk=pk)
    lat = request.data.get('latitude')
    lon = request.data.get('longitude')

    if lat is None or lon is None:
        return Response({"error": "Latitude and longitude required."}, status=status.HTTP_400_BAD_REQUEST)

    timestamp = request.data.get('timestamp')
    if timestamp:
        from datetime import datetime
        try:
            timestamp = datetime.fromisoformat(timestamp).replace(tzinfo=None)
        except:
            timestamp = None

    location = LocationHistory.objects.create(
        driver=driver, latitude=lat, longitude=lon, timestamp=timestamp
    )
    return Response({"success": True, "location_id": location.id})

@api_view(['GET'])
def all_drivers_status(request):
    drivers = Driver.objects.all()
    data = []
    for driver in drivers:
        latest_location = driver.driver_location_history.order_by('-timestamp').first()
        data.append({
            "id": driver.id,
            "name": driver.name,
            "phone": driver.phone,
            "assigned_vehicle": driver.assigned_vehicle,
            "latitude": latest_location.latitude if latest_location else None,
            "longitude": latest_location.longitude if latest_location else None,
            "timestamp": latest_location.timestamp if latest_location else None,
            "active": True if latest_location else False
        })
    return Response(data)

@api_view(['GET'])
def driver_history(request, pk):
    driver = get_object_or_404(Driver, pk=pk)
    start_date = request.GET.get('start')
    end_date = request.GET.get('end')

    locations = driver.driver_location_history.order_by('timestamp')
    if start_date and end_date:
        locations = locations.filter(timestamp__range=[start_date, end_date])

    data = []
    for loc in locations:
        data.append({
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "timestamp": loc.timestamp,
        })
    return Response(data)

# ---------------- Dashboard & Detail ----------------
def dashboard(request):
    drivers = Driver.objects.all()
    drivers_data = []
    for driver in drivers:
        latest_location = driver.driver_location_history.order_by('-timestamp').first()
        drivers_data.append({
            "name": driver.name,
            "license_number": driver.license_number,
            "assigned_vehicle": driver.assigned_vehicle,
            "latitude": latest_location.latitude if latest_location else None,
            "longitude": latest_location.longitude if latest_location else None,
            "active": True if latest_location else False
        })
    return render(request, "drivers/dashboard.html", {"drivers": drivers_data})

def driver_detail(request, pk):
    driver = get_object_or_404(Driver, pk=pk)
    latest_location = driver.driver_location_history.order_by('-timestamp').first()
    return render(request, "drivers/driver_detail.html", {"driver": driver, "location": latest_location})

# ---------------- Export Excel ----------------
def export_drivers_excel(request):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Drivers"
    headers = ["ID","Name","Phone","Assigned Vehicle","Active","Last Latitude","Last Longitude","Last Timestamp"]
    ws.append(headers)

    for driver in Driver.objects.all():
        latest_loc = driver.driver_location_history.order_by('-timestamp').first()
        ts = latest_loc.timestamp.replace(tzinfo=None) if latest_loc and latest_loc.timestamp else ''
        ws.append([
            driver.id, driver.name, driver.phone, driver.assigned_vehicle,
            True if latest_loc else False,
            latest_loc.latitude if latest_loc else '',
            latest_loc.longitude if latest_loc else '', ts
        ])

    response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    filename = f"drivers_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    response['Content-Disposition'] = f'attachment; filename={filename}'
    wb.save(response)
    return response
