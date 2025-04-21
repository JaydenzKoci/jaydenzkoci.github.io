document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const elements = {
    modal: document.getElementById('trackModal'),
    searchInput: document.getElementById('searchInput'),
    trackCount: document.getElementById('trackCount'),
    content: document.querySelector('.content'),
    logo: document.getElementById('logo'),
    muteButton: document.getElementById('muteButton'),
    downloadButton: document.getElementById('downloadButton'),
    settingsButton: document.getElementById('settingsButton'),
    settingsMenu: document.getElementById('settingsMenu'),
    filterSelect: document.getElementById('filterSelect'),
    sortSelect: document.getElementById('sortSelect'),
    videoMenuButton: document.getElementById('videoMenuButton'),
    videoMenu: document.getElementById('videoMenu'),
    videoPopup: document.getElementById('videoPopup'),
    youtubeIframe: document.getElementById('youtubeIframe'),
    videoPopupClose: document.querySelector('#videoPopup .video-popup-close'),
    instrumentList: document.getElementById('instrumentList'),
    videoTrackTitle: document.getElementById('videoTrackTitle'),
    videoTrackArtist: document.getElementById('videoTrackArtist'),
    videoTrackDuration: document.getElementById('videoTrackDuration'),
    videoTrackCover: document.getElementById('videoTrackCover'),
    preloadIndicator: document.getElementById('preloadIndicator'),
    preloadProgress: document.getElementById('preloadProgress'),
    preloadPercent: document.getElementById('preloadPercent'),
    todoList: document.getElementById('todoList'),
    countdown: document.getElementById('countdown'),
  };

  // State
  let state = {
    fadeInAudioEnabled: localStorage.getItem('fadeInAudioEnabled') === 'true',
    preloadAssetsEnabled: localStorage.getItem('preloadAssetsEnabled') === 'true',
    gridSize: localStorage.getItem('gridSize') || '4',
    isMuted: localStorage.getItem('isMuted') === 'true',
    tracksData: [],
    currentFilteredTracks: [],
    loadedTracks: 0,
    currentTrackIndex: -1,
    currentTrack: null,
    currentPreviewUrl: '',
    currentDownloadUrl: '',
    todoList: [],
    sawUpdateMessage: false,
    fadeInRequestId: null,
    tracksPerPage: 10,
    initialLoad: 50,
  };

  const audio = new Audio();
  audio.volume = 0.25;
  audio.muted = state.isMuted;

  let player;
  let intersectionObserver;

  // Utility Functions
  const utils = {
    isMobile: () => window.innerWidth <= 768,
    debounce: (fn, delay) => {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
      };
    },
    fetchWithRetry: (url, retries = 3, delay = 1000) =>
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .catch((error) => {
          if (retries > 0) {
            console.warn(`Fetch failed, retrying (${retries} left): ${error}`);
            return new Promise((resolve) =>
              setTimeout(() => resolve(utils.fetchWithRetry(url, retries - 1, delay)), delay)
            );
          }
          throw error;
        }),
    parseDurationToSeconds: (duration) => {
      if (!duration) return 0;
      const match = duration.match(/(\d+)m\s*(\d+)s/);
      if (!match) {
        console.warn(`Invalid duration format: ${duration}`);
        return 0;
      }
      const minutes = parseInt(match[1], 10) || 0;
      const seconds = parseInt(match[2], 10) || 0;
      return minutes * 60 + seconds;
    },
  };

  // YouTube Player
  const youtubeModule = {
    init: () => {
      window.onYouTubeIframeAPIReady = () => {
        player = new YT.Player('youtubeIframe', {
          height: '315',
          width: '560',
          playerVars: { autoplay: 1 },
          events: {
            onReady: (event) => event.target.playVideo(),
            onError: () => {
              elements.videoPopup.querySelector('.video-popup-content').innerHTML =
                '<p>Failed to load YouTube video</p>';
            },
          },
        });
      };
    },
  };

  // Audio Handling
  const audioModule = {
    fadeInAudio: (audio, targetVolume, duration) => {
      if (state.fadeInRequestId) cancelAnimationFrame(state.fadeInRequestId);
      audio.volume = 0;
      const startTime = performance.now();
      const step = (currentTime) => {
        const elapsed = Math.max(currentTime - startTime, 0);
        const progress = Math.min(elapsed / duration, 1);
        audio.volume = Math.max(0, Math.min(progress * targetVolume, 1));
        if (progress < 1) {
          state.fadeInRequestId = requestAnimationFrame(step);
        } else {
          audio.volume = targetVolume;
          state.fadeInRequestId = null;
        }
      };
      state.fadeInRequestId = requestAnimationFrame(step);
    },
    playPreview: (previewUrl) => {
      if (audio.src !== previewUrl) {
        audio.src = previewUrl;
        state.currentPreviewUrl = previewUrl;
        audio.load();
      }
      if (!state.isMuted && elements.videoPopup.style.display !== 'block') {
        audio
          .play()
          .then(() => {
            console.log('Audio playing:', previewUrl);
            if (state.fadeInAudioEnabled) {
              audioModule.fadeInAudio(audio, 0.25, 3000);
            } else {
              audio.volume = 0.25;
            }
          })
          .catch((error) => {
            console.error('Audio playback failed:', error);
            if (utils.isMobile()) {
              console.log('Mobile device detected; audio may require interaction');
            }
          });
      }
    },
    toggleMute: () => {
      state.isMuted = !state.isMuted;
      audio.muted = state.isMuted;
      localStorage.setItem('isMuted', state.isMuted);
      uiModule.updateMuteIcon();
      if (state.isMuted) {
        modalModule.stopGlowInterval();
      } else if (state.currentPreviewUrl && elements.videoPopup.style.display !== 'block') {
        audio
          .play()
          .then(() => {
            console.log('Audio unmuted:', state.currentPreviewUrl);
            if (state.fadeInAudioEnabled) {
              audioModule.fadeInAudio(audio, 0.25, 3000);
            } else {
              audio.volume = 0.25;
            }
          })
          .catch((error) => console.error('Audio playback failed:', error));
      }
    },
  };

  // Preload Assets
  const preloadModule = {
    preloadAssets: (tracks) => {
      if (!state.preloadAssetsEnabled) {
        console.log('Preload disabled; skipping');
        return;
      }
      elements.preloadIndicator?.classList.add('active');
      const maxPreload = 200;
      const tracksToPreload = tracks.slice(0, maxPreload);
      let loadedCount = 0;
      const totalAssets = tracksToPreload.reduce(
        (count, track) => count + (track.cover ? 1 : 0) + (track.videoUrl ? 1 : 0),
        0
      );
      if (totalAssets === 0) {
        console.log('No assets to preload');
        elements.preloadIndicator?.classList.remove('active');
        return;
      }
      const updateProgress = () => {
        const progressPercent = (loadedCount / totalAssets) * 100;
        if (elements.preloadProgress) {
          elements.preloadProgress.value = progressPercent;
          elements.preloadPercent.textContent = `${Math.round(progressPercent)}%`;
        }
        if (loadedCount >= totalAssets) {
          elements.preloadIndicator?.classList.remove('active');
        }
      };
      tracksToPreload.forEach((track) => {
        if (track.cover) {
          const img = new Image();
          img.src = track.cover;
          img.onload = () => {
            loadedCount++;
            updateProgress();
          };
          img.onerror = () => {
            console.error(`Failed to preload cover: ${track.cover}`);
            loadedCount++;
            updateProgress();
          };
        }
        if (track.videoUrl) {
          const video = document.createElement('video');
          video.src = `/assets/preview/${track.videoUrl}`;
          video.preload = 'auto';
          video.onloadeddata = () => {
            loadedCount++;
            updateProgress();
            video.remove();
          };
          video.onerror = () => {
            console.error(`Failed to preload video: ${track.videoUrl}`);
            loadedCount++;
            updateProgress();
            video.remove();
          };
          document.body.appendChild(video);
        }
      });
      setTimeout(() => {
        elements.preloadIndicator?.classList.remove('active');
        if (elements.preloadProgress) elements.preloadProgress.value = 0;
      }, 10000);
    },
  };

  // To-Do List
  const todoModule = {
    fetchTodoList: () =>
      utils
        .fetchWithRetry(`data/todoList.json?_=${Date.now()}`)
        .then((data) => {
          state.todoList = Array.isArray(data) ? data : [];
          console.log('Loaded to-do list:', state.todoList);
          uiModule.updateTodoListUI();
        })
        .catch((error) => {
          console.error('Failed to load to-do list:', error);
          state.todoList = [];
          uiModule.updateTodoListUI();
        }),
  };

  // UI Updates
  const uiModule = {
    updateMuteIcon: () => {
      const muteIcon = elements.muteButton.querySelector('.mute-icon');
      const unmuteIcon = elements.muteButton.querySelector('.unmute-icon');
      elements.muteButton.setAttribute('aria-pressed', state.isMuted);
      muteIcon.style.display = state.isMuted ? 'block' : 'none';
      unmuteIcon.style.display = state.isMuted ? 'none' : 'block';
    },
    updateSettingsUI: () => {
      const audioFadeItem = elements.settingsMenu.querySelector('li[data-setting="audio-fade"]');
      if (audioFadeItem) {
        audioFadeItem.textContent = `Fade In Audio: ${state.fadeInAudioEnabled ? 'On' : 'Off'}`;
        audioFadeItem.setAttribute('aria-checked', state.fadeInAudioEnabled);
      }
      const preloadItem = elements.settingsMenu.querySelector('li[data-setting="preload"]');
      if (preloadItem) {
        preloadItem.textContent = `Preload Assets: ${state.preloadAssetsEnabled ? 'On' : 'Off'}`;
        preloadItem.setAttribute('aria-checked', state.preloadAssetsEnabled);
      }
      const gridSizeItem = elements.settingsMenu.querySelector('li[data-setting="grid-size"]');
      if (gridSizeItem) {
        gridSizeItem.querySelectorAll('span').forEach((span) => span.classList.remove('active'));
        const activeSpan = gridSizeItem.querySelector(`span[data-grid-size="${state.gridSize}"]`);
        activeSpan?.classList.add('active');
        document.documentElement.style.setProperty('--grid-size', state.gridSize);
      }
    },
    updateTodoListUI: () => {
      if (!elements.todoList) {
        console.warn('To-do list element not found');
        return;
      }
      elements.todoList.classList.add('todo-list-loading');
      elements.todoList.innerHTML = '';
      if (state.todoList.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No tasks available';
        li.style.opacity = '0.7';
        elements.todoList.appendChild(li);
      } else {
        state.todoList.forEach((task) => {
          const li = document.createElement('li');
          li.className = task.completed ? 'completed' : '';
          li.innerHTML = `<span class="todo-text" aria-label="To-do task: ${task.text}${
            task.completed ? ', completed' : ''
          }">${task.text}</span>`;
          elements.todoList.appendChild(li);
        });
      }
      elements.todoList.classList.remove('todo-list-loading');
    },
    updateDownloadButton: (downloadUrl) => {
      state.currentDownloadUrl = downloadUrl || '';
      elements.downloadButton.disabled = !state.currentDownloadUrl.trim();
    },
  };

  // Modal Handling
  const modalModule = {
    openModal: (track) => {
      state.currentTrackIndex = state.currentFilteredTracks.findIndex(
        (t) => t.title === track.title && t.artist === track.artist
      );
      if (state.currentTrackIndex === -1) {
        console.error('Track not found in filtered tracks:', track);
        return;
      }
      modalModule.renderModal(track);
    },
    renderModal: (track) => {
      const { title, artist, releaseYear, cover, duration, complete, difficulties, bpm, createdAt, lastFeatured, previewUrl, download, videoUrl, videoPosition, key, youtubeLinks, loading_phrase, videoZoom, glowTimes } = track;
      const positionPercent = videoPosition ?? 50;
      const modalContent = elements.modal.querySelector('.modal-content');
      modalContent.querySelector('.modal-video')?.remove();
      modalContent.classList.remove('no-video');

      modalModule.stopGlowInterval();
      audio.removeEventListener('play', modalModule.handleAudioPlay);
      audio.removeEventListener('pause', modalModule.stopGlowInterval);

      let loadingPhraseElement = modalContent.querySelector('.modal-loading-phrase');
      if (!loadingPhraseElement) {
        loadingPhraseElement = document.createElement('div');
        loadingPhraseElement.classList.add('modal-loading-phrase');
        modalContent.appendChild(loadingPhraseElement);
      } else {
        loadingPhraseElement.classList.remove('glow');
      }
      loadingPhraseElement.innerHTML = `<p><strong></strong> ${loading_phrase || 'Not available'}</p>`;

      if (glowTimes && Array.isArray(glowTimes) && glowTimes.length > 0 && previewUrl) {
        const applyGlowEffect = () => {
          if (!audio.paused && !state.isMuted && elements.videoPopup.style.display !== 'block') {
            const currentTime = audio.currentTime % audio.duration;
            glowTimes.forEach((glowTime) => {
              if (Math.abs(currentTime - glowTime) < 0.1 && !loadingPhraseElement.classList.contains('glow')) {
                loadingPhraseElement.classList.add('glow');
                console.log(`Glow triggered at ${currentTime}s for ${glowTime}s`);
                const timeout = setTimeout(() => {
                  loadingPhraseElement.classList.remove('glow');
                }, 2000);
                modalModule.glowTimeouts.push(timeout);
              }
            });
          }
        };

        if (!audio.paused && !state.isMuted && elements.videoPopup.style.display !== 'block') {
          modalModule.startGlowInterval(applyGlowEffect);
        }

        modalModule.handleAudioPlay = () => {
          if (!state.isMuted && elements.videoPopup.style.display !== 'block') {
            modalModule.startGlowInterval(applyGlowEffect);
          }
        };
        audio.addEventListener('play', modalModule.handleAudioPlay);
        audio.addEventListener('pause', modalModule.stopGlowInterval);
      }

      if (previewUrl) audioModule.playPreview(previewUrl);

      let videoElement;
      if (videoUrl) {
        videoElement = document.createElement('video');
        videoElement.classList.add('modal-video');
        videoElement.autoplay = true;
        videoElement.muted = true;
        videoElement.loop = true;
        videoElement.innerHTML = `<source src="/assets/preview/${videoUrl}" type="video/mp4">`;
        videoElement.style.objectFit = 'cover';
        videoElement.style.objectPosition = `center ${positionPercent}%`;
        videoElement.style.transform = `scale(${videoZoom || 1})`;
        modalContent.insertBefore(videoElement, modalContent.firstChild);
        videoElement.onerror = () => {
          videoElement.remove();
          modalContent.classList.add('no-video');
        };
        videoElement.onloadeddata = () => videoElement.classList.add('loaded');
      }

      elements.modal.querySelector('#modalCover').src = cover;
      elements.modal.querySelector('#modalTitle').textContent = title;
      elements.modal.querySelector('#modalArtist').textContent = artist;
      elements.modal.querySelector('#modalDuration').textContent = `${releaseYear} | ${duration}`;
      elements.modal.querySelector('#modalDetails').innerHTML = `
        <div class="modal-details-row">
          <div class="modal-dates">
            <p><strong>Created At:</strong> ${new Date(createdAt).toLocaleString()}</p>
            <p><strong>Last Updated:</strong> ${lastFeatured || 'Not available'}</p>
          </div>
          <div class="modal-progress">
            <p><strong>Progress:</strong> ${complete}</p>
          </div>
        </div>
      `;
      trackModule.generateDifficultyBars(difficulties, elements.modal.querySelector('#modalDifficulties'));

      elements.modal.style.display = 'block';
      document.body.classList.add('modal-open');

      uiModule.updateDownloadButton(download);

      const prevButton = elements.modal.querySelector('.modal-prev');
      const nextButton = elements.modal.querySelector('.modal-next');
      prevButton.style.display = state.currentTrackIndex > 0 ? 'block' : 'none';
      nextButton.style.display = state.currentTrackIndex < state.currentFilteredTracks.length - 1 ? 'block' : 'none';

      const hasYouTubeLinks = youtubeLinks && Object.values(youtubeLinks).some((url) => url?.trim());
      elements.videoMenuButton.disabled = !hasYouTubeLinks;

      const menuItems = elements.videoMenu.querySelectorAll('li');
      menuItems.forEach((item) => {
        const instrument = item.getAttribute('data-instrument');
        const youtubeUrl = youtubeLinks?.[instrument];
        item.style.display = youtubeUrl ? 'block' : 'none';
        item.onclick = () => {
          if (youtubeUrl) {
            videoModule.openVideoPopup(track, youtubeUrl);
            elements.videoMenu.style.display = 'none';
            elements.videoMenuButton.setAttribute('aria-expanded', 'false');
          }
        };
      });
    },
    closeModal: () => {
      elements.modal.style.display = 'none';
      document.body.classList.remove('modal-open');
      audio.pause();
      audio.src = '';
      state.currentPreviewUrl = '';
      uiModule.updateDownloadButton('');
      modalModule.stopGlowInterval();
    },
    navigateModal: (direction) => {
      const newIndex = state.currentTrackIndex + direction;
      if (newIndex >= 0 && newIndex < state.currentFilteredTracks.length) {
        state.currentTrackIndex = newIndex;
        const newTrack = state.currentFilteredTracks[newIndex];
        if (newTrack) {
          modalModule.stopGlowInterval();
          modalModule.renderModal(newTrack);
        } else {
          console.error('No track found at index:', newIndex);
        }
      } else {
        console.warn('Cannot navigate: index out of bounds', newIndex);
      }
    },
    glowTimeouts: [],
    glowInterval: null,
    handleAudioPlay: null,
    startGlowInterval: (applyGlowEffect) => {
      if (!modalModule.glowInterval) {
        modalModule.glowInterval = setInterval(() => {
          applyGlowEffect();
        }, 100);
      }
    },
    stopGlowInterval: () => {
      if (modalModule.glowInterval) {
        clearInterval(modalModule.glowInterval);
        modalModule.glowInterval = null;
      }
      if (modalModule.glowTimeouts) {
        modalModule.glowTimeouts.forEach(clearTimeout);
        modalModule.glowTimeouts = [];
      }
      const loadingPhraseElement = elements.modal.querySelector('.modal-loading-phrase');
      if (loadingPhraseElement) {
        loadingPhraseElement.classList.remove('glow');
      }

      if (modalModule.handleAudioPlay) {
        audio.removeEventListener('play', modalModule.handleAudioPlay);
        modalModule.handleAudioPlay = null;
      }
      audio.removeEventListener('pause', modalModule.stopGlowInterval);
    },
  };

  // Video Popup
  const videoModule = {
    openVideoPopup: (track, youtubeUrl) => {
      state.currentTrack = track;
      const videoId = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?]+)/)?.[1];
      if (!audio.paused || state.currentPreviewUrl) {
        state.isMuted = true;
        audio.muted = true;
        audio.pause();
        localStorage.setItem('isMuted', true);
        uiModule.updateMuteIcon();
        modalModule.stopGlowInterval();
      }
      if (track.previewUrl && !state.currentPreviewUrl) {
        state.currentPreviewUrl = track.previewUrl;
      }
      elements.videoTrackCover.src = track.cover;
      elements.videoTrackTitle.textContent = track.title;
      elements.videoTrackArtist.textContent = track.artist;
      elements.videoTrackDuration.textContent = `${track.releaseYear} | ${track.duration}`;
      const selectedInstrument = Object.keys(track.youtubeLinks || {}).find(
        (instrument) => track.youtubeLinks[instrument] === youtubeUrl
      ) || 'vocals';
      videoModule.populateInstrumentList(track, selectedInstrument);

      if (videoId && player) {
        player.loadVideoById(videoId);
        player.mute();
        elements.videoPopup.style.display = 'block';
        document.body.classList.add('video-popup-open');
      } else if (videoId) {
        elements.youtubeIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
        elements.videoPopup.style.display = 'block';
        document.body.classList.add('video-popup-open');
      } else {
        console.error('Invalid YouTube URL:', youtubeUrl);
        elements.videoPopup.querySelector('.video-popup-content').innerHTML = '<p>Invalid YouTube video URL</p>';
        elements.instrumentList.innerHTML = '';
        elements.videoTrackCover.src = '';
      }
    },
    closeVideoPopup: () => {
      elements.videoPopup.style.display = 'none';
      document.body.classList.remove('video-popup-open');
      if (player) {
        try {
          player.stopVideo();
          player.clearVideo();
        } catch (error) {
          console.error('Player cleanup failed:', error);
        }
      }
      elements.youtubeIframe.src = '';
      elements.instrumentList.innerHTML = '';
      elements.videoTrackCover.src = '';
      elements.videoTrackTitle.textContent = '';
      elements.videoTrackArtist.textContent = '';
      elements.videoTrackDuration.textContent = '';
      if (state.currentPreviewUrl) {
        state.isMuted = false;
        audio.muted = false;
        localStorage.setItem('isMuted', false);
        uiModule.updateMuteIcon();
        audioModule.playPreview(state.currentPreviewUrl);
      }
      state.currentTrack = null;
    },
    populateInstrumentList: (track, selectedInstrument) => {
      elements.instrumentList.innerHTML = '';
      const instruments = ['vocals', 'lead', 'bass', 'drums'];
      instruments.forEach((instrument) => {
        if (track.youtubeLinks?.[instrument]) {
          const li = document.createElement('li');
          li.setAttribute('data-instrument', instrument);
          li.className = instrument === selectedInstrument ? 'active' : '';
          li.innerHTML = `<span class="instrument-icon ${instrument}"></span>${
            instrument.charAt(0).toUpperCase() + instrument.slice(1)
          }`;
          li.addEventListener('click', () => {
            elements.instrumentList.querySelectorAll('li').forEach((item) => item.classList.remove('active'));
            li.classList.add('active');
            const youtubeUrl = track.youtubeLinks[instrument];
            const videoId = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?]+)/)?.[1];
            if (videoId && player) {
              player.loadVideoById(videoId);
              player.mute();
            } else if (videoId) {
              elements.youtubeIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            }
          });
          elements.instrumentList.appendChild(li);
        }
      });
    },
  };

  // Track Rendering
  const trackModule = {
    renderTracks: (tracks, clearExisting = true) => {
      if (clearExisting) elements.content.innerHTML = '';
      tracks.forEach((track) => {
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
        trackElement.innerHTML = `<div><h2>${track.title}</h2><p>${track.artist}</p></div>`;
        trackElement.insertBefore(loadingSpinner, trackElement.firstChild);
        trackElement.insertBefore(img, trackElement.firstChild);
        trackElement.appendChild(trackModule.generateLabels(track));

        let touchTimer;
        trackElement.addEventListener(
          'touchstart',
          (e) => {
            e.preventDefault();
            if (utils.isMobile()) {
              touchTimer = setTimeout(() => modalModule.openModal(track), 500);
            } else {
              modalModule.openModal(track);
            }
          },
          { passive: false }
        );
        trackElement.addEventListener('touchend', (e) => {
          if (utils.isMobile()) {
            clearTimeout(touchTimer);
            trackElement.classList.toggle('mobile-highlight');
            if (track.previewUrl) audioModule.playPreview(track.previewUrl);
          }
        });
        trackElement.addEventListener('click', (e) => {
          if (!utils.isMobile()) modalModule.openModal(track);
        });

        elements.content.appendChild(trackElement);
        if (utils.isMobile()) {
          alert(`Selected: ${track.title} by ${track.artist}`);
        }
      });
    },
    filterTracks: () => {
      const query = elements.searchInput.value.toLowerCase().trim();
      const filterValue = elements.filterSelect.value;
      const sortValue = elements.sortSelect.value;

      let sortBy = null;
      let sortOrder = 'desc'; 
      if (sortValue !== 'default') {
        [sortBy, sortOrder = 'desc'] = sortValue.split(':');
      }

      // Filter tracks
      let filteredTracks = state.tracksData.filter(
        (track) =>
          (track.title.toLowerCase().includes(query) || track.artist.toLowerCase().includes(query)) &&
          (filterValue === 'all' ||
            (filterValue === 'featured' && track.featured) ||
            (filterValue === 'rotated' && track.rotated) ||
            (filterValue === 'new' && track.new) ||
            (filterValue === 'finish' && track.finish))
      );

      // Sort tracks
      filteredTracks.sort((a, b) => {
        if (sortBy === 'year') {
          const aYear = a.releaseYear || 0;
          const bYear = b.releaseYear || 0;
          return sortOrder === 'asc' ? aYear - bYear : bYear - aYear;
        } else if (sortBy === 'length') {
          const aSeconds = utils.parseDurationToSeconds(a.duration);
          const bSeconds = utils.parseDurationToSeconds(b.duration);
          return sortOrder === 'asc' ? aSeconds - bSeconds : bSeconds - aSeconds;
        } else {
          if (filterValue === 'rotated') {
            return new Date(b.lastFeatured) - new Date(a.lastFeatured);
          }
          if (filterValue === 'new' || filterValue === 'finish') {
            return new Date(b.createdAt) - new Date(a.createdAt);
          }
          if (a.featured && !b.featured) return -1;
          if (!a.featured && b.featured) return 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
      });

      state.currentFilteredTracks = filteredTracks;
      elements.trackCount.textContent =
        query || filterValue !== 'all' || sortValue !== 'default'
          ? `Found: ${filteredTracks.length}${sortBy ? ` (Sorted by ${sortBy})` : ''}`
          : `Total: ${state.tracksData.length}`;
      state.loadedTracks = 0;

      if (query || filterValue !== 'all' || sortValue !== 'default') {
        trackModule.renderTracks(filteredTracks);
      } else {
        trackModule.renderTracks(filteredTracks.slice(0, state.initialLoad));
        if (filteredTracks.length > state.initialLoad) {
          state.loadedTracks = state.initialLoad;
          trackModule.setupInfiniteScroll(filteredTracks);
        }
      }
      if (state.preloadAssetsEnabled) preloadModule.preloadAssets(filteredTracks);

      // Update URL parameters
      const url = new URL(window.location);
      if (query) url.searchParams.set('q', query);
      else url.searchParams.delete('q');
      if (filterValue !== 'all') url.searchParams.set('filter', filterValue);
      else url.searchParams.delete('filter');
      if (sortValue !== 'default') url.searchParams.set('sort', sortValue);
      else url.searchParams.delete('sort');
      window.history.replaceState({}, '', url);
    },
    setupInfiniteScroll: (tracks) => {
      if (intersectionObserver) intersectionObserver.disconnect();
      const sentinel = document.createElement('div');
      sentinel.className = 'sentinel';
      sentinel.style.height = '1px';
      elements.content.appendChild(sentinel);
      intersectionObserver = new IntersectionObserver((entries) => {
        if (
          entries[0].isIntersecting &&
          elements.filterSelect.value === 'all' &&
          !elements.searchInput.value &&
          elements.sortSelect.value === 'default' &&
          state.loadedTracks < tracks.length
        ) {
          intersectionObserver.unobserve(entries[0].target);
          const nextBatch = tracks.slice(state.loadedTracks, state.loadedTracks + state.tracksPerPage);
          trackModule.renderTracks(nextBatch, false);
          state.loadedTracks += state.tracksPerPage;
          if (state.loadedTracks < tracks.length) {
            const newSentinel = document.createElement('div');
            newSentinel.className = 'sentinel';
            newSentinel.style.height = '1px';
            elements.content.appendChild(newSentinel);
            intersectionObserver.observe(newSentinel);
          }
        }
      });
      intersectionObserver.observe(sentinel);
    },
    generateDifficultyBars: (difficulties, container) => {
      container.innerHTML = '';
      const maxBars = 7;
      const excludedInstruments = ['plastic-guitar', 'plastic-drums', 'plastic-bass'];
      Object.entries(difficulties).forEach(([instrument, level]) => {
        if (!excludedInstruments.includes(instrument)) {
          const difficultyElement = document.createElement('div');
          difficultyElement.classList.add('difficulty');
          let barsHTML = '';
          for (let i = 1; i <= maxBars; i++) {
            barsHTML += `<div class="difficulty-bar"><span class="${i <= level + 1 ? 'active' : ''}"></span></div>`;
          }
          difficultyElement.innerHTML = `
            <div class="instrument-icon ${instrument}"></div>
            <div class="difficulty-bars">${barsHTML}</div>
          `;
          container.appendChild(difficultyElement);
        }
      });
    },
    generateLabels: (track) => {
      const labelContainer = document.createElement('div');
      labelContainer.classList.add('label-container');
      const labels = [
        { condition: track.new, class: 'new-label' },
        { condition: track.finish, class: 'finish-label' },
        { condition: track.featured, class: 'featured-label' },
      ];
      labels.forEach(({ condition, class: className }) => {
        if (condition) {
          const label = document.createElement('span');
          label.classList.add(className);
          label.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"></svg>';
          labelContainer.appendChild(label);
        }
      });
      return labelContainer;
    },
  };

  // Settings Menu
  const settingsModule = {
    toggleSettingsMenu: () => {
      const isOpen = elements.settingsMenu.style.display === 'block';
      elements.settingsMenu.style.display = isOpen ? 'none' : 'block';
      elements.settingsButton.setAttribute('aria-expanded', !isOpen);
    },
    handleSettingsMenuClick: () => {
      elements.settingsMenu.querySelectorAll('li').forEach((item) => {
        item.onclick = (e) => {
          const setting = item.getAttribute('data-setting');
          if (setting === 'audio-fade') {
            state.fadeInAudioEnabled = !state.fadeInAudioEnabled;
            localStorage.setItem('fadeInAudioEnabled', state.fadeInAudioEnabled);
            uiModule.updateSettingsUI();
          } else if (setting === 'grid-size') {
            const gridSizeSpan = e.target.closest('span[data-grid-size]');
            if (gridSizeSpan) {
              state.gridSize = gridSizeSpan.getAttribute('data-grid-size');
              localStorage.setItem('gridSize', state.gridSize);
              uiModule.updateSettingsUI();
            }
          } else if (setting === 'preload') {
            state.preloadAssetsEnabled = !state.preloadAssetsEnabled;
            localStorage.setItem('preloadAssetsEnabled', state.preloadAssetsEnabled);
            uiModule.updateSettingsUI();
            if (state.preloadAssetsEnabled) preloadModule.preloadAssets(state.currentFilteredTracks);
          } else if (setting === 'todo') {
            e.stopPropagation();
            todoModule.fetchTodoList();
            return;
          } else if (setting === 'reset') {
            localStorage.clear();
            location.reload();
          }
          settingsModule.toggleSettingsMenu();
        };
      });
    },
  };

  // Countdown
  const countdownModule = {
    updateCountdown: () => {
      const now = new Date();
      const nextUpdate = new Date();
      nextUpdate.setUTCHours(0, 0, 0, 0);
      const updateStart = new Date(nextUpdate);
      const updateEnd = new Date(nextUpdate);
      updateEnd.setUTCMinutes(2);
      if (now >= updateStart && now <= updateEnd) {
        elements.countdown.textContent = '';
        state.sawUpdateMessage = true;
        return;
      }
      if (state.sawUpdateMessage && now > updateEnd) {
        window.location.reload();
        return;
      }
      if (now > updateEnd) {
        state.sawUpdateMessage = false;
        nextUpdate.setUTCDate(nextUpdate.getUTCDate() + 1);
      }
      elements.countdown.textContent = `Last Updated - 04/21/25`;
    },
  };

  // Modal Events
  const eventModule = {
    init: () => {
      elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) modalModule.closeModal();
      });
      elements.modal.querySelector('.modal-close').addEventListener('click', modalModule.closeModal);
      elements.modal.querySelector('.modal-prev').addEventListener('click', () => modalModule.navigateModal(-1));
      elements.modal.querySelector('.modal-next').addEventListener('click', () => modalModule.navigateModal(1));
      document.addEventListener('keydown', (e) => {
        if (elements.modal.style.display === 'block') {
          switch (e.key) {
            case 'ArrowLeft':
              modalModule.navigateModal(-1);
              break;
            case 'ArrowRight':
              modalModule.navigateModal(1);
              break;
            case 'Escape':
              modalModule.closeModal();
              break;
            case 'm':
              audioModule.toggleMute();
              break;
          }
        }
        if (elements.settingsMenu.style.display === 'block' && e.key === 'Escape') {
          settingsModule.toggleSettingsMenu();
          elements.settingsButton.focus();
        }
        if (elements.videoPopup.style.display === 'block' && e.key === 'Escape') {
          videoModule.closeVideoPopup();
          state.isMuted = false;
          audio.muted = false;
          uiModule.updateMuteIcon();
        }
      });

      // Header Events
      elements.logo.addEventListener('click', () => (window.location.href = '/'));
      elements.searchInput.addEventListener('input', utils.debounce(trackModule.filterTracks, 300));
      elements.filterSelect.addEventListener('change', trackModule.filterTracks);
      elements.sortSelect.addEventListener('change', trackModule.filterTracks); // Kept
      elements.muteButton.addEventListener('click', audioModule.toggleMute);
      elements.downloadButton.addEventListener('click', () => {
        if (state.currentDownloadUrl) window.location.href = state.currentDownloadUrl;
      });
      elements.settingsButton.addEventListener('click', settingsModule.toggleSettingsMenu);
      elements.settingsButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          settingsModule.toggleSettingsMenu();
        }
      });
      elements.settingsMenu.addEventListener('keydown', (e) => {
        const items = elements.settingsMenu.querySelectorAll('li');
        const current = document.activeElement;
        const index = Array.from(items).indexOf(current);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          items[(index + 1) % items.length].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          items[(index - 1 + items.length) % items.length].focus();
        } else if (e.key === 'Escape') {
          settingsModule.toggleSettingsMenu();
          elements.settingsButton.focus();
        }
      });
      elements.videoMenuButton.addEventListener('click', () => {
        const isOpen = elements.videoMenu.style.display === 'block';
        elements.videoMenu.style.display = isOpen ? 'none' : 'block';
        elements.videoMenuButton.setAttribute('aria-expanded', !isOpen);
      });
      elements.videoPopupClose.addEventListener('click', videoModule.closeVideoPopup);
      elements.videoPopup.addEventListener('click', (e) => {
        if (e.target === elements.videoPopup) videoModule.closeVideoPopup();
      });
      elements.instrumentList.addEventListener('keydown', (e) => {
        const items = elements.instrumentList.querySelectorAll('li');
        const current = document.activeElement;
        const index = Array.from(items).indexOf(current);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          items[(index + 1) % items.length].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          items[(index - 1 + items.length) % items.length].focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          current.click();
        }
      });
      document.addEventListener('click', (e) => {
        if (!elements.settingsButton.contains(e.target) && !elements.settingsMenu.contains(e.target)) {
          elements.settingsMenu.style.display = 'none';
          elements.settingsButton.setAttribute('aria-expanded', 'false');
        }
        if (!elements.videoMenuButton.contains(e.target) && !elements.videoMenu.contains(e.target)) {
          elements.videoMenu.style.display = 'none';
          elements.videoMenuButton.setAttribute('aria-expanded', 'false');
        }
      });
    },
  };

  // Initialization
  const init = () => {
    youtubeModule.init();
    settingsModule.handleSettingsMenuClick();
    eventModule.init();
    uiModule.updateSettingsUI();
    todoModule.fetchTodoList();
    setInterval(countdownModule.updateCountdown, 1000);
    countdownModule.updateCountdown();
    utils
      .fetchWithRetry(`data/tracks.json?_=${Date.now()}`)
      .then((data) => {
        state.tracksData = Object.values(data);
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('q')) elements.searchInput.value = urlParams.get('q');
        if (urlParams.get('filter')) elements.filterSelect.value = urlParams.get('filter');
        if (urlParams.get('sort')) elements.sortSelect.value = urlParams.get('sort');
        trackModule.filterTracks();
      })
      .catch((error) => {
        console.error('Failed to load tracks:', error);
        elements.content.innerHTML = '<p>Error loading tracks. Please try again later.</p>';
      });

    window.addEventListener('unload', () => {
      if (intersectionObserver) intersectionObserver.disconnect();
      if (player) player.destroy();
    });
  };

  init();
});