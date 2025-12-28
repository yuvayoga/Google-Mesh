import requests
import json

url = "https://zerointernetsos-default-rtdb.firebaseio.com/sos_messages.json"
response = requests.get(url)
data = response.json()

with open("sos_debug_utf8.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
