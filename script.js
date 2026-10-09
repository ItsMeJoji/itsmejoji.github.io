import './style.css';

(function () {
  'use strict';

  // Configuration
  const CONFIG = {
    channelId: 'UCD5fHVkHuM2M_H2Fg0gqPPA',
    channelUrl: 'https://www.youtube.com/@ItsMeJoji',
    twitchCheckChannel: 'itsmejoji',
    twitchChannelUrl: 'https://www.twitch.tv/itsmejoji',
    fallbackVideo: {
      id: 'hMZa0HVnPS4',
      title: "I'm Starting my Final Ribbon Master Journey | Pokemon Bank Rescue Quest Episode 1",
      link: 'https://www.youtube.com/watch?v=hMZa0HVnPS4',
      pubDate: 'Oct 6, 2026'
    }
  };

  // DOM Elements
  const els = {
    avatarWrapper: document.getElementById('avatar-wrapper'),
    avatarLivePill: document.getElementById('avatar-live-pill'),
    ytPlayer: document.getElementById('latest-yt-player'),
    ytTitle: document.getElementById('latest-yt-title'),
    ytDate: document.getElementById('latest-yt-date'),
    shareBtn: document.getElementById('share-btn'),
    toast: document.getElementById('toast')
  };

  /**
   * Format date string to readable format
   */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  /**
   * Extract YouTube video ID from various link formats
   */
  function extractVideoId(url, guid) {
    if (guid && guid.startsWith('yt:video:')) {
      return guid.replace('yt:video:', '');
    }
    if (url) {
      const match = url.match(/(?:watch\?v=|v\/|embed\/|youtu\.be\/)([\w-]{11})/);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  /**
   * Update the UI with video information
   */
  function updateVideoEmbed(video) {
    if (!video || !video.id) return;

    if (els.ytPlayer) {
      const currentSrc = els.ytPlayer.getAttribute('src');
      const targetSrc = `https://www.youtube.com/embed/${video.id}`;
      if (currentSrc !== targetSrc) {
        els.ytPlayer.src = targetSrc;
      }
    }

    if (els.ytTitle) {
      els.ytTitle.textContent = video.title || 'Latest YouTube Video';
      els.ytTitle.href = video.link || `https://www.youtube.com/watch?v=${video.id}`;
    }

    if (els.ytDate && video.pubDate) {
      els.ytDate.textContent = formatDate(video.pubDate);
    }
  }

  /**
   * Fetch latest non-short video using public RSS-to-JSON service
   */
  async function fetchViaRss2Json() {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CONFIG.channelId}`;
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;

    const response = await fetch(apiUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data.status !== 'ok' || !Array.isArray(data.items)) {
      throw new Error('Invalid feed structure');
    }

    // Filter out items that are YouTube Shorts
    const nonShorts = data.items.filter(item => {
      const link = (item.link || '').toLowerCase();
      const guid = (item.guid || '').toLowerCase();
      const title = (item.title || '').toLowerCase();

      // Check URL and title flags
      const isShortUrl = link.includes('/shorts/');
      const hasShortTag = title.includes('#shorts') || title.includes('#short');
      return !isShortUrl && !hasShortTag;
    });

    if (nonShorts.length === 0) {
      throw new Error('No non-short videos found in feed');
    }

    const latest = nonShorts[0];
    const videoId = extractVideoId(latest.link, latest.guid);

    if (!videoId) throw new Error('Unable to parse video ID');

    return {
      id: videoId,
      title: latest.title,
      link: latest.link,
      pubDate: latest.pubDate
    };
  }

  /**
   * Fallback fetch using CORS proxy & DOMParser
   */
  async function fetchViaAllOrigins() {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CONFIG.channelId}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Proxy HTTP ${response.status}`);
    const xmlText = await response.text();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const entries = Array.from(xmlDoc.querySelectorAll('entry'));

    for (const entry of entries) {
      const linkElem = entry.querySelector('link[rel="alternate"]');
      const href = linkElem ? linkElem.getAttribute('href') : '';
      const titleElem = entry.querySelector('title');
      const title = titleElem ? titleElem.textContent : '';
      const publishedElem = entry.querySelector('published');
      const pubDate = publishedElem ? publishedElem.textContent : '';
      const videoIdElem = entry.querySelector('videoId') || entry.querySelector('yt\\:videoId');
      const videoId = videoIdElem ? videoIdElem.textContent : extractVideoId(href);

      // Skip shorts
      if (href.includes('/shorts/') || title.toLowerCase().includes('#shorts')) {
        continue;
      }

      if (videoId) {
        return {
          id: videoId,
          title: title,
          link: href || `https://www.youtube.com/watch?v=${videoId}`,
          pubDate: pubDate
        };
      }
    }

    throw new Error('No valid non-short video found via proxy');
  }

  /**
   * Main loader function trying primary and fallback providers
   */
  async function loadLatestVideo() {
    try {
      const video = await fetchViaRss2Json();
      updateVideoEmbed(video);
    } catch (err1) {
      console.warn('Primary YouTube feed fetch failed, trying secondary proxy:', err1);
      try {
        const video = await fetchViaAllOrigins();
        updateVideoEmbed(video);
      } catch (err2) {
        console.warn('Secondary proxy failed, using default video:', err2);
        updateVideoEmbed(CONFIG.fallbackVideo);
        if (els.ytStatus) {
          els.ytStatus.textContent = 'Featured upload';
        }
      }
    }
  }

  /**
   * Show toast notification
   */
  let toastTimer = null;
  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('show');
    }, 2500);
  }

  /**
   * Setup share button
   */
  function setupShare() {
    if (!els.shareBtn) return;
    els.shareBtn.addEventListener('click', async () => {
      const shareData = {
        title: 'ItsMeJoji - Links & Socials',
        text: 'Check out ItsMeJoji: Pokemon streamer, videos, and links!',
        url: window.location.href
      };

      if (navigator.share && /mobile|android|iphone/i.test(navigator.userAgent)) {
        try {
          await navigator.share(shareData);
          return;
        } catch {
          // Fall back to clipboard if dismissed or denied
        }
      }

      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Link copied to clipboard!');
      } catch {
        showToast('Page URL: ' + window.location.href);
      }
    });
  }

  /**
   * Check if Twitch channel is live using Twitch public GraphQL endpoint
   */
  async function checkTwitchLiveStatus() {
    // Immediate query param override for testing: ?live=true or ?live=false
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('live')) {
      return urlParams.get('live') === 'true';
    }

    const channel = CONFIG.twitchCheckChannel;
    if (!channel) return false;

    try {
      const response = await fetch('https://gql.twitch.tv/gql', {
        method: 'POST',
        headers: {
          'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: `query { user(login: "${channel.toLowerCase()}") { stream { id type } } }`
        })
      });

      if (!response.ok) return false;
      const data = await response.json();
      const stream = data?.data?.user?.stream;
      return stream !== null && stream?.type === 'live';
    } catch (err) {
      console.warn('Twitch live check failed:', err);
      return false;
    }
  }

  /**
   * Update Profile Circle and Live Pill state based on Twitch status
   */
  async function initTwitchLiveStatus() {
    const isLive = await checkTwitchLiveStatus();

    if (els.avatarWrapper) {
      if (isLive) {
        els.avatarWrapper.classList.add('is-live');
      } else {
        els.avatarWrapper.classList.remove('is-live');
      }
    }

    if (els.avatarLivePill) {
      if (isLive) {
        els.avatarLivePill.style.display = 'inline-flex';
        els.avatarLivePill.href = CONFIG.twitchChannelUrl;
      } else {
        els.avatarLivePill.style.display = 'none';
      }
    }
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    setupShare();
    loadLatestVideo();
    initTwitchLiveStatus();

    // Re-check periodically and on tab focus
    setInterval(initTwitchLiveStatus, 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        initTwitchLiveStatus();
      }
    });
  });
})();
