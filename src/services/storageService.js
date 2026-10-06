/**
 * Storage Service
 * Handles persistence for user preferences, liked songs, custom playlists, and history.
 */

const STORAGE_KEYS = {
  LIKED_TRACKS: 'aurastream_liked_tracks',
  CUSTOM_PLAYLISTS: 'aurastream_custom_playlists',
  HISTORY: 'aurastream_history',
  EQ_SETTINGS: 'aurastream_eq_settings',
  DISCOVERY_DIAL: 'aurastream_discovery_dial',
  VOLUME: 'aurastream_volume',
  FOLLOWED_ARTISTS: 'aurastream_followed_artists'
};

export class StorageService {
  static getLikedTrackIds() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LIKED_TRACKS);
      return data ? new Set(JSON.parse(data)) : new Set(['track-1', 'track-3', 'track-11']);
    } catch {
      return new Set(['track-1', 'track-3', 'track-11']);
    }
  }

  static saveLikedTrackIds(idSet) {
    try {
      localStorage.setItem(STORAGE_KEYS.LIKED_TRACKS, JSON.stringify(Array.from(idSet)));
    } catch (e) {
      console.warn('Failed to save liked tracks to localStorage', e);
    }
  }

  static toggleLike(trackId) {
    const set = this.getLikedTrackIds();
    const isLiked = set.has(trackId);
    if (isLiked) {
      set.delete(trackId);
    } else {
      set.add(trackId);
    }
    this.saveLikedTrackIds(set);
    return !isLiked;
  }

  static getCustomPlaylists() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_PLAYLISTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static saveCustomPlaylists(playlists) {
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_PLAYLISTS, JSON.stringify(playlists));
    } catch (e) {
      console.warn('Failed to save playlists', e);
    }
  }

  static createPlaylist(title, description = '', trackIds = []) {
    const playlists = this.getCustomPlaylists();
    const newPlaylist = {
      id: 'custom-' + Date.now(),
      title: title.trim() || 'My Favorite Mix',
      description: description.trim(),
      trackIds: Array.from(new Set(trackIds)),
      createdAt: new Date().toISOString(),
      color: '#3B82F6'
    };
    playlists.unshift(newPlaylist);
    this.saveCustomPlaylists(playlists);
    return newPlaylist;
  }

  static addTrackToPlaylist(playlistId, trackId) {
    const playlists = this.getCustomPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (pl && !pl.trackIds.includes(trackId)) {
      pl.trackIds.push(trackId);
      this.saveCustomPlaylists(playlists);
      return true;
    }
    return false;
  }

  static removeTrackFromPlaylist(playlistId, trackId) {
    const playlists = this.getCustomPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (pl) {
      pl.trackIds = pl.trackIds.filter(id => id !== trackId);
      this.saveCustomPlaylists(playlists);
      return true;
    }
    return false;
  }

  static deletePlaylist(playlistId) {
    let playlists = this.getCustomPlaylists();
    playlists = playlists.filter(p => p.id !== playlistId);
    this.saveCustomPlaylists(playlists);
  }

  static getHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static recordPlay(trackId) {
    try {
      let history = this.getHistory();
      history = history.filter(h => h.trackId !== trackId);
      history.unshift({ trackId, timestamp: Date.now() });
      if (history.length > 50) history.pop();
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to record history', e);
    }
  }

  static getEqSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EQ_SETTINGS);
      return data ? JSON.parse(data) : { preset: 'flat', bands: [0, 0, 0, 0, 0] };
    } catch {
      return { preset: 'flat', bands: [0, 0, 0, 0, 0] };
    }
  }

  static saveEqSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEYS.EQ_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save EQ settings', e);
    }
  }

  static getDiscoveryDial() {
    try {
      const val = localStorage.getItem(STORAGE_KEYS.DISCOVERY_DIAL);
      return val !== null ? parseInt(val, 10) : 45;
    } catch {
      return 45;
    }
  }

  static saveDiscoveryDial(val) {
    try {
      localStorage.setItem(STORAGE_KEYS.DISCOVERY_DIAL, String(val));
    } catch (e) {
      console.warn('Failed to save discovery dial', e);
    }
  }

  static getVolume() {
    try {
      const v = localStorage.getItem(STORAGE_KEYS.VOLUME);
      return v !== null ? parseFloat(v) : 0.85;
    } catch {
      return 0.85;
    }
  }

  static saveVolume(val) {
    try {
      localStorage.setItem(STORAGE_KEYS.VOLUME, String(val));
    } catch {}
  }

  static getFollowedArtists() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FOLLOWED_ARTISTS);
      return new Set(data ? JSON.parse(data) : []);
    } catch {
      return new Set();
    }
  }

  static toggleFollowArtist(name) {
    const set = this.getFollowedArtists();
    if (set.has(name)) set.delete(name);
    else set.add(name);
    try {
      localStorage.setItem(STORAGE_KEYS.FOLLOWED_ARTISTS, JSON.stringify([...set]));
    } catch {}
    return set.has(name);
  }
}
