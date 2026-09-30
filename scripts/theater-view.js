(function () {
  const ns = window.SifakaPageViews = window.SifakaPageViews || {};

  ns.showTheaterLayout = function showTheaterLayout(ctx = {}) {
    const routeMode = (ctx.opts && ctx.opts.routeMode) || 'replace';
    const qs = ctx.qs || ((sel, p) => (p || document).querySelector(sel));
    const home = qs('#homePage');
    const video = qs('#videoPage');
    const profile = qs('#profilePage');
    const videos = qs('#videosPage');
    const feed = qs('#feedPage');
    const notifications = qs('#notificationsPage');
    const communities = qs('#communitiesPage');
    const messages = qs('#messagesPage');
    const faq = qs('#faqPage');

    const state = ctx.state || {};
    const selected = state.selectedStreamAddress && state.streamsByAddress && state.streamsByAddress.get(state.selectedStreamAddress);

    if (typeof ctx.setActiveViewerAddress === 'function') {
      ctx.setActiveViewerAddress(selected ? selected.address : '');
    }
    if (selected && routeMode !== 'skip' && typeof ctx.syncTheaterRoute === 'function') {
      ctx.syncTheaterRoute(selected, routeMode);
    }

    if (home) home.classList.remove('active');
    if (video) video.style.display = 'block';
    if (profile) profile.style.display = 'none';
    if (videos) videos.style.display = 'none';
    if (feed) feed.style.display = 'none';
    if (notifications) notifications.style.display = 'none';
    if (communities) communities.style.display = 'none';
    if (messages) messages.style.display = 'none';
    if (faq) faq.style.display = 'none';

    if (typeof ctx.stopHeroCycle === 'function') ctx.stopHeroCycle();
    if (typeof ctx.stopAllAudio === 'function') ctx.stopAllAudio('theater');
    if (typeof ctx.renderRecoStreams === 'function') ctx.renderRecoStreams();

    // The theater layout is mounted separately from the main app router.
    // Re-initialize the selected stream player after the layout is visible;
    // otherwise navigation destroys the Live Now player but nothing starts
    // the replacement HLS/video element in theater mode.
    if (selected && typeof ctx.renderVideoPlayback === 'function') {
      Promise.resolve(ctx.renderVideoPlayback(selected)).catch(() => {});
    }

    if (state.settings && state.settings.miniPlayer && state.selectedStreamAddress) {
      if (typeof ctx.showMini === 'function') ctx.showMini();
    } else if (typeof ctx.hideMini === 'function') {
      ctx.hideMini();
    }

    if (typeof ctx.scrollToTop === 'function') ctx.scrollToTop();
  };
})();

