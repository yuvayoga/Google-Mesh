import requests
import json

url = "https://zerointernetsos-default-rtdb.firebaseio.com/.json"
response = requests.get(url)
data = response.json()

print(json.dumps(data, indent=2))
