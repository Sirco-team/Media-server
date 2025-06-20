# Media-server
A media server that anyone can use!

## Features
- Fast, modern web UI for browsing, searching, and playing movies and TV shows
- User authentication (admin and regular users)
- Favorites and watch progress tracking per user
- Upload movies, shows, and episodes via web UI
- Automatic video conversion to MP4 for browser compatibility
- Instant loading with media cache (vid-mov.json)
- Mobile-friendly and responsive design
- Access control per media (everyone or specific users)

## Requirements
- Node.js (v16+ recommended)
- FFmpeg (for video conversion)
- (Optional) Python 3 for config/image helpers

## Installation
1. **Clone the repo:**
   ```sh
   git clone <repo-url>
   cd Media-server
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Install FFmpeg:**
   - Ubuntu/Debian: `sudo apt update && sudo apt install ffmpeg`
   - Fedora: `sudo dnf install ffmpeg`
   - Mac: `brew install ffmpeg`
   - Windows: `choco install ffmpeg` or [download from ffmpeg.org](https://ffmpeg.org/download.html)

4. **Configure:**
   - Edit `config/config.js` for session secret and other settings if needed.

## Usage
1. **Start the server:**
   ```sh
   node server.js
   ```
2. **Open your browser:**
   - Go to `http://localhost` (or your server IP)

3. **Default login:**
   - The first user is an admin. Create an account, then log in as admin to add more users.

4. **Upload media:**
   - Use the upload button in the web UI (top right) to add movies, shows, or episodes.

5. **Media organization:**
   - Movies and shows are stored in `/media`.
   - Each movie/show folder must have a `config.txt` (auto-generated on upload or with helper scripts).
   - Posters: Place as `index.jpg`/`index.png` in the folder.

## Media Folder Structure
```
/media
├── movietitle1/
│   ├── config.txt
│   ├── index.mp4
│   └── index.jpg (or index.png)
├── movietitle2/
│   ├── config.txt
│   ├── index.mp4
│   └── index.jpg
├── showtitle1/
│   ├── config.txt
│   ├── index.jpg
│   ├── s1/
│   │   ├── ep1/
│   │   │   ├── index.mp4
│   │   │   └── index.jpg
│   │   ├── ep2/
│   │   │   ├── index.mp4
│   │   │   └── index.jpg
│   └── s2/
│       └── ep1/
│           ├── index.mp4
│           └── index.jpg
└── ...
```
- **Movies:** Each movie in its own folder with `config.txt`, `index.mp4`, and poster image (`index.jpg` or `index.png`).
- **Shows:** Each show in its own folder with `config.txt` and poster. Seasons are `s1`, `s2`, etc. Each episode is in `ep1`, `ep2`, etc. with its own `index.mp4` and optional `index.jpg`.

## Example config.txt
```
title: The Matrix
type: movie
description: A computer hacker learns about the true nature of reality.
genre: Action, Sci-Fi
year: 1999
access: everyone
```
- `title`: Name of the movie/show
- `type`: `movie` or `show`
- `description`: Short description
- `genre`: Comma-separated genres
- `year`: Release year
- `access`: `everyone` or a specific username (for private media)

> For shows, use `type: show` and the same config.txt format. Episodes are detected by folder structure.

## File Naming
- **Videos:** Must be named `index.mp4` (auto-converted if needed)
- **Posters:** `index.jpg`, `index.png`, or `index.webp` (auto-downloaded by helper scripts or upload)
- **config.txt:** Required for every movie/show folder

## User Management
- Only admins can create new user accounts.
- Each user has their own favorites and watch progress.

## Media Config & Helpers
- Use `eazyconfigfilemaker.py` to auto-generate config.txt and download posters for your folders.
- Use `download_movie_poster.py` to just fetch posters.

## Troubleshooting
- **FFmpeg not found:** Ensure it's installed and in your PATH. See install instructions above.
- **Video not playing:** Wait for conversion to finish, or check logs for errors.
- **Permission errors:** Make sure the server has read/write access to `/media` and its subfolders.

## Credits
- Built with Node.js, Express, and vanilla JS/CSS.
- Uses [TMDB](https://www.themoviedb.org/) for movie info/posters (see their terms of use).

---
Enjoy your media server!
