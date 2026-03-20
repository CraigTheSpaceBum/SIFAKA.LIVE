(function () {
  const CONFIG_STORAGE_KEY = 'sifaka_gif_config_v1';
  const DEFAULT_LIMIT = 24;
  const MAX_LIMIT = 50;
  const DEFAULT_GIPHY_API_KEY = 'dc6zaTOxFJmzC';

  function safeTrim(value) {
    return String(value == null ? '' : value).trim();
  }

  function safeUrl(value) {
    const clean = safeTrim(value);
    if (!clean) return '';
    if (!/^https?:\/\//i.test(clean)) return '';
    return clean;
  }

  function safeInt(value, fallback = DEFAULT_LIMIT) {
    const n = Number.parseInt(String(value == null ? '' : value), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.min(MAX_LIMIT, n));
  }

  function safeOffset(value) {
    const n = Number.parseInt(String(value == null ? '' : value), 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  function parseDimension(value) {
    const n = Number.parseInt(String(value == null ? '' : value), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function readRuntimeConfig() {
    let localConfig = {};
    try {
      const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      localConfig = raw ? JSON.parse(raw) : {};
    } catch (_) {
      localConfig = {};
    }

    const globalConfig = (window.__SIFAKA_GIF_CONFIG && typeof window.__SIFAKA_GIF_CONFIG === 'object')
      ? window.__SIFAKA_GIF_CONFIG
      : {};
    const merged = { ...localConfig, ...globalConfig };

    return {
      provider: safeTrim(merged.provider || 'giphy').toLowerCase(),
      apiKey: safeTrim(merged.apiKey || merged.giphyApiKey || DEFAULT_GIPHY_API_KEY),
      rating: safeTrim(merged.rating || 'pg-13').toLowerCase(),
      lang: safeTrim(merged.lang || 'en'),
      bundle: safeTrim(merged.bundle || ''),
      searchLimit: safeInt(merged.searchLimit, DEFAULT_LIMIT)
    };
  }

  function resolveGiphyMedia(item) {
    const images = (item && item.images && typeof item.images === 'object') ? item.images : {};
    const preferredOriginal = images.original || null;
    const preferredDownsized = images.downsized_large || images.downsized || null;
    const preferredFixed = images.fixed_width_downsampled || images.fixed_width || null;
    const preview = images.fixed_width_still || images.preview_gif || preferredFixed || null;

    const fullUrl = safeUrl(
      (preferredOriginal && preferredOriginal.url)
      || (preferredDownsized && preferredDownsized.url)
      || (preferredFixed && preferredFixed.url)
      || (preview && preview.url)
    );
    if (!fullUrl) return null;

    const previewUrl = safeUrl((preview && preview.url) || fullUrl) || fullUrl;
    const width = parseDimension(
      (preferredOriginal && preferredOriginal.width)
      || (preferredDownsized && preferredDownsized.width)
      || (preferredFixed && preferredFixed.width)
      || (preview && preview.width)
    );
    const height = parseDimension(
      (preferredOriginal && preferredOriginal.height)
      || (preferredDownsized && preferredDownsized.height)
      || (preferredFixed && preferredFixed.height)
      || (preview && preview.height)
    );

    return {
      url: fullUrl,
      previewUrl,
      width,
      height
    };
  }

  function mapGiphyItems(payload) {
    const list = Array.isArray(payload && payload.data) ? payload.data : [];
    return list
      .map((item) => {
        const media = resolveGiphyMedia(item);
        if (!media) return null;
        return {
          id: safeTrim(item && item.id),
          title: safeTrim(item && (item.title || item.slug || 'GIF')),
          url: media.url,
          previewUrl: media.previewUrl,
          width: media.width,
          height: media.height,
          provider: 'giphy',
          pageUrl: safeUrl(item && item.url)
        };
      })
      .filter(Boolean);
  }

  function normalizeGiphyResponse(payload) {
    const pagination = (payload && payload.pagination && typeof payload.pagination === 'object')
      ? payload.pagination
      : {};
    const offset = safeOffset(pagination.offset);
    const count = safeOffset(pagination.count);
    const totalCount = safeOffset(pagination.total_count);
    const nextOffset = offset + count;
    const cursor = (count > 0 && nextOffset < totalCount) ? String(nextOffset) : '';
    return {
      items: mapGiphyItems(payload),
      cursor
    };
  }

  async function giphyRequest(endpoint, params, cfg) {
    const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`);
    Object.entries(params || {}).forEach(([key, value]) => {
      const clean = safeTrim(value);
      if (!clean) return;
      url.searchParams.set(key, clean);
    });
    const response = await fetch(url.toString(), { method: 'GET', credentials: 'omit' });
    if (!response.ok) {
      throw new Error(`Giphy request failed (${response.status}).`);
    }
    const payload = await response.json();
    const metaStatus = Number(payload && payload.meta && payload.meta.status);
    if (Number.isFinite(metaStatus) && metaStatus >= 400) {
      const message = safeTrim(payload && payload.meta && payload.meta.msg) || `Giphy request failed (${metaStatus}).`;
      throw new Error(message);
    }
    return normalizeGiphyResponse(payload);
  }

  async function giphySearch(input = {}) {
    const cfg = readRuntimeConfig();
    const query = safeTrim(input.query || '');
    const limit = safeInt(input.limit, cfg.searchLimit);
    if (!query) return giphyTrending({ limit, cursor: input.cursor });

    return giphyRequest('search', {
      api_key: cfg.apiKey,
      q: query,
      limit: String(limit),
      offset: String(safeOffset(input.cursor)),
      rating: cfg.rating,
      lang: cfg.lang,
      bundle: cfg.bundle
    }, cfg);
  }

  async function giphyTrending(input = {}) {
    const cfg = readRuntimeConfig();
    const limit = safeInt(input.limit, cfg.searchLimit);
    return giphyRequest('trending', {
      api_key: cfg.apiKey,
      limit: String(limit),
      offset: String(safeOffset(input.cursor)),
      rating: cfg.rating,
      bundle: cfg.bundle
    }, cfg);
  }

  function getProviderInfo() {
    const cfg = readRuntimeConfig();
    return {
      provider: cfg.provider,
      hasApiKey: !!cfg.apiKey
    };
  }

  window.SifakaGifProvider = {
    hasConfiguration() {
      const cfg = readRuntimeConfig();
      return !!cfg.apiKey;
    },
    getProviderInfo,
    async search(input = {}) {
      const cfg = readRuntimeConfig();
      if (cfg.provider !== 'giphy') throw new Error(`Unsupported GIF provider: ${cfg.provider}`);
      return giphySearch(input);
    },
    async trending(input = {}) {
      const cfg = readRuntimeConfig();
      if (cfg.provider !== 'giphy') throw new Error(`Unsupported GIF provider: ${cfg.provider}`);
      return giphyTrending(input);
    }
  };
})();
