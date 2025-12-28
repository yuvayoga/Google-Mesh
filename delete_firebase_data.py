import requests

url = "https://zerointernetsos-default-rtdb.firebaseio.com/.json"
response = requests.delete(url)

if response.status_code == 200:
    print("Successfully deleted all data in Firebase.")
else:
    print(f"Failed to delete data. Status code: {response.status_code}")
    print(response.text)
