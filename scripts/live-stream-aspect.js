(function () {
  'use strict';

  // Match only clearly ultrawide video. Standard and portrait streams keep the
  // existing player sizing and theater layout.
  var MIN_ULTRAWIDE_RATIO = 1.9;
  var MAX_ULTRAWIDE_RATIO = 3.5;
  var ASPECT_CLASS = 'sifaka-ultrawide-stream';
  var ASPECT_PROPERTY = '--sifaka-live-aspect-ratio';
  var frameByVideo = new WeakMap();

  function getFrame(video) {
    if (!video || video.tagName !== 'VIDEO') return null;
    return video.closest('.mini-player') ||
      video.closest('#videoPage .player-wrap, .profile-live-player, .hero-player');
  }

  function clearFrame(frame) {
    if (!frame) return;
    frame.classList.remove(ASPECT_CLASS);
    frame.style.removeProperty(ASPECT_PROPERTY);

    if (frame.matches('#videoPage .player-wrap')) {
      var layout = frame.closest('.video-layout');
      if (layout && !layout.querySelector('.player-wrap.' + ASPECT_CLASS)) {
        layout.classList.remove(ASPECT_CLASS);
      }
    }
  }

  function syncVideo(video) {
    var frame = getFrame(video);
    if (!frame) return;
    frameByVideo.set(video, frame);

    var width = video.videoWidth;
    var height = video.videoHeight;
    if (!width || !height) return;

    var ratio = width / height;
    if (ratio < MIN_ULTRAWIDE_RATIO || ratio > MAX_ULTRAWIDE_RATIO) {
      clearFrame(frame);
      return;
    }

    frame.style.setProperty(ASPECT_PROPERTY, width + ' / ' + height);
    frame.classList.add(ASPECT_CLASS);

    if (frame.matches('#videoPage .player-wrap')) {
      var layout = frame.closest('.video-layout');
      if (layout) layout.classList.add(ASPECT_CLASS);
    }
  }

  function resetVideo(video) {
    if (!video || video.tagName !== 'VIDEO') return;
    clearFrame(frameByVideo.get(video) || getFrame(video));
  }

  function visitVideos(node, callback) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'VIDEO') callback(node);
    if (typeof node.querySelectorAll === 'function') {
      node.querySelectorAll('video').forEach(callback);
    }
  }

  document.addEventListener('loadedmetadata', function (event) {
    syncVideo(event.target);
  }, true);

  document.addEventListener('resize', function (event) {
    syncVideo(event.target);
  }, true);

  document.addEventListener('loadstart', function (event) {
    resetVideo(event.target);
  }, true);

  document.querySelectorAll('video').forEach(syncVideo);

  if (document.documentElement && window.MutationObserver) {
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.removedNodes.forEach(function (node) {
          visitVideos(node, function (video) {
            var frame = frameByVideo.get(video);
            if (frame && !frame.querySelector('video')) clearFrame(frame);
            frameByVideo.delete(video);
          });
        });

        record.addedNodes.forEach(function (node) {
          visitVideos(node, syncVideo);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
