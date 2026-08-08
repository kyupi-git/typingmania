import {
  BANGUMI_API_ROUTES,
  BANGUMI_IMAGE_ROUTES,
  BANGUMI_WEBSITE_ROUTES,
} from './bangumi-routes.js'

const freezeRoutes = routes => Object.freeze(
  routes.map(route => Object.freeze(route)),
)

export const NETEASE_API_ROUTES = freezeRoutes([
  {
    id: 'netease-api-main',
    name: 'NetEase Cloud Music API',
    baseUrl: 'https://music.163.com',
    priority: 48,
    regionalPriority: { cn: 70, hk: 42, tw: 18, sea: 12, global: -5 },
  },
  {
    id: 'netease-api-interface',
    name: 'NetEase Cloud Music API (interface)',
    baseUrl: 'https://interface.music.163.com',
    priority: 44,
    regionalPriority: { cn: 66, hk: 38, tw: 14, sea: 10, global: -8 },
  },
])

export const LRCLIB_API_ROUTES = freezeRoutes([
  {
    id: 'lrclib-api',
    name: 'LRCLIB API',
    baseUrl: 'https://lrclib.net',
    priority: 32,
    regionalPriority: { us: 28, eu: 32, global: 25, cn: -12 },
  },
  {
    id: 'lrclib-api-www',
    name: 'LRCLIB API (www)',
    baseUrl: 'https://www.lrclib.net',
    priority: 29,
    regionalPriority: { us: 26, eu: 30, global: 22, cn: -14 },
  },
])

// MusicBrainz does not operate a hosted public mirror. The release therefore
// uses its official production Web Service and independently falls back to
// other music catalogs.
export const MUSICBRAINZ_API_ROUTES = freezeRoutes([
  {
    id: 'musicbrainz-api',
    name: 'MusicBrainz Web Service',
    baseUrl: 'https://musicbrainz.org',
    priority: 34,
    regionalPriority: { us: 35, eu: 42, jp: 18, global: 28, cn: -18 },
  },
])

export const NETWORK_ROUTE_CATALOG = freezeRoutes([
  {
    id: 'qqmusic-catalog',
    name: 'QQ Music catalog',
    category: 'music',
    url: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
    priority: 52,
    regionalPriority: { cn: 75, hk: 50, tw: 20, sea: 15, global: -5 },
  },
  {
    id: 'qqmusic-search',
    name: 'QQ Music search / lyrics',
    category: 'lyrics',
    url: 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=1&format=json&w=test',
    priority: 48,
    regionalPriority: { cn: 72, hk: 46, tw: 16, sea: 12, global: -8 },
  },
  {
    id: 'qqmusic-artwork',
    name: 'QQ Music artwork CDN',
    category: 'artwork',
    url: 'https://y.gtimg.cn/mediastyle/global/img/album_300.png',
    priority: 45,
    regionalPriority: { cn: 70, hk: 44, tw: 16, sea: 12, global: -8 },
  },
  ...NETEASE_API_ROUTES.map(route => ({
    ...route,
    category: 'music',
    url: `${route.baseUrl}/api/song/detail/?id=347230&ids=%5B347230%5D`,
  })),
  {
    id: 'netease-artwork',
    name: 'NetEase Cloud Music artwork CDN',
    category: 'artwork',
    url: 'https://p1.music.126.net/',
    priority: 40,
    regionalPriority: { cn: 68, hk: 38, tw: 14, sea: 10, global: -8 },
  },
  {
    id: 'kugou-catalog',
    name: 'Kugou Music catalog',
    category: 'music',
    url: 'https://songsearch.kugou.com/song_search_v2?keyword=test&page=1&pagesize=1&platform=WebFilter',
    priority: 40,
    regionalPriority: { cn: 64, hk: 30, tw: 8, global: -10 },
  },
  {
    id: 'kugou-lyrics',
    name: 'Kugou Music lyrics',
    category: 'lyrics',
    url: 'https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=test',
    priority: 36,
    regionalPriority: { cn: 62, hk: 28, tw: 6, global: -12 },
  },
  ...BANGUMI_API_ROUTES.map(route => ({
    ...route,
    category: 'production',
    url: `${route.baseUrl}/v0/subjects/1`,
  })),
  ...BANGUMI_WEBSITE_ROUTES.map(route => ({
    ...route,
    category: 'production',
    url: `${route.baseUrl}/subject/1`,
  })),
  ...BANGUMI_IMAGE_ROUTES.map(route => ({
    ...route,
    category: 'artwork',
    url: `${route.baseUrl}/pic/cover/l/ba/0b/1_jI05p.jpg`,
  })),
  {
    id: 'anisongdb-origin-hint',
    name: 'AniSongDB',
    category: 'production',
    url: 'https://anisongdb.com/api/song',
    priority: 34,
    regionalPriority: { jp: 55, us: 30, eu: 28, global: 22, cn: -15 },
  },
  {
    id: 'animethemes-origin-hint',
    name: 'AnimeThemes API',
    category: 'production',
    url: 'https://api.animethemes.moe/',
    priority: 31,
    regionalPriority: { jp: 45, us: 34, eu: 30, global: 22, cn: -18 },
    healthAliases: ['animethemes-video'],
  },
  {
    id: 'anilist-media',
    name: 'AniList',
    category: 'production',
    url: 'https://graphql.anilist.co/',
    priority: 28,
    regionalPriority: { jp: 38, us: 35, eu: 32, global: 20, cn: -20 },
  },
  {
    id: 'itunes-search-catalog',
    name: 'Apple iTunes Search',
    category: 'music',
    url: 'https://itunes.apple.com/search?term=music&media=music&entity=song&limit=1',
    priority: 28,
    regionalPriority: { jp: 42, us: 48, eu: 36, hk: 20, tw: 18, global: 25, cn: -15 },
  },
  ...MUSICBRAINZ_API_ROUTES.map(route => ({
    ...route,
    category: 'music',
    url: `${route.baseUrl}/ws/2/recording?query=recording:test&limit=1&fmt=json`,
  })),
  {
    id: 'coverartarchive-artwork',
    name: 'Cover Art Archive',
    category: 'artwork',
    url: 'https://coverartarchive.org/',
    priority: 25,
    regionalPriority: { us: 32, eu: 36, jp: 18, global: 26, cn: -18 },
  },
  ...LRCLIB_API_ROUTES.map(route => ({
    ...route,
    category: 'lyrics',
    url: `${route.baseUrl}/api/search?q=test`,
  })),
  {
    id: 'wikidata-media',
    name: 'Wikidata',
    category: 'production',
    url: 'https://www.wikidata.org/w/api.php?action=query&format=json&meta=siteinfo',
    priority: 22,
    regionalPriority: { us: 30, eu: 35, global: 25, cn: -20 },
  },
  {
    id: 'wikimedia-artwork',
    name: 'Wikimedia Commons',
    category: 'artwork',
    url: 'https://commons.wikimedia.org/w/api.php?action=query&format=json&meta=siteinfo',
    priority: 20,
    regionalPriority: { us: 28, eu: 34, global: 24, cn: -22 },
  },
  {
    id: 'tvmaze-media',
    name: 'TVmaze',
    category: 'production',
    url: 'https://api.tvmaze.com/search/shows?q=test',
    priority: 18,
    regionalPriority: { us: 35, eu: 30, global: 22, cn: -12 },
  },
  {
    id: 'vndb-media',
    name: 'VNDB',
    category: 'production',
    url: 'https://api.vndb.org/kana/schema',
    priority: 23,
    regionalPriority: { jp: 38, us: 34, eu: 32, global: 28, cn: -8 },
  },
  {
    id: 'steam-media',
    name: 'Steam Store',
    category: 'production',
    url: 'https://store.steampowered.com/api/storesearch/?term=test&l=english&cc=US',
    priority: 18,
    regionalPriority: { jp: 25, us: 34, eu: 34, global: 28, cn: -6 },
  },
  {
    id: 'tmdb-media',
    name: 'TMDB API',
    category: 'production',
    url: 'https://api.themoviedb.org/3/configuration',
    priority: 20,
    regionalPriority: { hk: 35, tw: 35, jp: 35, us: 48, eu: 42, global: 38, cn: -20 },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    category: 'mv',
    url: 'https://www.youtube.com/generate_204',
    priority: 30,
    regionalPriority: { jp: 48, us: 52, eu: 48, global: 42, cn: -80 },
    healthAliases: ['youtube-production'],
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music',
    category: 'mv',
    url: 'https://music.youtube.com/generate_204',
    priority: 25,
    regionalPriority: { jp: 44, us: 48, eu: 44, global: 38, cn: -80 },
  },
  {
    id: 'bilibili',
    name: 'Bilibili official video / production lead',
    category: 'production-lead',
    url: 'https://api.bilibili.com/x/web-interface/nav',
    priority: 32,
    regionalPriority: { cn: 72, hk: 32, tw: 22, jp: 4, global: -5 },
    healthAliases: ['bilibili-production'],
  },
  {
    id: 'bilibili-web',
    name: 'Bilibili web',
    category: 'mv',
    url: 'https://www.bilibili.com/',
    priority: 27,
    regionalPriority: { cn: 68, hk: 30, tw: 20, jp: 2, global: -8 },
  },
  {
    id: 'niconico',
    name: 'Niconico',
    category: 'mv',
    url: 'https://www.nicovideo.jp/',
    priority: 22,
    regionalPriority: { jp: 48, hk: 18, tw: 18, us: 15, global: 10, cn: -25 },
    healthAliases: ['niconico-production'],
  },
  {
    id: 'animethemes-video-cdn',
    name: 'AnimeThemes video CDN',
    category: 'mv',
    url: 'https://v.animethemes.moe/',
    priority: 25,
    regionalPriority: { jp: 42, us: 34, eu: 30, global: 24, cn: -18 },
  },
])

export const NETWORK_ROUTE_HEALTH_GROUPS = freezeRoutes([
  {
    id: 'netease-catalog',
    name: 'NetEase Cloud Music',
    category: 'music',
    members: ['netease-api-main', 'netease-api-interface'],
  },
  {
    id: 'lrclib-lyrics',
    name: 'LRCLIB',
    category: 'lyrics',
    members: ['lrclib-api', 'lrclib-api-www'],
  },
  {
    id: 'musicbrainz-catalog',
    name: 'MusicBrainz',
    category: 'music',
    members: ['musicbrainz-api'],
  },
])
