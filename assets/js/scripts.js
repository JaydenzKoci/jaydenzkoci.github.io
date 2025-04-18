document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('trackModal');
    const searchInput = document.getElementById('searchInput');
    const trackCount = document.getElementById('trackCount');
    const contentElement = document.querySelector('.content');
    const logo = document.getElementById('logo');
    const muteButton = document.getElementById('muteButton');
    const downloadButton = document.getElementById('downloadButton');
    const settingsButton = document.getElementById('settingsButton');
    const settingsMenu = document.getElementById('settingsMenu');
    const filterSelect = document.getElementById('filterSelect');
    const videoMenuButton = document.getElementById('videoMenuButton');
    const videoMenu = document.getElementById('videoMenu');
    const videoPopup = document.getElementById('videoPopup');
    const youtubeIframe = document.getElementById('youtubeIframe');
    const videoPopupClose = videoPopup.querySelector('.video-popup-close');
    const instrumentList = document.getElementById('instrumentList');
    const videoTrackTitle = document.getElementById('videoTrackTitle');
    const videoTrackArtist = document.getElementById('videoTrackArtist');
    const videoTrackDuration = document.getElementById('videoTrackDuration');
    const videoTrackCover = document.getElementById('videoTrackCover');
    
    let fadeInRequestId = null; 
    let fadeInAudioEnabled = localStorage.getItem('fadeInAudioEnabled') === 'true' || false;
    let tracksData = [];
    let loadedTracks = 0;
    let content;
    let gridSize = localStorage.getItem('gridSize') || '4';
    const tracksPerPage = 10;
    const initialLoad = 50;
    const audio = new Audio();
    audio.volume = 0.25;
    let isMuted = localStorage.getItem('isMuted') === 'true';
    let currentPreviewUrl = '';
    let sawUpdateMessage = false;
    let currentTrackIndex = -1;
    let currentFilteredTracks = [];
    let currentTrack = null;
    let currentDownloadUrl = '';
    audio.muted = isMuted;
    let preloadAssetsEnabled = localStorage.getItem('preloadAssetsEnabled') === 'true' || false;
    let todoList = []; // To-do list array
    updateMuteIcon();

    let tracks = [];
    
    let player;
    window.onYouTubeIframeAPIReady = () => {
        player = new YT.Player('youtubeIframe', {
            height: '315',
            width: '560',
            playerVars: {
                autoplay: 1
            },
            events: {
                onReady: (event) => {
                    event.target.playVideo();
                },
                onError: (event) => {
                    videoPopup.querySelector('.video-popup-content').innerHTML = '<p>Failed to load YouTube video</p>';
                }
            }
        });
    };

    // Fetch to-do list with retries
    function fetchTodoList(retryCount = 0) {
        fetch('data/todoList.json?_=' + Date.now())
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                todoList = Array.isArray(data) ? data : [];
                console.log('Loaded to-do list:', todoList);
                updateTodoListUI();
            })
            .catch(error => {
                console.error(`Error loading to-do list (attempt ${retryCount + 1}):`, error.message);
                if (retryCount < 2) {
                    console.log(`Retrying fetch (attempt ${retryCount + 2})...`);
                    setTimeout(() => fetchTodoList(retryCount + 1), 1000);
                } else {
                    console.error('Max retries reached; falling back to empty to-do list');
                    todoList = [];
                    updateTodoListUI();
                }
            });
    }

    function preloadAssets(tracks) {
        if (!preloadAssetsEnabled) {
            console.log('Preload assets disabled; skipping preload');
            return;
        }
        const preloadIndicator = document.getElementById('preloadIndicator');
        const preloadProgress = document.getElementById('preloadProgress');
        if (preloadIndicator) {
            preloadIndicator.classList.add('active');
        } else {
            console.warn('Preload indicator not found; expected #preloadIndicator');
        }
    
        const maxPreload = 200;
        const tracksToPreload = tracks.slice(0, maxPreload);
        console.log(`Preloading assets for ${tracksToPreload.length} tracks`);
    
        let loadedCount = 0;
        const totalAssets = tracksToPreload.reduce((count, track) => count + (track.cover ? 1 : 0) + (track.videoUrl ? 1 : 0), 0);
    
        // Skip if no assets to preload
        if (totalAssets === 0) {
            console.log('No assets to preload');
            if (preloadIndicator) {
                preloadIndicator.classList.remove('active');
            }
            return;
        }
    
        // Update progress bar
        function updateProgress() {
            const progressPercent = (loadedCount / totalAssets) * 100;
            if (preloadProgress) {
                preloadProgress.value = progressPercent; // For <progress> element
                // For div-based bar: preloadProgressFill.style.width = `${progressPercent}%`;
                console.log(`Preload progress: ${loadedCount}/${totalAssets} (${progressPercent.toFixed(1)}%)`);
                const preloadPercent = document.getElementById('preloadPercent');
                if (preloadPercent) {
                    preloadPercent.textContent = `${Math.round(progressPercent)}%`;
                }
            }
            if (loadedCount >= totalAssets && preloadIndicator) {
                preloadIndicator.classList.remove('active');
            }
        }
    
        tracksToPreload.forEach((track, index) => {
            if (track.cover) {
                const img = new Image();
                img.src = track.cover;
                img.onload = () => {
                    console.log(`Preloaded cover image: ${track.cover}`);
                    loadedCount++;
                    updateProgress();
                };
                img.onerror = () => {
                    console.error(`Failed to preload cover image: ${track.cover}`);
                    loadedCount++;
                    updateProgress();
                };
            }
    
            if (track.videoUrl) {
                const videoPath = `/assets/preview/${track.videoUrl}`;
                const video = document.createElement('video');
                video.src = videoPath;
                video.preload = 'auto';
                video.onloadeddata = () => {
                    console.log(`Preloaded video: ${videoPath}`);
                    loadedCount++;
                    updateProgress();
                    video.remove();
                };
                video.onerror = () => {
                    console.error(`Failed to preload video: ${videoPath}`);
                    loadedCount++;
                    updateProgress();
                    video.remove();
                };
                document.body.appendChild(video);
            }
        });
    
        // Fallback to hide indicator after timeout
        if (preloadIndicator) {
            setTimeout(() => {
                preloadIndicator.classList.remove('active');
                if (preloadProgress) {
                    preloadProgress.value = 0; // Reset progress
                    // For div-based bar: preloadProgressFill.style.width = '0%';
                }
            }, 10000);
        }
    }

    function handleSettingsMenuClick() {
        const menuItems = settingsMenu.querySelectorAll('li');
        menuItems.forEach(item => {
            item.onclick = (e) => {
                const setting = item.getAttribute('data-setting');
                console.log('Clicked setting:', setting);
                if (setting === 'audio-fade') {
                    fadeInAudioEnabled = !fadeInAudioEnabled;
                    localStorage.setItem('fadeInAudioEnabled', fadeInAudioEnabled);
                    item.textContent = `Fade In Audio: ${fadeInAudioEnabled ? 'On' : 'Off'}`;
                    item.setAttribute('aria-checked', fadeInAudioEnabled);
                    console.log('Toggled audio-fade:', fadeInAudioEnabled);
                } else if (setting === 'grid-size') {
                    const gridSizeSpan = e.target.closest('span[data-grid-size]');
                    if (gridSizeSpan) {
                        const newSize = gridSizeSpan.getAttribute('data-grid-size');
                        gridSize = newSize;
                        localStorage.setItem('gridSize', gridSize);
                        document.documentElement.style.setProperty('--grid-size', gridSize);
                        item.querySelectorAll('span').forEach(span => span.classList.remove('active'));
                        gridSizeSpan.classList.add('active');
                        console.log('Toggled grid-size:', gridSize);
                    }
                } else if (setting === 'preload') {
                    preloadAssetsEnabled = !preloadAssetsEnabled;
                    localStorage.setItem('preloadAssetsEnabled', preloadAssetsEnabled);
                    item.textContent = `Preload Assets: ${preloadAssetsEnabled ? 'On' : 'Off'}`;
                    item.setAttribute('aria-checked', preloadAssetsEnabled);
                    if (preloadAssetsEnabled) {
                        preloadAssets(currentFilteredTracks);
                    }
                    console.log('Toggled preload:', preloadAssetsEnabled);
                } else if (setting === 'todo') {
                    e.stopPropagation();
                    e.preventDefault();
                    settingsMenu.style.display = 'block';
                    settingsButton.setAttribute('aria-expanded', 'true');
                    fetchTodoList(); // Refresh to-do list on click
                    console.log('To-do list clicked; menu kept open');
                    return;
                } else if (setting === 'reset') {
                    localStorage.clear();
                    location.reload();
                }
                settingsMenu.style.display = 'none';
                settingsButton.setAttribute('aria-expanded', 'false');
            };
        });
    }

    function isMobile() {
        return window.innerWidth <= 768;
    }

    document.addEventListener('click', (e) => {
        if (!videoMenuButton.contains(e.target) && !videoMenu.contains(e.target)) {
            videoMenu.style.display = 'none';
            videoMenuButton.setAttribute('aria-expanded', 'false');
        }
    });
    
    function toggleSettingsMenu() {
        const isOpen = settingsMenu.style.display === 'block';
        settingsMenu.style.display = isOpen ? 'none' : 'block';
        settingsButton.setAttribute('aria-expanded', !isOpen);
    }
    
    function toggleVideoMenu() {
        const isOpen = videoMenu.style.display === 'block';
        videoMenu.style.display = isOpen ? 'none' : 'block';
        videoMenuButton.setAttribute('aria-expanded', !isOpen);
    }
    
    document.addEventListener('click', (e) => {
        if (!settingsButton.contains(e.target) && !settingsMenu.contains(e.target)) {
            settingsMenu.style.display = 'none';
            settingsButton.setAttribute('aria-expanded', 'false');
        }
        if (!videoMenuButton.contains(e.target) && !videoMenu.contains(e.target)) {
            videoMenu.style.display = 'none';
            videoMenuButton.setAttribute('aria-expanded', 'false');
        }
        if (e.target === videoPopup && videoPopup.style.display === 'block') {
            closeVideoPopup();
        }
    });
    
    function fadeInAudio(audio, targetVolume, duration) {
        if (fadeInRequestId) {
            cancelAnimationFrame(fadeInRequestId);
        }
        audio.volume = 0;
        const startTime = performance.now();
    
        function step(currentTime) {
            const elapsed = Math.max(currentTime - startTime, 0);
            const progress = Math.min(elapsed / duration, 1);
            audio.volume = Math.max(0, Math.min(progress * targetVolume, 1));
            if (progress < 1) {
                fadeInRequestId = requestAnimationFrame(step);
            } else {
                audio.volume = targetVolume;
                fadeInRequestId = null;
            }
        }
        fadeInRequestId = requestAnimationFrame(step);
    }
    
    function playPreview(previewUrl) {
        if (audio.src !== previewUrl) {
            audio.src = previewUrl;
            currentPreviewUrl = previewUrl;
            audio.load();
        }
        if (!isMuted && videoPopup.style.display !== 'block') {
            audio.play().then(() => {
                console.log('Audio playing:', previewUrl);
                if (fadeInAudioEnabled) {
                    fadeInAudio(audio, 0.25, 3000);
                } else {
                    audio.volume = 0.25;
                }
            }).catch(error => {
                console.error('Audio playback failed:', error);
                if (isMobile()) {
                    console.log('Mobile device detected; audio playback may require user interaction');
                }
            });
        }
    }
    
    function updateMuteIcon() {
        const muteIcon = muteButton.querySelector('.mute-icon');
        const unmuteIcon = muteButton.querySelector('.unmute-icon');
        muteButton.setAttribute('aria-pressed', isMuted);
        if (isMuted) {
            muteIcon.style.display = 'block';
            unmuteIcon.style.display = 'none';
        } else {
            muteIcon.style.display = 'none';
            unmuteIcon.style.display = 'block';
        }
    }
    
    function toggleMute() {
        isMuted = !isMuted;
        audio.muted = isMuted;
        localStorage.setItem('isMuted', isMuted);
        updateMuteIcon();
        if (!isMuted && currentPreviewUrl && videoPopup.style.display !== 'block') {
            audio.play().then(() => {
                console.log('Audio unmuted:', currentPreviewUrl);
                if (fadeInAudioEnabled) {
                    fadeInAudio(audio, 0.25, 2000);
                } else {
                    audio.volume = 0.25;
                }
            }).catch(error => {
                console.error('Audio playback failed:', error);
            });
        }
    }
    
    function closeVideoPopup() {
        console.log('Closing video popup');
        videoPopup.style.display = 'none';
        document.body.classList.remove('video-popup-open');
    
        if (player) {
            try {
                player.stopVideo();
                player.clearVideo();
            } catch (error) {
                console.error('Player cleanup failed:', error);
            }
        }
        youtubeIframe.src = '';
    
        instrumentList.innerHTML = '';
        videoTrackCover.src = '';
        videoTrackTitle.textContent = '';
        videoTrackArtist.textContent = '';
        videoTrackDuration.textContent = '';
    
        if (currentPreviewUrl) {
            isMuted = false; 
            audio.muted = false; 
            localStorage.setItem('isMuted', false); 
            updateMuteIcon(); 
            playPreview(currentPreviewUrl);
        } else {
            console.log('No preview audio to play: currentPreviewUrl is empty');
        }
    
        currentTrack = null;
    }

    function updateDownloadButton(downloadUrl) {
        currentDownloadUrl = downloadUrl || '';
        downloadButton.disabled = !currentDownloadUrl || currentDownloadUrl.trim() === '';
    }

    function handleDownload() {
        if (currentDownloadUrl) {
            window.location.href = currentDownloadUrl;
        }
    }

    function openModal(track) {
        currentTrackIndex = currentFilteredTracks.findIndex(t => t.title === track.title && t.artist === track.artist);
        renderModal(track);
    }

    function renderModal(track) {
        const { title, artist, releaseYear, cover, bpm, duration, difficulties, createdAt, lastFeatured, previewUrl, download, key, complete, videoUrl, videoPosition, youtubeLinks} = track;
        const positionPercent = videoPosition !== undefined ? videoPosition : 50;
        console.log('Video URL:', videoUrl, 'Video Position:', videoPosition);
        
        const modalContent = modal.querySelector('.modal-content');
        const existingVideo = modalContent.querySelector('.modal-video');
        if (existingVideo) existingVideo.remove();
    
        modalContent.classList.remove('no-video');

        if (track.previewUrl) {
            playPreview(track.previewUrl);
        }
        if (videoUrl) {
            const videoPath = `/assets/preview/${videoUrl}`;
    
            const videoElement = document.createElement('video');
            videoElement.classList.add('modal-video');
            videoElement.autoplay = true;
            videoElement.muted = true;
            videoElement.loop = true;
            videoElement.innerHTML = `<source src="${videoPath}" type="video/mp4">`;
    
            videoElement.style.objectFit = 'cover';
            videoElement.style.objectPosition = `center ${positionPercent}%`;
    
            modalContent.insertBefore(videoElement, modalContent.firstChild);
            videoElement.onerror = () => {
                console.log(`Video not found or failed to load: ${videoPath}`);
                videoElement.remove();
                modalContent.classList.add('no-video');
            };
            videoElement.onloadeddata = () => {
                console.log(`Video loaded successfully: ${videoUrl}`);
                videoElement.classList.add('loaded');
            };
        } else {
            console.log('No videoUrl provided for this track');
            modalContent.classList.add('no-video');
        }
        
        modal.querySelector('#modalCover').src = cover;
        modal.querySelector('#modalTitle').textContent = title;
        modal.querySelector('#modalArtist').textContent = artist;
        modal.querySelector('#modalDuration').textContent = `${releaseYear} | ${duration}`;
        modal.querySelector('#modalDetails').innerHTML = `
            <p>Created At: ${new Date(createdAt).toLocaleString()}</p>
            <p>Last Updated: ${lastFeatured}</p>
            <p>Progress: ${complete}</p>
        `;
        generateDifficultyBars(difficulties, modal.querySelector('#modalDifficulties'));

        modal.style.display = 'block';
        document.body.classList.add('modal-open');

        if (previewUrl) {
            playPreview(previewUrl);
        }

        updateDownloadButton(download);

        const prevButton = modal.querySelector('.modal-prev');
        const nextButton = modal.querySelector('.modal-next');
        prevButton.style.display = currentTrackIndex > 0 ? 'block' : 'none';
        nextButton.style.display = currentTrackIndex < currentFilteredTracks.length - 1 ? 'block' : 'none';

        // Disable video menu button if no YouTube links
        const hasYouTubeLinks = youtubeLinks && Object.values(youtubeLinks).some(url => url && typeof url === 'string' && url.trim() !== '');
        videoMenuButton.disabled = !hasYouTubeLinks;
        console.log('Video menu button status:', hasYouTubeLinks ? 'enabled' : 'disabled', 'youtubeLinks:', youtubeLinks);

        const menuItems = videoMenu.querySelectorAll('li');
        menuItems.forEach(item => {
            const instrument = item.getAttribute('data-instrument');
            const youtubeUrl = youtubeLinks && youtubeLinks[instrument];
            item.style.display = youtubeUrl ? 'block' : 'none';
            item.onclick = () => {
                if (youtubeUrl) {
                    openVideoPopup(track, youtubeUrl);
                    videoMenu.style.display = 'none';
                    videoMenuButton.setAttribute('aria-expanded', 'false');
                }
            };
        });
    }
    
    function updateDownloadButton(download) {
        downloadButton.disabled = !download;
        downloadButton.onclick = download ? () => window.open(download, '_blank') : null;
    }
    
    function populateInstrumentList(track, selectedInstrument) {
        instrumentList.innerHTML = '';
        const instruments = ['vocals', 'lead', 'bass', 'drums'];
        instruments.forEach(instrument => {
            if (track.youtubeLinks && track.youtubeLinks[instrument]) {
                const li = document.createElement('li');
                li.setAttribute('data-instrument', instrument);
                li.className = instrument === selectedInstrument ? 'active' : '';
                li.innerHTML = `<span class="instrument-icon ${instrument}"></span>${instrument.charAt(0).toUpperCase() + instrument.slice(1)}`;
                li.addEventListener('click', () => {
                    document.querySelectorAll('.instrument-list li').forEach(item => item.classList.remove('active'));
                    li.classList.add('active');
                    const youtubeUrl = track.youtubeLinks[instrument];
                    const videoId = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?]+)/)?.[1];
                    if (videoId && player) {
                        player.loadVideoById(videoId);
                        player.mute();
                        console.log('Switched to instrument video:', instrument, videoId);
                    } else if (videoId) {
                        youtubeIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
                        console.log('Switched to iframe video:', instrument, videoId);
                    }
                });
                instrumentList.appendChild(li);
            }
        });
    }
    
    function openVideoPopup(track, youtubeUrl) {
        currentTrack = track;
        const videoId = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?]+)/)?.[1];

        if (!audio.paused || currentPreviewUrl) {
            isMuted = true; 
            audio.muted = true; 
            audio.pause(); 
            localStorage.setItem('isMuted', true); 
            updateMuteIcon(); 
            console.log('Preview audio muted and paused for video popup');
        }

        if (track.previewUrl && !currentPreviewUrl) {
            currentPreviewUrl = track.previewUrl;
        }
        videoTrackCover.src = track.cover;
        videoTrackTitle.textContent = track.title;
        videoTrackArtist.textContent = track.artist;
        videoTrackDuration.textContent = `${track.releaseYear} | ${track.duration}`;
        const selectedInstrument = Object.keys(track.youtubeLinks || {}).find(instrument => track.youtubeLinks[instrument] === youtubeUrl) || 'vocals';
        populateInstrumentList(track, selectedInstrument);

        if (videoId && player) {
            player.loadVideoById(videoId);
            player.mute();
            videoPopup.style.display = 'block';
            document.body.classList.add('video-popup-open');
            console.log('Video popup opened:', videoId);
        } else if (videoId) {
            youtubeIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            videoPopup.style.display = 'block';
            document.body.classList.add('video-popup-open');
            console.log('Iframe video opened:', videoId);
        } else {
            console.error('Invalid YouTube URL:', youtubeUrl);
            videoPopup.style.display = 'block';
            videoPopup.querySelector('.video-popup-content').innerHTML = '<p>Invalid YouTube video URL</p>';
            instrumentList.innerHTML = '';
            videoTrackCover.src = '';
        }
    }

    function closeModal() {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        if (!audio.paused) {
            audio.pause();
        }
        audio.src = '';
        currentPreviewUrl = '';
        updateDownloadButton('');
    }

    function renderTracks(clearExisting = true) {
        if (clearExisting) contentElement.innerHTML = '';
    
        currentFilteredTracks.forEach((track, index) => {
            const trackElement = document.createElement('div');
            trackElement.classList.add('jam-track');
    
            const loadingSpinner = document.createElement('div');
            loadingSpinner.className = 'loading-spinner';
    
            const img = new Image();
            img.src = track.cover;
            img.alt = `${track.title} Cover`;
            img.style.display = 'none';
    
            img.onload = () => {
                loadingSpinner.remove();
                img.style.display = '';
                img.classList.add('loaded');
            };
    
            trackElement.innerHTML = `
                <div>
                    <h2>${track.title}</h2>
                    <p>${track.artist}</p>
                </div>
            `;

            let touchTimer;
            trackElement.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (isMobile()) {
                    touchTimer = setTimeout(() => openModal(track), 500); 
                } else {
                    openModal(track);
                }
            }, { passive: false });

            trackElement.addEventListener('touchend', (e) => {
                if (isMobile()) {
                    clearTimeout(touchTimer);
                    trackElement.classList.toggle('mobile-highlight');
                    if (track.previewUrl) playPreview(track.previewUrl);
                }
            });

            trackElement.insertBefore(loadingSpinner, trackElement.firstChild);
            trackElement.insertBefore(img, trackElement.firstChild);
    
            const labels = generateLabels(track);
            trackElement.appendChild(labels);

            trackElement.addEventListener('click', (e) => {
                if (!isMobile()) {
                    openModal(track);
                }
            });
    
            trackElement.addEventListener('click', () => openModal(track));
            trackElement.addEventListener('touchstart', (e) => {
                e.preventDefault(); 
                if (isMobile()) {
                    trackElement.classList.toggle('mobile-highlight');
                    if (track.previewUrl) {
                        playPreview(track.previewUrl); 
                    }
                } else {
                    openModal(track); 
                }
            }, { passive: false });
    
            contentElement.appendChild(trackElement);
        });
        
        if (isMobile()) {
            alert(`Selected: ${track.title} by ${track.artist}`);
        }
    }

    function filterTracks() {
        const query = searchInput.value.toLowerCase();
        const filterValue = filterSelect.value;

        let filteredTracks = tracksData.filter(track => {
            const matchesSearch = track.title.toLowerCase().includes(query) ||
                                track.artist.toLowerCase().includes(query);

            if (!matchesSearch) return false;

            switch (filterValue) {
                case 'featured':
                    return track.featured;
                case 'rotated':
                    return track.rotated;
                case 'new':
                    return track.new;
                case 'finish':
                    return track.finish;
                default:
                    return true;
            }
        });

        filteredTracks.sort((a, b) => {
            if (filterValue === 'rotated') {
                return new Date(b.lastFeatured) - new Date(a.lastFeatured);
            } else if (filterValue === 'new') {
                return new Date(b.createdAt) - new Date(a.createdAt);       
            } else if (filterValue === 'finish') {
                return new Date(b.createdAt) - new Date(a.createdAt);       
            } else {
                if (a.featured && !b.featured) return -1;
                if (!a.featured && b.featured) return 1;
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
        });

        currentFilteredTracks = filteredTracks;

        trackCount.textContent = query || filterValue !== 'all'
            ? `Found: ${filteredTracks.length}`
            : `Total: ${tracksData.length}`;

        loadedTracks = 0;

        if (query || filterValue !== 'all') {
            renderTracks(filteredTracks);
        } else {
            renderTracks(filteredTracks.slice(0, initialLoad));

            if (filteredTracks.length > initialLoad) {
                loadedTracks = initialLoad;
                setupInfiniteScroll(filteredTracks);
            }
        }

        if (preloadAssetsEnabled) {
            preloadAssets(currentFilteredTracks);
        }
    
        const url = new URL(window.location);
        if (query) url.searchParams.set('q', query);
        else url.searchParams.delete('q');
        if (filterValue !== 'all') url.searchParams.set('filter', filterValue);
        else url.searchParams.delete('filter');
        window.history.replaceState({}, '', url);
    }

    function setupInfiniteScroll(tracks) {
        const existingSentinel = contentElement.querySelector('.sentinel');
        if (existingSentinel) {
            existingSentinel.remove();
        }

        const sentinel = document.createElement('div');
        sentinel.className = 'sentinel';
        sentinel.style.height = '1px';
        contentElement.appendChild(sentinel);

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting &&
                filterSelect.value === 'all' &&
                !searchInput.value &&
                loadedTracks < tracks.length) {

                observer.unobserve(entries[0].target);
                const nextBatch = tracks.slice(loadedTracks, loadedTracks + tracksPerPage);
                renderTracks(nextBatch, false);
                loadedTracks += tracksPerPage;

                if (loadedTracks < tracks.length) {
                    const newSentinel = document.createElement('div');
                    newSentinel.className = 'sentinel';
                    newSentinel.style.height = '1px';
                    contentElement.appendChild(newSentinel);
                    observer.observe(newSentinel);
                }
            }
        });

        observer.observe(sentinel);
    }

    function generateDifficultyBars(difficulties, container) {
        container.innerHTML = '';
        const maxBars = 7;
        Object.entries(difficulties).forEach(([instrument, level]) => {
            const difficultyElement = document.createElement('div');
            difficultyElement.classList.add('difficulty');

            let barsHTML = '';
            for (let i = 1; i <= maxBars; i++) {
                barsHTML += `<div class="difficulty-bar"><span class="${i <= (level + 1) ? 'active' : ''}"></span></div>`;
            }

            difficultyElement.innerHTML = `
                <div class="instrument-icon ${instrument}"></div>
                <div class="difficulty-bars">${barsHTML}</div>
            `;

            container.appendChild(difficultyElement);
        });
    }

    function generateLabels(track) {
        const labelContainer = document.createElement('div');
        labelContainer.classList.add('label-container');

        if (track.new) {
            const newLabel = document.createElement('span');
            newLabel.classList.add('new-label');
            newLabel.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                </svg>
            `;
            labelContainer.appendChild(newLabel);
        }
        if (track.finish) {
            const newLabel = document.createElement('span');
            newLabel.classList.add('finish-label');
            newLabel.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                </svg>
            `;
            labelContainer.appendChild(newLabel);
        }
        if (track.featured) {
            const featuredLabel = document.createElement('span');
            featuredLabel.classList.add('featured-label');
            featuredLabel.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                </svg>
            `;
            labelContainer.appendChild(featuredLabel);
        }

        return labelContainer;
    }

    function navigateModal(direction) {
        const newIndex = currentTrackIndex + direction;
        if (newIndex >= 0 && newIndex < currentFilteredTracks.length) {
            currentTrackIndex = newIndex;
            renderModal(currentFilteredTracks[newIndex]);
        }
    }

    function loadTracks() {
        fetch(`data/tracks.json?_=${Date.now()}`)
            .then(response => response.json())
            .then(data => {
                tracksData = Object.values(data);

                const urlParams = new URLSearchParams(window.location.search);
                const searchQuery = urlParams.get('q');
                const filterValue = urlParams.get('filter');

                if (searchQuery) searchInput.value = searchQuery;
                if (filterValue) filterSelect.value = filterValue;

                filterTracks();

                if (preloadAssetsEnabled) {
                    preloadAssets(currentFilteredTracks);
                }
            })
            .catch(error => {
                console.error('Failed to load tracks:', error);
            });
    }

    function updateDownloadButton(downloadUrl) {
        currentDownloadUrl = downloadUrl || '';
        downloadButton.disabled = !currentDownloadUrl || currentDownloadUrl.trim() === ''; 
        console.log('Download URL:', currentDownloadUrl, 'Disabled:', downloadButton.disabled);
    }

    function updateCountdown() {
        const now = new Date();
        const nextUpdate = new Date();
        nextUpdate.setUTCHours(0, 0, 0, 0);

        const updateStart = new Date(nextUpdate);
        const updateEnd = new Date(nextUpdate);
        updateEnd.setUTCMinutes(2);

        if (now >= updateStart && now <= updateEnd) {
            document.getElementById('countdown').textContent = '';
            sawUpdateMessage = true;
            return;
        }

        if (sawUpdateMessage && now > updateEnd) {
            window.location.reload();
            return;
        }

        if (now > updateEnd) {
            sawUpdateMessage = false;
        }

        if (now > updateEnd) {
            nextUpdate.setUTCDate(nextUpdate.getUTCDate() + 1);
        }

        const diff = nextUpdate - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        document.getElementById('countdown').textContent = ``;
    }

    setInterval(updateCountdown, 1000);
    updateCountdown();

    const modalEvents = {
        close: () => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
            document.querySelector('.modal-close').addEventListener('click', closeModal);
        },
        navigation: () => {
            modal.querySelector('.modal-prev').addEventListener('click', () => navigateModal(-1));
            modal.querySelector('.modal-next').addEventListener('click', () => navigateModal(1));
        },
        keyboard: () => {
            document.addEventListener('keydown', (e) => {
                if (modal.style.display === 'block') {
                    switch (e.key) {
                        case 'ArrowLeft': navigateModal(-1); break;
                        case 'ArrowRight': navigateModal(1); break;
                        case 'Escape': closeModal(); break;
                        case 'm': toggleMute(); break;
                    }
                }
            });
        },
        settingsMenuKeyboard: () => {
            document.addEventListener('keydown', (e) => {
                if (settingsMenu.style.display === 'block' && e.key === 'Escape') {
                    settingsMenu.style.display = 'none';
                    settingsButton.setAttribute('aria-expanded', 'false');
                    settingsButton.focus();
                }
            });
        },
        videoPopupKeyboard: () => {
            document.addEventListener('keydown', (e) => {
                if (videoPopup.style.display === 'block' && e.key === 'Escape') {
                    closeVideoPopup();
                    isMuted = false;
                    audio.muted = false; 
                    updateMuteIcon(); 
                }
            });
        }
    };

    const headerEvents = {
        logo: () => {
            logo.addEventListener('click', () => window.location.href = '/');
        },
        search: () => {
            searchInput.addEventListener('input', filterTracks);
        },
        filter: () => {
            filterSelect.addEventListener('change', filterTracks);
        },
        audio: () => {
            muteButton.addEventListener('click', toggleMute);
        },
        download: () => {
            downloadButton.addEventListener('click', handleDownload);
        },
        settingsMenu: () => {
            settingsButton.addEventListener('click', toggleSettingsMenu);
            handleSettingsMenuClick();
            settingsButton.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSettingsMenu();
                }
            });
            settingsMenu.addEventListener('keydown', (e) => {
                const items = settingsMenu.querySelectorAll('li');
                const current = document.activeElement;
                const index = Array.from(items).indexOf(current);
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = (index + 1) % items.length;
                    items[next].focus();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = (index - 1 + items.length) % items.length;
                    items[prev].focus();
                } else if (e.key === 'Escape') {
                    settingsMenu.style.display = 'none';
                    settingsButton.setAttribute('aria-expanded', 'false');
                    settingsButton.focus();
                }
            });
        },
        videoMenu: () => {
            videoMenuButton.addEventListener('click', toggleVideoMenu);
            videoPopupClose.addEventListener('click', closeVideoPopup);
            videoPopup.addEventListener('click', (e) => {
                if (e.target === videoPopup) closeVideoPopup();
            });
        },
        instrumentListKeyboard: () => {
            instrumentList.addEventListener('keydown', (e) => {
                const items = instrumentList.querySelectorAll('li');
                const current = document.activeElement;
                const index = Array.from(items).indexOf(current);
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = (index + 1) % items.length;
                    items[next].focus();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = (index - 1 + items.length) % items.length;
                    items[prev].focus();
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    current.click();
                }
            });
        }
    };

    Object.values(modalEvents).forEach(init => init());
    Object.values(headerEvents).forEach(init => init());

    document.addEventListener('DOMContentLoaded', () => {
        content = document.querySelector('.content');
        settingsMenu = document.querySelector('#settingsMenu');
    
        fadeInAudioEnabled = localStorage.getItem('fadeInAudioEnabled') === 'true' ? true : localStorage.getItem('fadeInAudioEnabled') === 'false' ? false : true;
        preloadAssetsEnabled = localStorage.getItem('preloadAssetsEnabled') === 'true' ? true : localStorage.getItem('preloadAssetsEnabled') === 'false' ? false : false;
        gridSize = ['1', '2', '3', '4'].includes(localStorage.getItem('gridSize')) ? localStorage.getItem('gridSize') : '4';
        isMuted = localStorage.getItem('isMuted') === 'true' ? true : localStorage.getItem('isMuted') === 'false' ? false : false;
    
        console.log('Raw localStorage values:', {
            fadeInAudioEnabled: localStorage.getItem('fadeInAudioEnabled'),
            preloadAssetsEnabled: localStorage.getItem('preloadAssetsEnabled'),
            gridSize: localStorage.getItem('gridSize'),
            isMuted: localStorage.getItem('isMuted')
        });
        console.log('Parsed JavaScript variables:', {
            fadeInAudioEnabled,
            preloadAssetsEnabled,
            gridSize,
            isMuted
        });

        fetchTodoList(); // Initial fetch
    
        updateAllSettingsUI();
    
        audio.muted = isMuted;
        if (preloadAssetsEnabled) {
            console.log('Preload enabled; will preload after tracks load');
        }
        document.documentElement.style.setProperty('--grid-size', gridSize);
    
        handleSettingsMenuClick();
    });

    function updateTodoListUI(retryCount = 0) {
        const todoListElement = document.getElementById('todoList');
        if (!todoListElement) {
            if (retryCount < 5) {
                console.warn(`To-do list element not found (attempt ${retryCount + 1}); retrying...`);
                setTimeout(() => updateTodoListUI(retryCount + 1), 200);
            } else {
                console.error('To-do list element not found after retries; expected <ul id="todoList">');
            }
            return;
        }
        todoListElement.classList.add('todo-list-loading');
        todoListElement.innerHTML = '';
        if (todoList.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'No tasks available';
            li.style.opacity = '0.7';
            todoListElement.appendChild(li);
        } else {
            todoList.forEach(task => {
                const li = document.createElement('li');
                li.className = task.completed ? 'completed' : '';
                li.innerHTML = `<span class="todo-text" aria-label="To-do task: ${task.text}${task.completed ? ', completed' : ''}">${task.text}</span>`;
                todoListElement.appendChild(li);
            });
        }
        todoListElement.classList.remove('todo-list-loading');
        console.log('Updated to-do list UI:', todoList, 'HTML:', todoListElement.innerHTML);
    }

    function updateAudioFadeUI() {
        const audioFadeItem = settingsMenu?.querySelector('li[data-setting="audio-fade"]');
        if (audioFadeItem) {
            const newText = `Fade In Audio: ${fadeInAudioEnabled ? 'On' : 'Off'}`;
            if (audioFadeItem.textContent !== newText) {
                audioFadeItem.textContent = newText;
                audioFadeItem.setAttribute('aria-checked', fadeInAudioEnabled);
                settingsMenu.classList.add('settings-menu-updated');
                setTimeout(() => settingsMenu.classList.remove('settings-menu-updated'), 1000);
                console.log('Updated audio-fade UI:', audioFadeItem.textContent, 'fadeInAudioEnabled=', fadeInAudioEnabled);
            }
        }
    }

    function updatePreloadUI() {
        const preloadItem = settingsMenu?.querySelector('li[data-setting="preload"]');
        if (preloadItem) {
            const newText = `Preload Assets: ${preloadAssetsEnabled ? 'On' : 'Off'}`;
            if (preloadItem.textContent !== newText) {
                preloadItem.textContent = newText;
                preloadItem.setAttribute('aria-checked', preloadAssetsEnabled);
                console.log('Updated preload UI:', preloadItem.textContent, 'preloadAssetsEnabled=', preloadAssetsEnabled);
            } else {
                console.log('Preload UI already correct:', preloadItem.textContent, 'preloadAssetsEnabled=', preloadAssetsEnabled);
            }
        } else {
            console.warn('Preload menu item not found; expected <li data-setting="preload">');
        }
    }
    
    function updateGridSizeUI() {
        const gridSizeItem = settingsMenu?.querySelector('li[data-setting="grid-size"]');
        if (gridSizeItem) {
            gridSizeItem.querySelectorAll('span').forEach(span => span.classList.remove('active'));
            const activeSpan = gridSizeItem.querySelector(`span[data-grid-size="${gridSize}"]`);
            if (activeSpan) {
                activeSpan.classList.add('active');
                console.log('Updated grid-size UI: Active span:', activeSpan.textContent, 'gridSize=', gridSize);
            } else {
                console.warn(`Grid size span for ${gridSize} not found; expected <span data-grid-size="${gridSize}">`);
            }
            document.documentElement.style.setProperty('--grid-size', gridSize);
        } else {
            console.warn('Grid size menu item not found; expected <li data-setting="grid-size">');
        }
    }
    
    function updateMuteIcon() {
        const muteButton = document.getElementById('muteButton');
        const muteIcon = muteButton?.querySelector('.mute-icon');
        const unmuteIcon = muteButton?.querySelector('.unmute-icon');
        if (muteButton && muteIcon && unmuteIcon) {
            muteButton.setAttribute('aria-pressed', isMuted);
            muteIcon.style.display = isMuted ? 'block' : 'none';
            unmuteIcon.style.display = isMuted ? 'none' : 'block';
            console.log('Updated mute UI: isMuted=', isMuted);
            updateAudioFadeUI();
            updatePreloadUI();
            updateGridSizeUI();
        } else {
            console.warn('Mute button or icons not found; expected #muteButton with .mute-icon and .unmute-icon');
        }
    }
    
    function updateAllSettingsUI(retryCount = 0) {
        if (!settingsMenu || !settingsMenu.querySelector('li[data-setting="audio-fade"]')) {
            if (retryCount < 5) {
                console.warn(`Settings menu not ready (attempt ${retryCount + 1}); retrying...`);
                setTimeout(() => updateAllSettingsUI(retryCount + 1), 200);
            } else {
                console.error('Settings menu not found after retries');
            }
            return;
        }
    
        console.log('Final settings menu HTML:', settingsMenu.innerHTML);
    }
        
    function loadTracks() {
        fetch(`data/tracks.json?_=${Date.now()}`)
            .then(response => {
                if (!response.ok) throw new Error('Failed to load tracks');
                return response.json();
            })
            .then(data => {
                tracksData = Object.values(data);
    
                const urlParams = new URLSearchParams(window.location.search);
                const searchQuery = urlParams.get('q');
                const filterValue = urlParams.get('filter');
    
                if (searchQuery) searchInput.value = searchQuery;
                if (filterValue) filterSelect.value = filterValue;
    
                filterTracks();
    
                if (preloadAssetsEnabled) {
                    console.log('Preloading assets after tracks loaded');
                    preloadAssets(currentFilteredTracks);
                }
            })
            .catch(error => {
                console.error('Failed to load tracks:', error);
                contentElement.innerHTML = '<p>Error loading tracks. Please try again later.</p>';
            });
    }
            
    loadTracks();
    currentFilteredTracks = tracks;
    renderTracks();
});