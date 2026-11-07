import json
import re
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"C:\Users\vraj\.gemini\antigravity\brain\889e2a14-13f8-46ec-b794-c1b8080bbc6e\scratch")

import test_parser

cities = test_parser.cities
print(f"Total places parsed: {len(cities)}")

# Save priority Indian cities and community international hubs
priority_codes = {'IN', 'AE', 'US', 'GB', 'CA', 'KE', 'TZ'}
priority_cities = [
    {
        "name": c['city_name'],
        "state": c['state_name'],
        "country": c['country_name']
    }
    for c in cities if c['country_code'] in priority_codes
]
print(f"Priority / India cities: {len(priority_cities)}")

with open("src/constants/world_cities_priority.json", "w", encoding="utf-8") as f:
    json.dump(priority_cities, f, ensure_ascii=False)

print("Saved src/constants/world_cities_priority.json.")
