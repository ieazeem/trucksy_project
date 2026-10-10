from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APITestCase

from fleet.models import Driver
from loads.models import Load

User = get_user_model()


class TrucksyFlowTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("boss", password="x", is_staff=True)
        self.client.force_authenticate(self.admin)
        r = self.client.post("/api/drivers/", {"full_name": "Yasir Ali", "phone": "+973 3418-0130", "pin": "1234"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.driver = Driver.objects.get(pk=r.data["id"])
        self.client.force_authenticate(None)

    def login_driver(self, phone="+97334180130", pin="1234"):
        r = self.client.post("/api/auth/driver/login/", {"phone": phone, "pin": pin}, format="json")
        if r.status_code == 200:
            self.client.credentials(HTTP_AUTHORIZATION="Token " + r.data["token"])
        return r

    def test_health_is_public(self):
        self.assertEqual(self.client.get("/api/health/").status_code, 200)

    def test_driver_login_normalises_phone_and_rejects_bad_pin(self):
        self.assertEqual(self.login_driver(pin="0000").status_code, 400)
        r = self.login_driver(phone="+973 3418 0130")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["driver"]["full_name"], "Yasir Ali")

    def test_api_requires_auth_and_drivers_cannot_use_dispatcher_api(self):
        self.assertEqual(self.client.get("/api/me/").status_code, 401)
        self.login_driver()
        self.assertEqual(self.client.get("/api/loads/").status_code, 403)
        self.assertEqual(self.client.get("/api/dashboard/").status_code, 403)

    def test_location_single_and_batch(self):
        self.login_driver()
        r = self.client.post("/api/me/location/", {"lat": 26.2285, "lng": 50.586, "speed_kmh": 40}, format="json")
        self.assertEqual(r.status_code, 201)
        r = self.client.post("/api/me/location/", {"points": [{"lat": 26.1, "lng": 50.5}, {"lat": 26.2, "lng": 50.6}]}, format="json")
        self.assertEqual(r.data["saved"], 2)
        self.driver.refresh_from_db()
        self.assertIsNotNone(self.driver.last_seen)
        self.assertEqual(self.driver.status, Driver.Status.AVAILABLE)
        bad = self.client.post("/api/me/location/", {"lat": 200, "lng": 50}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_full_job_lifecycle(self):
        # Dispatcher creates & assigns a load
        self.client.force_authenticate(self.admin)
        r = self.client.post("/api/loads/", {
            "customer_name": "Pearl Coast Foods", "pickup_address": "Hidd Port",
            "dropoff_address": "Seef", "weight_kg": 1200, "price": "45.000", "driver_id": self.driver.id,
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        load_id = r.data["id"]
        self.assertTrue(r.data["reference"].startswith("TRK-"))
        self.assertEqual(r.data["status"], "assigned")
        code = r.data["tracking_code"]
        self.client.force_authenticate(None)

        # Driver works the job
        self.login_driver()
        me = self.client.get("/api/me/").data
        self.assertEqual(me["active_load"]["id"], load_id)
        self.assertNotIn("price", me["active_load"])  # drivers don't see pricing

        # Can't skip steps
        r = self.client.post(f"/api/me/loads/{load_id}/advance/", {"status": "delivered"}, format="json")
        self.assertEqual(r.status_code, 400)

        for st in ["to_pickup", "loaded", "in_transit"]:
            r = self.client.post(f"/api/me/loads/{load_id}/advance/", {"status": st}, format="json")
            self.assertEqual(r.status_code, 200, r.data)

        # Delivery needs a receiver name (proof of delivery)
        r = self.client.post(f"/api/me/loads/{load_id}/advance/", {"status": "delivered"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post(f"/api/me/loads/{load_id}/advance/", {"status": "delivered", "receiver_name": "Ahmed"}, format="json")
        self.assertEqual(r.status_code, 200)

        load = Load.objects.get(pk=load_id)
        self.assertEqual(load.status, "delivered")
        self.assertIsNotNone(load.picked_up_at)
        self.assertEqual(load.events.count(), 6)  # created, assigned, 4 driver steps
        self.driver.refresh_from_db()
        self.assertNotEqual(self.driver.status, Driver.Status.ON_JOB)

        # Customer tracking link is public and hides pricing
        self.client.credentials()
        pub = self.client.get(f"/api/public/track/{code}/").data
        self.assertEqual(pub["status"], "delivered")
        self.assertNotIn("price", pub)
        self.assertEqual(self.client.get(f"/t/{code}/").status_code, 200)

    def test_driver_cannot_touch_other_drivers_load(self):
        other = Load.objects.create(customer_name="X", pickup_address="A", dropoff_address="B", status="assigned")
        self.login_driver()
        r = self.client.post(f"/api/me/loads/{other.id}/advance/", {"status": "to_pickup"}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_deleting_driver_deactivates_and_revokes_login(self):
        self.client.force_authenticate(self.admin)
        self.client.delete(f"/api/drivers/{self.driver.id}/")
        self.client.force_authenticate(None)
        self.assertEqual(self.login_driver().status_code, 400)
        self.assertTrue(Driver.objects.filter(pk=self.driver.pk).exists())

    def test_seed_and_dashboard(self):
        call_command("seed_demo", "--reset", verbosity=0)
        self.client.force_authenticate(self.admin)
        r = self.client.get("/api/dashboard/")
        self.assertEqual(r.status_code, 200)
        self.assertGreater(r.data["kpis"]["loads_active"], 0)
        self.assertEqual(len(r.data["trend"]), 7)
