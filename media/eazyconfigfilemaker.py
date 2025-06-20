import sys

# 🔍 Check for required module
try:
    import requests
except ImportError:
    print("❌ Required dependency 'requests' is not installed.")
    print("\nTo install it, run one of these commands in your terminal or PowerShell:")
    print("  pip install requests")
    print("  OR")
    print("  python -m pip install requests")
    input("\nPress Enter to close this window after you’ve copied the command...")
    sys.exit(1)

import os

API_KEY = "cd46b7afcd9f7ed0754ac9401795dc1f"

def fetch_movie_info(title):
    url = "https://api.themoviedb.org/3/search/movie"
    params = {
        "api_key": API_KEY,
        "query": title,
        "include_adult": False,
    }
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        results = response.json().get("results")
        if results:
            movie = results[0]
            return {
                "title": movie["title"],
                "description": movie["overview"][:17] + ".." if len(movie["overview"]) > 19 else movie["overview"],
                "year": movie.get("release_date", "0000")[:4],
                "poster_path": movie.get("poster_path")
            }
    except Exception as e:
        print(f"❌ Error fetching data for '{title}': {e}")
    return None

def make_config(folder_path, info):
    content = f"""title: {info['title']}
type: movie
description: {info['description']}
genre: I will add that later
year: {info['year']}
access: everyone"""
    config_path = os.path.join(folder_path, "config.txt")
    with open(config_path, "w", encoding="utf-8") as f:
        f.write(content)

def download_poster(folder_path, poster_path):
    if not poster_path:
        return False
    img_url = f"https://image.tmdb.org/t/p/w500{poster_path}"
    try:
        img_data = requests.get(img_url).content
        img_path = os.path.join(folder_path, "index.jpg")
        with open(img_path, "wb") as img_file:
            img_file.write(img_data)
        return True
    except Exception as e:
        print(f"❌ Error downloading poster: {e}")
        return False

print("📁 Scanning all folders for config.txt creation...\n")
count = 0

for root, dirs, files in os.walk("."):
    if root == ".":
        continue
    # Only process immediate subfolders (not sub-subfolders)
    if os.path.dirname(root) != ".":
        continue
    # Skip if config.txt or any index image already exists
    existing_files = set(f.lower() for f in os.listdir(root))
    if (
        "config.txt" in existing_files or
        "index.jpg" in existing_files or
        "index.jpeg" in existing_files or
        "index.png" in existing_files or
        "index.webp" in existing_files
    ):
        print(f"⏩ Skipping '{os.path.basename(root)}' (config or image already exists)")
        continue
    folder_name = os.path.basename(root)
    print(f"🔧 Processing '{folder_name}'...")
    info = fetch_movie_info(folder_name)
    if info:
        make_config(root, info)
        if info.get("poster_path"):
            if download_poster(root, info["poster_path"]):
                print(f"🖼  index.jpg downloaded for '{info['title']}'")
        print(f"✅ config.txt created for '{info['title']}'\n")
        count += 1
    else:
        print(f"⚠ No data found for: '{folder_name}'\n")

print(f"\n🎬 All done! {count} config file(s) created.")
input("\nPress Enter to close this window...")
