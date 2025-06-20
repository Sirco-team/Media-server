class MediaPlayer {
    bufferSize = 30;
    renderMode = 'server';
    currentUser = { username: 'default', isAdmin: false };
    favorites = new Set();
    progress = new Map();
    mediaCache = new Map();

    constructor() {
        this.checkSession().then(() => {
            this.setupEventListeners();
            this.setupAuthListeners();
            this.loadFavorites();
            this.loadProgress();
            this.loadMedia();
        });
    }

    async checkSession() {
        try {
            const response = await fetch('/api/auth/check');
            const data = await response.json();
            if (data.success) {
                this.currentUser = data.user;
                document.getElementById('username').textContent = data.user.username;
            }
        } catch (error) {
            console.error('Session check error:', error);
        }
    }

    async loadFavorites() {
        try {
            const response = await fetch('/api/favorites');
            const data = await response.json();
            if (data.success) {
                this.favorites = new Set(data.favorites);
            }
        } catch (error) {
            console.error('Error loading favorites:', error);
        }
    }

    async loadProgress() {
        try {
            const response = await fetch('/api/progress');
            const data = await response.json();
            if (data.success) {
                this.progress = new Map(Object.entries(data.progress));
            }
        } catch (error) {
            console.error('Error loading progress:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('uploadBtn').addEventListener('click', () => {
            if (!this.currentUser || this.currentUser.username === 'default') {
                alert('Please login to upload media');
                document.getElementById('authModal').style.display = 'block';
                return;
            }
            document.getElementById('uploadModal').style.display = 'block';
            this.populateShowDropdown();
            this.setupUploadHandlers();
        });

        document.getElementById('authBtn').addEventListener('click', () => {
            document.getElementById('authModal').style.display = 'block';
        });

        document.getElementById('settingsBtn').addEventListener('click', () => {
            document.getElementById('settingsModal').style.display = 'block';
        });

        document.querySelectorAll('.modal .close').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                closeBtn.closest('.modal').style.display = 'none';
                this.stopVideo();
            });
        });

        window.onclick = (event) => {
            document.querySelectorAll('.modal').forEach(modal => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                    this.stopVideo();
                }
            });
        };

        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelector('.category-btn.active').classList.remove('active');
                e.target.classList.add('active');
                this.loadMedia(e.target.dataset.category);
            });
        });

        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');

        const performSearch = () => {
            const searchTerm = searchInput.value.trim();
            const activeCategory = document.querySelector('.category-btn.active').dataset.category;
            this.loadMedia(activeCategory, searchTerm);
        };

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
        searchBtn.addEventListener('click', performSearch);

        document.getElementById('logoutBtn').addEventListener('click', async () => {
            try {
                const response = await fetch('/api/auth/logout', { method: 'POST' });
                if (response.ok) window.location.reload();
            } catch (error) {
                console.error('Logout error:', error);
            }
        });
    }

    setupAuthListeners() {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const showLoginBtn = document.getElementById('showLoginBtn');
        const showSignupBtn = document.getElementById('showSignupBtn');

        showLoginBtn.addEventListener('click', () => {
            loginForm.style.display = 'flex';
            signupForm.style.display = 'none';
            showLoginBtn.classList.add('active');
            showSignupBtn.classList.remove('active');
        });

        showSignupBtn.addEventListener('click', () => {
            signupForm.style.display = 'flex';
            loginForm.style.display = 'none';
            showSignupBtn.classList.add('active');
            showLoginBtn.classList.remove('active');
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(loginForm);
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: formData.get('username'),
                        password: formData.get('password')
                    })
                });
                const data = await response.json();
                if (data.success) {
                    this.currentUser = data.user;
                    document.getElementById('username').textContent = data.user.username;
                    document.getElementById('authModal').style.display = 'none';
                    loginForm.reset();
                } else {
                    alert('Login failed: ' + data.message);
                }
            } catch (error) {
                console.error('Login error:', error);
                alert('Login failed');
            }
        });

        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(signupForm);
            if (formData.get('password') !== formData.get('confirmPassword')) {
                alert('Passwords do not match');
                return;
            }
            try {
                const response = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: formData.get('username'),
                        password: formData.get('password')
                    })
                });
                const data = await response.json();
                if (data.success) {
                    this.currentUser = data.user;
                    document.getElementById('username').textContent = data.user.username;
                    document.getElementById('authModal').style.display = 'none';
                    signupForm.reset();
                } else {
                    alert('Signup failed: ' + data.message);
                }
            } catch (error) {
                console.error('Signup error:', error);
                alert('Signup failed');
            }
        });
    }

    async loadMedia(category = 'all', search = '') {
        try {
            const params = { category, renderMode: this.renderMode };
            if (search) params.search = search;

            const response = await fetch('/api/media?' + new URLSearchParams(params));
            const { data: mediaItems } = await response.json();
            this.mediaCache = new Map(mediaItems.map(item => [item.id, item]));
            this.renderMediaGrid(mediaItems);
        } catch (error) {
            console.error('Error loading media:', error);
        }
    }

    renderMediaGrid(mediaItems) {
        const grid = document.getElementById('mediaGrid');
        grid.innerHTML = '';
        if (!Array.isArray(mediaItems)) return;
        mediaItems.forEach(item => {
            const mediaElement = document.createElement('div');
            mediaElement.className = 'media-item';
            mediaElement.innerHTML = `
                <img src="/api/media/${item.id}/thumbnail" alt="${item.title}">
                <div class="media-info">
                    <h3>${item.title}</h3>
                    <p>${item.description || ''}</p>
                </div>
            `;
            mediaElement.addEventListener('click', () => this.showMediaDetails(item));
            grid.appendChild(mediaElement);
        });
    }

    async toggleFavorite(mediaId) {
        try {
            const response = await fetch('/api/favorites/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaId })
            });
            const data = await response.json();
            if (data.success) {
                if (this.favorites.has(mediaId)) {
                    this.favorites.delete(mediaId);
                } else {
                    this.favorites.add(mediaId);
                }
                this.loadMedia();
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    }

    async saveProgress(mediaId, season, episode, currentTime, duration) {
        let key = mediaId;
        if (season && episode) key += `_s${season}ep${episode}`;
        try {
            await fetch('/api/progress/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaId, seasonNumber: season, episodeNumber: episode, currentTime, duration })
            });
            this.progress.set(key, currentTime);
        } catch (error) {
            console.error('Error saving progress:', error);
        }
    }

    getProgress(mediaId, season, episode) {
        let key = mediaId;
        if (season && episode) key += `_s${season}ep${episode}`;
        return this.progress.get(key) || 0;
    }

    showMediaDetails(media) {
        const modal = document.getElementById('playerModal');
        const content = modal.querySelector('.modal-content');
        const isFavorite = this.favorites.has(media.id);

        content.innerHTML = `
            <span class="close main-btn">&times;</span>
            <div class="media-details">
                <div class="media-header">
                    <h2>${media.title}</h2>
                    ${media.type === 'show' ? '<span class="type-badge">TV Series</span>' : '<span class="type-badge">Movie</span>'}
                    <button class="favorite-btn main-btn ${isFavorite ? 'active' : ''}" onclick="player.toggleFavorite('${media.id}')">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>
                <div class="media-description">
                    <p>${media.description || ''}</p>
                    ${media.genre ? `<p class="genre">Genre: ${media.genre}</p>` : ''}
                    ${media.year ? `<p class="year">Year: ${media.year}</p>` : ''}
                </div>
                ${media.type === 'show' ? this.renderSeasonList(media) : this.renderVideoPlayer(media)}
            </div>
        `;

        modal.style.display = 'block';

        content.querySelector('.close').onclick = () => {
            this.stopVideo();
            modal.style.display = 'none';
        };
    }

    renderVideoPlayer(media, season = null, episode = null) {
        const progress = this.getProgress(media.id, season, episode);
        let videoSrc, nextEpBtn = '', prevEpBtn = '';
        if (media.type === 'show' && season && episode) {
            videoSrc = `/api/media/${media.id}/stream/s${season}/ep${episode}`;
            const epList = media.seasons[season] || [];
            const epIdx = epList.findIndex(epObj => epObj.number === Number(episode));
            if (epIdx !== -1) {
                if (epIdx > 0) {
                    prevEpBtn = `<button class="main-btn" onclick="player.playEpisode('${media.id}', '${season}', '${epList[epIdx - 1].number}')">
                                    <i class="fas fa-step-backward"></i> Prev
                                 </button>`;
                }
                if (epIdx < epList.length - 1) {
                    nextEpBtn = `<button class="main-btn" onclick="player.playEpisode('${media.id}', '${season}', '${epList[epIdx + 1].number}')">
                                    Next <i class="fas fa-step-forward"></i>
                                 </button>`;
                }
            }
        } else {
            videoSrc = `/api/media/${media.id}/stream`;
        }
        return `
            <div class="media-player">
                <video id="videoPlayer" controls preload="auto">
                    <source src="${videoSrc}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                <div class="player-controls" style="margin-top:1rem;display:flex;gap:1rem;">
                    ${prevEpBtn}
                    ${nextEpBtn}
                </div>
            </div>
        `;
    }

    renderSeasonList(media) {
        if (!media.seasons) return '';
        let html = `<div class="seasons-list">`;
        Object.keys(media.seasons).sort((a, b) => a - b).forEach(seasonNum => {
            html += `<div class="season-block"><h3>Season ${seasonNum}</h3><div class="episodes-grid">`;
            media.seasons[seasonNum].forEach(ep => {
                const prog = this.getProgress(media.id, seasonNum, ep.number);
                let icon = '';
                if (ep.duration && prog > 0) {
                    const percent = prog / ep.duration;
                    if (percent >= 0.85) {
                        icon = `<span class="ep-status complete"><i class="fas fa-check"></i></span>`;
                    } else if (percent > 0.01) {
                        icon = `<span class="ep-status progress"><i class="fas fa-spinner fa-spin"></i></span>`;
                    }
                } else if(prog > 0) {
                    icon = `<span class="ep-status progress"><i class="fas fa-spinner fa-spin"></i></span>`;
                }
                html += `
                    <div class="episode-item" onclick="player.playEpisode('${media.id}', '${seasonNum}', '${ep.number}')">
                        <div class="episode-info">
                            <h4>Ep ${ep.number}</h4>
                            ${icon}
                        </div>
                    </div>
                `;
            });
            html += `</div></div>`;
        });
        html += `</div><div id="dynamicPlayer"></div>`;
        return html;
    }

    playEpisode(mediaId, season, episode) {
        const media = this.mediaCache.get(mediaId);
        if (!media) return;
        const playerHtml = this.renderVideoPlayer(media, season, episode);
        const modal = document.getElementById('playerModal');
        let dynamicPlayer = document.getElementById('dynamicPlayer');
        if (!dynamicPlayer) {
            dynamicPlayer = document.createElement('div');
            dynamicPlayer.id = 'dynamicPlayer';
            modal.querySelector('.media-details').appendChild(dynamicPlayer);
        }
        dynamicPlayer.innerHTML = playerHtml;

        const video = dynamicPlayer.querySelector('video');
        const prog = this.getProgress(mediaId, season, episode);
        if (prog > 0) {
            video.currentTime = prog;
        }
        video.onpause = () => this.saveProgress(mediaId, season, episode, video.currentTime, video.duration);
        video.onended = () => this.saveProgress(mediaId, season, episode, video.currentTime, video.duration);
        video.ontimeupdate = () => {
            if (video.currentTime > 0 && Math.abs((this.getProgress(mediaId, season, episode) || 0) - video.currentTime) > 5) {
                this.saveProgress(mediaId, season, episode, video.currentTime, video.duration);
            }
        };
        video.play();
    }

    stopVideo() {
        const video = document.getElementById('videoPlayer');
        if (video) video.pause();
        const dynamicPlayer = document.getElementById('dynamicPlayer');
        if (dynamicPlayer) dynamicPlayer.innerHTML = '';
    }

    // ... keep your upload logic (populateShowDropdown, upload handlers, etc.) ...
}

window.addEventListener('DOMContentLoaded', () => {
    window.player = new MediaPlayer();
});