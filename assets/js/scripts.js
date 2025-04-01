document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('trackModal');
    const searchInput = document.getElementById('searchInput');
    const trackCount = document.getElementById('trackCount');
    const contentElement = document.querySelector('.content');
    const logo = document.getElementById('logo');
    const muteButton = document.getElementById('muteButton');
    const downloadButton = document.getElementById('downloadButton');
    const settingsGear = document.getElementById('settingsGear');
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsClose = document.querySelector('.settings-close');
    const filterSelect = document.getElementById('filterSelect');

    let tracksData = [];
    let loadedTracks = 0;
    const tracksPerPage = 10;
    const initialLoad = 50;
    const audio = new Audio();
    audio.volume = 0.25;
    let isMuted = localStorage.getItem('isMuted') === 'true';
    let currentPreviewUrl = '';
    let sawUpdateMessage = false;
    let currentTrackIndex = -1;
    let currentFilteredTracks = [];
    let currentDownloadUrl = '';
    audio.muted = isMuted;
    updateMuteIcon();

    function isMobile() {
        return window.innerWidth <= 768;
    }

    function updateMuteIcon() {
        const muteIcon = muteButton.querySelector('.mute-icon');
        const unmuteIcon = muteButton.querySelector('.unmute-icon');
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
        if (!isMuted && currentPreviewUrl) {
            audio.play();
        }
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

    function playPreview(previewUrl) {
        if (audio.src !== previewUrl) {
            audio.src = previewUrl;
            currentPreviewUrl = previewUrl;
        }
        if (!isMuted) {
            audio.play();
        }
    }
    function openModal(track) {
        currentTrackIndex = currentFilteredTracks.findIndex(t => t.title === track.title && t.artist === track.artist);
        renderModal(track);
    }
    function renderModal(track) {
        const { title, artist, releaseYear, cover, bpm, duration, difficulties, createdAt, lastFeatured, previewUrl, download, key, complete, videoUrl, videoPosition} = track;
        const positionPercent = videoPosition !== undefined ? videoPosition : 50;
        console.log('Video URL:', videoUrl, 'Video Position:', videoPosition);
        
        const modalContent = modal.querySelector('.modal-content');
        const existingVideo = modalContent.querySelector('.modal-video');
        if (existingVideo) existingVideo.remove();
    
        modalContent.classList.remove('no-video');

        if (videoUrl) {
            const videoPath = `/assets/preview/${videoUrl}`;
    
            const videoElement = document.createElement('video');
            videoElement.classList.add('modal-video');
            videoElement.autoplay = true;
            videoElement.muted = true;
            videoElement.loop = true;
            videoElement.innerHTML = `<source src="${videoPath}" type="video/mp4">`;
    
            // Set video positioning using percentage
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


        // Update navigation buttons visibility
        const prevButton = modal.querySelector('.modal-prev');
        const nextButton = modal.querySelector('.modal-next');
        prevButton.style.display = currentTrackIndex > 0 ? 'block' : 'none';
        nextButton.style.display = currentTrackIndex < currentFilteredTracks.length - 1 ? 'block' : 'none';
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

        const gridSizeSlider = document.getElementById('gridSize');
        const gridSizeValue = document.getElementById('gridSizeValue');
        let tracksPerRow = parseInt(gridSizeSlider.value); // Will be 4 by default
    
        // ... (previous functions remain the same)
    
        function updateGridSize() {
            tracksPerRow = parseInt(gridSizeSlider.value);
            gridSizeValue.textContent = tracksPerRow;
    
            // Adjust for mobile: override slider if screen is too small
            const screenWidth = window.innerWidth;
            let effectiveTracksPerRow = tracksPerRow;
            if (screenWidth <= 480) {
                effectiveTracksPerRow = 1; // 1 per row on small screens
            } else if (screenWidth <= 768) {
                effectiveTracksPerRow = Math.min(tracksPerRow, 2); // Max 2 on medium screens
            } else if (screenWidth <= 1024) {
                effectiveTracksPerRow = Math.min(tracksPerRow, 3); // Max 3 on tablets
            }
    
            const percentage = 100 / effectiveTracksPerRow;
            const trackElements = document.querySelectorAll('.jam-track');
            trackElements.forEach(track => {
                track.style.flex = `1 1 calc(${percentage}% - 20px)`;
            });
        }
    
        function renderTracks(tracks, clearExisting = true) {
            if (clearExisting) contentElement.innerHTML = '';
    
            tracks.forEach(track => {
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
                touchTimer = setTimeout(() => openModal(track), 500); // Open modal after 500ms
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
                // Add touch event for mobile
                trackElement.addEventListener('touchstart', (e) => {
                    e.preventDefault(); // Prevent default touch behavior
                    if (isMobile()) {
                        // Alternative action (e.g., toggle a highlight or play preview only)
                        trackElement.classList.toggle('mobile-highlight');
                        if (track.previewUrl) {
                            playPreview(track.previewUrl); // Play audio preview instead
                        }
                    } else {
                        openModal(track); // Desktop fallback
                    }
                }, { passive: false });
    
                contentElement.appendChild(trackElement);
            });
            
            if (isMobile()) {
                alert(`Selected: ${track.title} by ${track.artist}`); // Simple alert
            }
            updateGridSize();
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

        // Sort filtered tracks
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

        // Store current filtered tracks
        currentFilteredTracks = filteredTracks;

        trackCount.textContent = query || filterValue !== 'all'
            ? `Found: ${filteredTracks.length}`
            : `Total: ${tracksData.length}`;

        // Reset loaded tracks counter
        loadedTracks = 0;

        // Show all results at once for filtered/search views, or initial batch for main view
        if (query || filterValue !== 'all') {
            renderTracks(filteredTracks);
        } else {
            // For main view, show initial batch and set up infinite scroll
            renderTracks(filteredTracks.slice(0, initialLoad));

            // Only set up infinite scroll if there are more tracks to load
            if (filteredTracks.length > initialLoad) {
                loadedTracks = initialLoad;
                setupInfiniteScroll(filteredTracks);
            }
        }

        // Update URL parameters
        const url = new URL(window.location);
        if (query) url.searchParams.set('q', query);
        else url.searchParams.delete('q');
        if (filterValue !== 'all') url.searchParams.set('filter', filterValue);
        else url.searchParams.delete('filter');
        window.history.replaceState({}, '', url);
    }

    function setupInfiniteScroll(tracks) {
        // Remove any existing sentinel
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
    fetch(`data/jam_tracks.json?_=${Date.now()}`)
        .then(response => response.json())
        .then(data => {
            tracksData = Object.values(data);

            const urlParams = new URLSearchParams(window.location.search);
            const searchQuery = urlParams.get('q');
            const filterValue = urlParams.get('filter');

            if (searchQuery) searchInput.value = searchQuery;
            if (filterValue) filterSelect.value = filterValue;

            filterTracks(); // Handle sorting and rendering
        })
        .catch(error => console.error('Failed to load tracks:', error));
}

    function updateDownloadButton(downloadUrl) {
        currentDownloadUrl = downloadUrl || ''; // Fallback to empty string
        downloadButton.disabled = !currentDownloadUrl || currentDownloadUrl.trim() === ''; // Extra check for empty/whitespace
        console.log('Download URL:', currentDownloadUrl, 'Disabled:', downloadButton.disabled);
    }
    function updateCountdown() {
        const now = new Date();
        const nextUpdate = new Date();
        nextUpdate.setUTCHours(0, 0, 0, 0);

        // Check if we're in the update window (00:00-00:02 UTC)
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
        }
    };

    window.addEventListener('resize', debounce(() => {
        updateGridSize();
    }, 200));

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
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
        gridSize: () => {
            gridSizeSlider.addEventListener('input', debounce(() => {
                updateGridSize();
            }, 100));
            gridSizeSlider.addEventListener('touchmove', debounce(() => {
                updateGridSize();
            }, 100));
        },
        settings: () => {
            settingsGear.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSettingsPanel();
            });
        }
    };

    Object.values(modalEvents).forEach(init => init());
    Object.values(headerEvents).forEach(init => init());

    loadTracks();
});
