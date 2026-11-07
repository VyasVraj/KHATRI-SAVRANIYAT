import re
import sys
import json
import uuid
import fitz

sys.stdout.reconfigure(encoding='utf-8')

pdf_path = r"C:\Users\vraj\.gemini\antigravity\brain\889e2a14-13f8-46ec-b794-c1b8080bbc6e\.user_uploaded\media_1794042183211_e5e907b4.pdf"
doc = fitz.open(pdf_path)

print(f"Reading {len(doc)} pages of PDF...")

country_pattern = re.compile(r"^(.+?)\s+\(([A-Z0-9]{2,3})\)$")
state_pattern = re.compile(r"^(.+?)[\s\u00a0]+[—–\-\u2014\u2013\u2212][\s\u00a0]+([\d,]+)[\s\u00a0]+places?$")

countries = []
states = []
cities = []

country_code_map = {}
state_map = {}

current_country = None
current_state = None
current_city_buffer = ""

def flush_city_buffer():
    global current_city_buffer, current_country, current_state
    if not current_city_buffer.strip() or not current_state or not current_country:
        current_city_buffer = ""
        return
    parts = [p.strip() for p in current_city_buffer.split(",") if p.strip()]
    for p in parts:
        cities.append({
            "country_code": current_country["code"],
            "country_name": current_country["name"],
            "state_name": current_state["name"],
            "city_name": p
        })
    current_city_buffer = ""

for page_idx in range(1, len(doc)):
    page = doc[page_idx]
    lines = page.get_text().splitlines()
    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            continue
        if line_clean == "World Countries, States & Cities" or re.match(r"^Page \d+$", line_clean):
            continue
        
        m_state = state_pattern.match(line_clean)
        if m_state:
            flush_city_buffer()
            state_name = m_state.group(1).strip()
            place_count = int(m_state.group(2).replace(",", ""))
            current_state = {
                "name": state_name,
                "country_code": current_country["code"] if current_country else "",
                "expected_count": place_count
            }
            states.append(current_state)
            continue
            
        m_country = country_pattern.match(line_clean)
        if m_country and not ("place" in line_clean.lower()):
            flush_city_buffer()
            country_name = m_country.group(1).strip()
            country_code = m_country.group(2).strip()
            current_country = {
                "name": country_name,
                "code": country_code
            }
            current_state = None
            countries.append(current_country)
            continue

        if current_state:
            if current_city_buffer:
                current_city_buffer += " " + line_clean
            else:
                current_city_buffer = line_clean

flush_city_buffer()

print(f"Extracted {len(countries)} countries, {len(states)} states, {len(cities)} places.")

# Save master JSON files
with open("src/constants/world_countries.json", "w", encoding="utf-8") as f:
    json.dump(countries, f, ensure_ascii=False, indent=2)

with open("src/constants/world_states.json", "w", encoding="utf-8") as f:
    json.dump(states, f, ensure_ascii=False, indent=2)

print("Saved world_countries.json and world_states.json successfully.")
