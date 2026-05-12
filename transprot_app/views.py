# transprot_app/views.py
from django.shortcuts import redirect
from django.views.generic import TemplateView

# Project-level dashboard page (if needed)
def home_redirect(request):
    return redirect('dashboard')  # Redirect root URL to the dashboard
