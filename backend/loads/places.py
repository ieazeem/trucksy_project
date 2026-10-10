"""Tiny built-in gazetteer of common Bahrain freight locations.

When a dispatcher types one of these (or something containing it), the load gets map
coordinates automatically. Next upgrade: Google Places Autocomplete (see LAUNCH_GUIDE.md).
"""
PLACES = {
    "Khalifa Bin Salman Port, Hidd": (26.2027, 50.6720),
    "Bahrain Logistics Zone, Hidd": (26.2120, 50.6600),
    "Mina Salman Port": (26.2040, 50.6100),
    "Sitra Industrial Area": (26.1500, 50.6300),
    "Salmabad Industrial Area": (26.1785, 50.5260),
    "BIA Cargo Village, Muharraq": (26.2708, 50.6336),
    "Manama Central Market": (26.2318, 50.5800),
    "Seef District, Manama": (26.2361, 50.5376),
    "Riffa Views": (26.1300, 50.5550),
    "Isa Town Industrial": (26.1736, 50.5478),
    "Hamad Town Roundabout 1": (26.1150, 50.5070),
    "King Fahd Causeway Customs": (26.1860, 50.3300),
    "Juffair, Manama": (26.2120, 50.6040),
    "Tubli Warehouses": (26.2000, 50.5600),
    "Budaiya Highway": (26.2200, 50.4500),
    "Askar Industrial Zone": (26.0750, 50.6170),
}

ALIASES = {
    "hidd port": "Khalifa Bin Salman Port, Hidd", "khalifa port": "Khalifa Bin Salman Port, Hidd",
    "blz": "Bahrain Logistics Zone, Hidd", "mina salman": "Mina Salman Port", "sitra": "Sitra Industrial Area",
    "salmabad": "Salmabad Industrial Area", "airport": "BIA Cargo Village, Muharraq", "muharraq": "BIA Cargo Village, Muharraq",
    "central market": "Manama Central Market", "seef": "Seef District, Manama", "riffa": "Riffa Views",
    "isa town": "Isa Town Industrial", "hamad town": "Hamad Town Roundabout 1", "causeway": "King Fahd Causeway Customs",
    "juffair": "Juffair, Manama", "tubli": "Tubli Warehouses", "budaiya": "Budaiya Highway", "askar": "Askar Industrial Zone",
}


def lookup(address: str):
    a = (address or "").strip().lower()
    if not a:
        return None
    for name, coords in PLACES.items():
        if name.lower() == a or name.lower() in a:
            return coords
    for alias, name in ALIASES.items():
        if alias in a:
            return PLACES[name]
    return None
