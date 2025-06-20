const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MediaConfig = require('./mediaConfig');

const VIDEO_EXTENSIONS = [
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.mpg', '.mpeg', '.3gp', '.ogv',
];

class MediaScanner {
    constructor(mediaPath) {
        this.mediaPath = mediaPath;
        this.mediaCache = new Map();
        this.mediaConfig = new MediaConfig();
    }

    generateId(filePath) {
        return crypto.createHash('md5').update(filePath).digest('hex');
    }

    findVideoExtension(folderPath) {
        for (const ext of VIDEO_EXTENSIONS) {
            if (fs.existsSync(path.join(folderPath, 'index' + ext))) {
                return ext;
            }
        }
        return null;
    }

    async scanFolder() {
        try {
            if (!fs.existsSync(this.mediaPath)) {
                fs.mkdirSync(this.mediaPath, { recursive: true });
            }
            const items = fs.readdirSync(this.mediaPath);
            this.mediaCache.clear();
            for (const item of items) {
                const showPath = path.join(this.mediaPath, item);
                const stats = fs.statSync(showPath);

                if (stats.isDirectory()) {
                    const mediaInfo = this.mediaConfig.generateMediaInfo(showPath);
                    if (mediaInfo && mediaInfo.type === 'show') {
                        // Scan for seasons
                        let seasons = {};
                        const seasonDirs = fs.readdirSync(showPath, { withFileTypes: true })
                            .filter(e => e.isDirectory() && /^s\d+$/i.test(e.name));
                        for (const seasonDir of seasonDirs) {
                            const seasonNum = seasonDir.name.replace(/^s/i, '');
                            const seasonPath = path.join(showPath, seasonDir.name);
                            const epDirs = fs.readdirSync(seasonPath, { withFileTypes: true })
                                .filter(e => e.isDirectory() && /^ep\d+$/i.test(e.name));
                            seasons[seasonNum] = [];
                            for (const epDir of epDirs) {
                                const epNum = epDir.name.replace(/^ep/i, '');
                                const epPath = path.join(seasonPath, epDir.name);
                                const ext = this.findVideoExtension(epPath);
                                let duration = null;
                                if (ext) {
                                    // Try to get video duration (in seconds) for progress percent
                                    try {
                                        // This requires ffprobe installed, which comes with ffmpeg
                                        const { execSync } = require('child_process');
                                        const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${path.join(epPath, 'index' + ext)}"`;
                                        duration = parseFloat(execSync(ffprobeCmd).toString().trim());
                                    } catch (e) { duration = null; }
                                    seasons[seasonNum].push({
                                        number: parseInt(epNum, 10),
                                        path: `s${seasonNum}/ep${epNum}`,
                                        ext,
                                        duration,
                                    });
                                }
                            }
                            seasons[seasonNum].sort((a, b) => a.number - b.number);
                        }
                        const id = item;
                        this.mediaCache.set(id, {
                            id,
                            folderName: item,
                            ...mediaInfo,
                            seasons,
                            dateAdded: stats.birthtime
                        });
                    } else if (mediaInfo) {
                        // Movie (no change from before)
                        const id = item;
                        const videoExt = this.findVideoExtension(showPath);
                        let duration = null;
                        if (videoExt) {
                            try {
                                const { execSync } = require('child_process');
                                const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${path.join(showPath, 'index' + videoExt)}"`;
                                duration = parseFloat(execSync(ffprobeCmd).toString().trim());
                            } catch (e) { duration = null; }
                        }
                        this.mediaCache.set(id, {
                            id,
                            folderName: item,
                            ...mediaInfo,
                            videoExt,
                            duration,
                            dateAdded: stats.birthtime
                        });
                    }
                }
            }
            return Array.from(this.mediaCache.values());
        } catch (error) {
            console.error('Error scanning media folder:', error);
            return [];
        }
    }

    getMediaById(id) {
        if (!this.mediaCache.size) {
            this.scanFolder();
        }
        return this.mediaCache.get(id);
    }

    getShows() {
        return Array.from(this.mediaCache.values()).filter(media => media.type === 'show');
    }

    searchMedia(query) {
        query = query.toLowerCase();
        return Array.from(this.mediaCache.values()).filter(media => 
            media.title.toLowerCase().includes(query) ||
            media.description.toLowerCase().includes(query)
        );
    }
}

module.exports = MediaScanner;