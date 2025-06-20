const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const config = require('./config/config');
const MediaScanner = require('./mediaScanner');
const { spawn, execSync } = require('child_process');

// ========== FFmpeg Detection on Boot ==========
function checkFfmpegInstalled() {
    try {
        execSync('ffmpeg -version', { stdio: 'ignore' });
        console.log('[BOOT] FFmpeg is installed.');
        return true;
    } catch (err) {
        console.error('[BOOT] FFmpeg is NOT installed! Please install ffmpeg before running this server.');
        process.exit(1);
    }
}
checkFfmpegInstalled();

// ========== Video Conversion on Boot ==========
const VIDEO_EXTENSIONS = [
    '.avi', '.mkv', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg', '.3gp', '.ogv'
];
const ALL_VIDEO_EXTENSIONS = ['.mp4', ...VIDEO_EXTENSIONS];

function isVideoFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ALL_VIDEO_EXTENSIONS.includes(ext);
}

function scanAndConvertMedia(rootDir) {
    console.log('[BOOT] Scanning and converting videos to mp4 in /media...');
    let converted = 0, skipped = 0;
    function walk(dir) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (isVideoFile(entry.name)) {
                const ext = path.extname(entry.name).toLowerCase();
                if (ext !== '.mp4') {
                    const mp4Path = path.join(dir, 'index.mp4');
                    if (!fs.existsSync(mp4Path)) {
                        console.log(`[CONVERT] Converting ${fullPath} to ${mp4Path}...`);
                        try {
                            execSync(
                                `ffmpeg -y -i "${fullPath}" -f mp4 -vcodec libx264 -acodec aac -movflags faststart "${mp4Path}"`,
                                { stdio: 'inherit' }
                            );
                            fs.unlinkSync(fullPath);
                            console.log(`[CONVERT] Done. Original deleted: ${fullPath}`);
                            converted++;
                        } catch (err) {
                            console.error(`[CONVERT] Conversion failed for ${fullPath}:`, err);
                        }
                    } else {
                        console.log(`[BOOT] mp4 already exists for ${fullPath}, skipping conversion.`);
                        skipped++;
                    }
                }
            }
        });
    }
    if (fs.existsSync(rootDir)) {
        walk(rootDir);
    }
    console.log(`[BOOT] Conversion complete. ${converted} file(s) converted, ${skipped} file(s) skipped.`);
}
const MEDIA_PATH = path.join(__dirname, 'media');
const MEDIA_CACHE_PATH = path.join(__dirname, 'vid-mov.json');

function generateMediaCacheFile(mediaList) {
    try {
        fs.writeFileSync(MEDIA_CACHE_PATH, JSON.stringify(mediaList, null, 2));
        console.log(`[BOOT] Media cache written to vid-mov.json (${mediaList.length} items)`);
    } catch (err) {
        console.error('[BOOT] Failed to write media cache:', err);
    }
}

scanAndConvertMedia(MEDIA_PATH);

// ========== Media Cache Generation on Boot ==========
async function buildAndCacheMedia() {
    const mediaScanner = new MediaScanner(MEDIA_PATH);
    const mediaList = await mediaScanner.scanFolder();
    generateMediaCacheFile(mediaList);
    return mediaList;
}

let mediaCache = [];
(async () => {
    mediaCache = await buildAndCacheMedia();
})();

// ========== User, Favorites, and Progress Management ==========
function loadUsers() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { users: [] };
    }
}
function saveUsers(users) {
    fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(users, null, 2));
}
function loadFavorites() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'favorites.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}
function saveFavorites(favorites) {
    fs.writeFileSync(path.join(__dirname, 'favorites.json'), JSON.stringify(favorites, null, 2));
}
function loadProgress() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'progress.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}
function saveProgress(progress) {
    fs.writeFileSync(path.join(__dirname, 'progress.json'), JSON.stringify(progress, null, 2));
}

// ========== Multer Setup ==========
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'media', 'temp');
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage });

// ========== Express App Setup ==========
const app = express();
const mediaScanner = new MediaScanner(MEDIA_PATH);

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.use(session({
    secret: config.sessionSecret,
    resave: true,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000
    }
}));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    next();
});

const defaultUser = { id: 'default', username: 'default', isAdmin: false };
function dynamicBodyParser(req, res, next) {
    const isAdmin = req.session.user && req.session.user.isAdmin;
    const limit = isAdmin ? '100gb' : '10gb';
    bodyParser.json({ limit })(req, res, err => {
        if (err) return res.status(413).json({ success: false, message: 'Payload too large' });
        bodyParser.urlencoded({ extended: true, limit })(req, res, next);
    });
}

// ========== Video Conversion on Upload ==========
function convertToMp4IfNeeded(videoPath, folder, ext) {
    return new Promise((resolve, reject) => {
        const targetPath = path.join(folder, 'index.mp4');
        if (ext === '.mp4') {
            resolve(false); return;
        }
        console.log(`[CONVERT] Converting ${videoPath} to MP4 as ${targetPath}...`);
        console.log(`[CONVERT] The movie/show will NOT be playable until conversion is done.`);
        const ffmpeg = spawn('ffmpeg', [
            '-y', '-i', videoPath,
            '-f', 'mp4', '-vcodec', 'libx264', '-acodec', 'aac',
            '-movflags', 'faststart', targetPath
        ]);
        ffmpeg.stdout.on('data', data => process.stdout.write(data));
        ffmpeg.stderr.on('data', data => process.stdout.write(data));
        ffmpeg.on('close', code => {
            if (code === 0) {
                fs.unlinkSync(videoPath);
                console.log(`[CONVERT] Conversion complete. Saved as ${targetPath}.`);
                resolve(true);
            } else {
                console.error(`[CONVERT] Conversion failed with code ${code}.`);
                reject(new Error('Conversion failed'));
            }
        });
    });
}

// ========== ROUTES ==========

// Upload Movie
app.post('/api/upload/movie', dynamicBodyParser, upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'config', maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, description, genre, year, access } = req.body;
        const movieFolderName = title.toLowerCase().replace(/\s+/g, '-');
        const movieFolder = path.join(__dirname, 'media', movieFolderName);
        fs.mkdirSync(movieFolder, { recursive: true });

        if (req.files && req.files.video && req.files.video[0]) {
            const videoFile = req.files.video[0];
            const ext = path.extname(videoFile.originalname).toLowerCase();
            const destPath = path.join(movieFolder, 'index' + ext);
            fs.renameSync(videoFile.path, destPath);
            if (ext !== '.mp4') {
                await convertToMp4IfNeeded(destPath, movieFolder, ext);
            }
        }
        if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
            const thumbFile = req.files.thumbnail[0];
            const ext = path.extname(thumbFile.originalname).toLowerCase();
            const destPath = path.join(movieFolder, 'index' + ext);
            fs.renameSync(thumbFile.path, destPath);
        }

        const configContent = `title: ${title}\ntype: movie\ndescription: ${description}\ngenre: ${genre}\nyear: ${year}\naccess: ${access || 'everyone'}`;
        fs.writeFileSync(path.join(movieFolder, 'config.txt'), configContent);

        res.json({ success: true });
        await refreshMediaCache();
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload Show (for show meta)
app.post('/api/upload/show', dynamicBodyParser, upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'config', maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, description, genre, year, access } = req.body;
        const showFolder = path.join(__dirname, 'media', title.toLowerCase().replace(/\s+/g, '-'));
        const configContent = `title: ${title}
type: show
description: ${description}
genre: ${genre}
year: ${year}
access: ${access || 'everyone'}`;
        fs.writeFileSync(path.join(showFolder, 'config.txt'), configContent);
        res.json({ success: true });
        await refreshMediaCache();
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload Episode (with season and episode support!)
app.post('/api/upload/episode', dynamicBodyParser, upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
    try {
        const { showName, seasonNumber, episodeNumber } = req.body;
        if (!showName || !seasonNumber || !episodeNumber) {
            return res.status(400).json({ success: false, error: 'Show, season, and episode are required.' });
        }
        const epFolder = path.join(
            __dirname,
            'media',
            showName.toLowerCase().replace(/\s+/g, '-'),
            `s${seasonNumber}`,
            `ep${episodeNumber}`
        );
        fs.mkdirSync(epFolder, { recursive: true });

        if (req.files && req.files.video && req.files.video[0]) {
            const videoFile = req.files.video[0];
            const ext = path.extname(videoFile.originalname).toLowerCase();
            const destPath = path.join(epFolder, 'index' + ext);
            fs.renameSync(videoFile.path, destPath);
            if (ext !== '.mp4') {
                await convertToMp4IfNeeded(destPath, epFolder, ext);
            }
        }
        if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
            const thumbFile = req.files.thumbnail[0];
            const ext = path.extname(thumbFile.originalname).toLowerCase();
            const destPath = path.join(epFolder, 'index' + ext);
            fs.renameSync(thumbFile.path, destPath);
        }
        res.json({ success: true });
        await refreshMediaCache();
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Home
app.get('/', (req, res) => {
    if (!req.session.user) req.session.user = defaultUser;
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Auth
app.get('/api/auth/check', (req, res) => {
    if (req.session.user) {
        res.json({ success: true, user: req.session.user });
    } else {
        res.json({ success: false });
    }
});
app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const { users } = loadUsers();
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            req.session.user = { id: user.username, username: user.username, isAdmin: user.isAdmin };
            res.setHeader('Content-Type', 'application/json');
            res.json({ success: true, user: req.session.user });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
app.post('/api/auth/signup', (req, res) => {
    try {
        const { username, password } = req.body;
        const currentUser = req.session.user;
        if (!currentUser || !currentUser.isAdmin) {
            return res.status(403).json({ success: false, message: 'Only administrators can create accounts' });
        }
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }
        const userData = loadUsers();
        if (userData.users.some(u => u.username === username)) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }
        const newUser = { username, password, isAdmin: false };
        userData.users.push(newUser);
        saveUsers(userData);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to logout' });
        }
        res.json({ success: true });
    });
});

// Media
app.get('/api/media', async (req, res) => {
    try {
        const { category, renderMode, search } = req.query;
        const currentUser = req.session.user?.username || 'everyone';
        let mediaList = mediaCache;

        mediaList = mediaList.filter(media => {
            const access = media.access || 'everyone';
            return access === 'everyone' || access === currentUser;
        });

        if (search) {
            const q = search.toLowerCase();
            mediaList = mediaList.filter(media =>
                (media.title && media.title.toLowerCase().includes(q)) ||
                (media.description && media.description.toLowerCase().includes(q))
            );
        }

        if (category && category !== 'all') {
            mediaList = mediaList.filter(m => m.category === category);
        }

        res.json({ success: true, data: mediaList, renderMode });
    } catch (error) {
        console.error('Media scan error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Favorites
app.get('/api/favorites', (req, res) => {
    const username = req.session.user?.username;
    if (!username) return res.json({ success: true, favorites: [] });
    const favorites = loadFavorites();
    res.json({ success: true, favorites: favorites[username] || [] });
});
app.post('/api/favorites/toggle', (req, res) => {
    const username = req.session.user?.username;
    if (!username) {
        return res.status(401).json({ success: false, message: 'Must be logged in' });
    }
    const { mediaId } = req.body;
    const favorites = loadFavorites();
    if (!favorites[username]) favorites[username] = [];
    const index = favorites[username].indexOf(mediaId);
    if (index === -1) {
        favorites[username].push(mediaId);
    } else {
        favorites[username].splice(index, 1);
    }
    saveFavorites(favorites);
    res.json({ success: true });
});

// Progress
app.get('/api/progress', (req, res) => {
    const username = req.session.user?.username;
    if (!username) return res.json({ success: true, progress: {} });
    const progress = loadProgress();
    res.json({ success: true, progress: progress[username] || {} });
});
app.post('/api/progress/save', (req, res) => {
    const username = req.session.user?.username;
    if (!username) {
        return res.status(401).json({ success: false, message: 'Must be logged in' });
    }
    const { mediaId, seasonNumber, episodeNumber, currentTime, duration } = req.body;
    const progress = loadProgress();
    if (!progress[username]) progress[username] = {};
    let key = mediaId;
    if (seasonNumber && episodeNumber) key += `_s${seasonNumber}ep${episodeNumber}`;
    progress[username][key] = currentTime;
    saveProgress(progress);
    res.json({ success: true });
});

// Shows
app.get('/api/shows', (req, res) => {
    try {
        const shows = mediaScanner.getShows();
        res.json({ success: true, data: shows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Thumbnails
app.get('/api/media/:id/thumbnail', async (req, res) => {
    try {
        const { id } = req.params;
        const media = mediaScanner.getMediaById(id);
        if (!media) return res.status(404).send('Media not found');
        const mediaFolder = path.join(__dirname, 'media', media.folderName);
        const thumbnailPath = path.join(mediaFolder, 'index.png');
        const jpgPath = path.join(mediaFolder, 'index.jpg');
        let imagePath = fs.existsSync(thumbnailPath) ? thumbnailPath : 
                       fs.existsSync(jpgPath) ? jpgPath : null;
        if (!imagePath) {
            return res.sendFile(path.join(__dirname, 'public', 'default-thumbnail.jpg'));
        }
        res.sendFile(imagePath);
    } catch (error) {
        res.status(500).send('Error serving thumbnail');
    }
});

// Stream Video (show support for /s:season/ep:ep)
app.get('/api/media/:id/stream/s:season/ep:ep', async (req, res) => {
    const { id, season, ep } = req.params;
    const { range } = req.headers;
    const videoExtensions = ['.mp4', ...VIDEO_EXTENSIONS];

    const media = mediaScanner.getMediaById(id);
    if (!media) return res.status(404).send('Media not found');
    let videoPath, foundExt = null;
    for (const ext of videoExtensions) {
        let candidate = path.join(
            __dirname, 'media', media.folderName, `s${season}`, `ep${ep}`, 'index' + ext
        );
        if (fs.existsSync(candidate)) {
            videoPath = candidate;
            foundExt = ext;
            break;
        }
    }
    if (!videoPath) return res.status(404).send('Video file not found');
    if (foundExt !== '.mp4') {
        res.status(503).send('Video is being converted for browser compatibility. Try again in a moment.');
        return;
    }
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4'
        });
        file.pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4'
        });
        fs.createReadStream(videoPath).pipe(res);
    }
});

// Stream Movie (index.mp4)
app.get('/api/media/:id/stream', async (req, res) => {
    const { id } = req.params;
    const { range } = req.headers;
    const videoExtensions = ['.mp4', ...VIDEO_EXTENSIONS];

    const media = mediaScanner.getMediaById(id);
    if (!media) return res.status(404).send('Media not found');
    let videoPath, foundExt = null;
    for (const ext of videoExtensions) {
        let candidate = path.join(__dirname, 'media', media.folderName, 'index' + ext);
        if (fs.existsSync(candidate)) {
            videoPath = candidate;
            foundExt = ext;
            break;
        }
    }
    if (!videoPath) return res.status(404).send('Video file not found');
    if (foundExt !== '.mp4') {
        res.status(503).send('Video is being converted for browser compatibility. Try again in a moment.');
        return;
    }
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4'
        });
        file.pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4'
        });
        fs.createReadStream(videoPath).pipe(res);
    }
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});