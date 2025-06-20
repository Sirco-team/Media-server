const fs = require('fs');
const path = require('path');

class MediaConfig {
    constructor() {
        this.supportedVideoFormats = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
        this.supportedImageFormats = ['.jpg', '.jpeg', '.png', '.webp'];
    }

    parseConfig(configPath) {
        try {
            const content = fs.readFileSync(configPath, 'utf8');
            const config = {
                access: 'everyone' // default access
            };
            
            content.split('\n').forEach(line => {
                const [key, ...valueParts] = line.split(':');
                if (key && valueParts.length) {
                    const value = valueParts.join(':').trim();
                    if (key.trim() === 'access') {
                        // Parse access as array if comma-separated
                        config[key.trim()] = value.includes(',') ? 
                            value.split(',').map(v => v.trim()) : 
                            value;
                    } else {
                        config[key.trim()] = value;
                    }
                }
            });
            
            return config;
        } catch (error) {
            console.error(`Error parsing config file ${configPath}:`, error);
            return null;
        }
    }

    findMediaFiles(dirPath) {
        const files = fs.readdirSync(dirPath);
        const mediaFiles = {
            video: null,
            image: null,
            episodes: [],
            thumbnail: null
        };

        files.forEach(file => {
            const fullPath = path.join(dirPath, file);
            const ext = path.extname(file).toLowerCase();
            const baseName = path.basename(file, ext).toLowerCase();

            if (this.supportedVideoFormats.includes(ext)) {
                if (baseName === 'index') {
                    mediaFiles.video = file;
                } else {
                    mediaFiles.episodes.push({
                        title: baseName,
                        file: file,
                        type: 'video'
                    });
                }
            } else if (this.supportedImageFormats.includes(ext)) {
                if (baseName === 'index') {
                    mediaFiles.image = file;
                    mediaFiles.thumbnail = file;
                }
            }
        });

        return mediaFiles;
    }

    scanEpisodes(basePath) {
        const episodes = [];
        const items = fs.readdirSync(basePath);

        items.forEach(item => {
            const itemPath = path.join(basePath, item);
            const stats = fs.statSync(itemPath);

            if (stats.isDirectory() && item.startsWith('ep')) {
                const mediaFiles = this.findMediaFiles(itemPath);
                if (mediaFiles.video) {
                    episodes.push({
                        number: parseInt(item.replace('ep', '')),
                        path: path.relative(basePath, itemPath),
                        thumbnail: mediaFiles.image,
                        file: mediaFiles.video
                    });
                }
            }
        });

        return episodes.sort((a, b) => a.number - b.number);
    }

    generateMediaInfo(mediaPath) {
        const configPath = path.join(mediaPath, 'config.txt');
        if (!fs.existsSync(configPath)) {
            return null;
        }

        const config = this.parseConfig(configPath);
        if (!config) return null;

        const mediaFiles = this.findMediaFiles(mediaPath);
        const mediaInfo = {
            ...config,
            path: path.relative(process.cwd(), mediaPath),
            mainVideo: mediaFiles.video,
            thumbnail: mediaFiles.image,
            extras: mediaFiles.episodes,
            episodes: []
        };

        if (config.type === 'show') {
            mediaInfo.episodes = this.scanEpisodes(mediaPath);
        }

        return mediaInfo;
    }
}

module.exports = MediaConfig;