import sys
import os

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

API_KEY = "cd46b7afcd9f7ed0754ac9401795dc1f"

def fetch_poster_path(title):
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
            return movie.get("poster_path")
    except Exception as e:
        print(f"❌ Error fetching poster for '{title}': {e}")
    return None

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

def main():
    print("📁 Scanning all folders for poster download...\n")
    count = 0
    for root, dirs, files in os.walk("."):
        if root == ".":
            continue
        # Only process immediate subfolders (not sub-subfolders)
        if os.path.dirname(root) != ".":
            continue
        folder_name = os.path.basename(root)
        print(f"🔧 Processing '{folder_name}'...")
        poster_path = fetch_poster_path(folder_name)
        if poster_path:
            if download_poster(root, poster_path):
                print(f"🖼  index.jpg downloaded for '{folder_name}'\n")
                count += 1
            else:
                print(f"⚠ Failed to download poster for: '{folder_name}'\n")
        else:
            print(f"⚠ No poster found for: '{folder_name}'\n")
    print(f"\n🎬 All done! {count} poster(s) downloaded.")
    input("\nPress Enter to close this window...")

if __name__ == "__main__":
    main()
