import os

# Set your root path here — for example: "F:/"
ROOT_DIR = "F:/"

removed = 0
for root, dirs, files in os.walk(ROOT_DIR):
    if "config.txt" in files:
        config_path = os.path.join(root, "config.txt")
        try:
            os.remove(config_path)
            print(f"🗑 Removed: {config_path}")
            removed += 1
        except Exception as e:
            print(f"❌ Failed to remove {config_path}: {e}")

print(f"\n✓ Finished. {removed} config.txt file(s) removed.")
