/**
 * Recommendation Engine for AuraStream
 * Solves Spotify's "Echo Chamber" through transparent vector similarity
 * and the user-controlled "Discovery Dial".
 */

export class RecommendationEngine {
  /**
   * Related genre affinities map
   */
  static GENRE_AFFINITIES = {
    'Synthwave': ['Indie Electro', 'Dance / EDM', 'Progressive Trance', 'Ambient', 'Melodic House'],
    'Indie Electro': ['Synthwave', 'Dance / EDM', 'Melodic House', 'Classic Rock'],
    'Lo-Fi Chillhop': ['Ambient', 'Fingerstyle', 'Neo-Classical', 'Acoustic Folk'],
    'Ambient': ['Lo-Fi Chillhop', 'Synthwave', 'Neo-Classical', 'Fingerstyle'],
    'Dance / EDM': ['Synthwave', 'Progressive Trance', 'Melodic House', 'Indie Electro'],
    'Acoustic Folk': ['Fingerstyle', 'Latin Acoustic', 'Lo-Fi Chillhop', 'Classic Rock'],
    'Fingerstyle': ['Acoustic Folk', 'Neo-Classical', 'Lo-Fi Chillhop', 'Ambient'],
    'Classic Rock': ['Indie Electro', 'Acoustic Folk', 'Dance / EDM'],
    'Neo-Classical': ['Ambient', 'Fingerstyle', 'Lo-Fi Chillhop'],
    'Latin Acoustic': ['Acoustic Folk', 'Fingerstyle', 'Melodic House'],
    'Progressive Trance': ['Synthwave', 'Dance / EDM', 'Melodic House'],
    'Melodic House': ['Progressive Trance', 'Synthwave', 'Dance / EDM', 'Latin Acoustic']
  };

  /**
   * Calculate distance between two tracks given the Discovery Dial position (0-100)
   */
  static calculateSimilarity(trackA, trackB, dial = 45) {
    if (trackA.id === trackB.id) return -1; // Ignore self

    const vA = trackA.vector;
    const vB = trackB.vector;

    // 1. Genre affinity (0 to 1)
    let genreScore = 0;
    if (trackA.genre === trackB.genre) {
      genreScore = 1.0;
    } else if (this.GENRE_AFFINITIES[trackA.genre]?.includes(trackB.genre)) {
      genreScore = 0.65;
    } else {
      genreScore = 0.15;
    }

    // 2. Mood affinity
    const moodScore = trackA.mood === trackB.mood ? 1.0 : 0.4;

    // 3. BPM proximity
    const bpmDiff = Math.abs(trackA.bpm - trackB.bpm);
    const bpmScore = Math.max(0, 1 - (bpmDiff / 80));

    // 4. Energy proximity
    const energyScore = 1 - Math.abs(vA.energy - vB.energy);

    // 5. Valence (musical positiveness) proximity
    const valenceScore = 1 - Math.abs(vA.valence - vB.valence);

    // 6. Acousticness proximity
    const acousticScore = 1 - Math.abs(vA.acousticness - vB.acousticness);

    // Dynamic weights depending on Discovery Dial (0 = Safe/Comfort Zone, 100 = Wild Explorer)
    // dial normalized 0.0 -> 1.0
    const dNorm = Math.min(1, Math.max(0, dial / 100));

    // In Comfort Zone (dNorm ~ 0): heavy weight on exact genre, mood, and BPM
    // In Sonic Explorer (dNorm ~ 1): lower weight on genre, higher weight on mood harmony and cross-genre surprise
    const wGenre = 0.45 * (1 - dNorm * 0.7); // 0.45 down to 0.13
    const wBpm = 0.25 * (1 - dNorm * 0.5);   // 0.25 down to 0.12
    const wMood = 0.15;
    const wEnergy = 0.15 + (dNorm * 0.2);    // 0.15 up to 0.35
    const wValence = 0.10 + (dNorm * 0.2);   // 0.10 up to 0.30

    let totalScore = (genreScore * wGenre) +
                     (bpmScore * wBpm) +
                     (moodScore * wMood) +
                     (energyScore * wEnergy) +
                     (valenceScore * wValence);

    // Explorer bonus: if dial is high and genres are different but energy/valence align, reward surprise
    if (dNorm > 0.6 && trackA.genre !== trackB.genre && energyScore > 0.7) {
      totalScore += 0.25 * (dNorm - 0.5);
    }

    return totalScore;
  }

  /**
   * Explainable AI reason generator
   */
  static generateReason(sourceTrack, candidateTrack, dial = 45) {
    const bpmDiff = Math.abs(sourceTrack.bpm - candidateTrack.bpm);
    const sameGenre = sourceTrack.genre === candidateTrack.genre;
    const sameMood = sourceTrack.mood === candidateTrack.mood;

    if (sameGenre && bpmDiff <= 8) {
      return `Matching ${candidateTrack.genre} groove with synchronized ${candidateTrack.bpm} BPM tempo.`;
    }
    if (sameGenre) {
      return `Continuity in ${candidateTrack.genre} soundscapes with shared ${candidateTrack.mood.toLowerCase()} vibe.`;
    }
    if (sameMood && dial > 60) {
      return `Sonic Explorer pick: cross-genre shift to ${candidateTrack.genre} sharing the same ${candidateTrack.mood.toLowerCase()} energy.`;
    }
    if (bpmDiff <= 10) {
      return `Complementary tempo (${candidateTrack.bpm} BPM) bridging ${sourceTrack.genre} into ${candidateTrack.genre}.`;
    }
    return `Harmonically tuned to complement "${sourceTrack.title}" (${candidateTrack.mood} vibe).`;
  }

  /**
   * Get recommendations for a specific track
   */
  static getRecommendationsForTrack(currentTrack, catalog, dial = 45, limit = 5) {
    if (!currentTrack) return [];

    const scored = catalog
      .filter(t => t.id !== currentTrack.id)
      .map(track => {
        const score = this.calculateSimilarity(currentTrack, track, dial);
        const reason = this.generateReason(currentTrack, track, dial);
        return { track, score, reason };
      })
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
  }

  /**
   * Get personalized recommendation mix from user's liked tracks and listening history
   */
  static getPersonalizedMix(catalog, likedIds = new Set(), history = [], dial = 45, limit = 6) {
    const favoriteTracks = catalog.filter(t => likedIds.has(t.id));
    
    // If user has no liked tracks yet, use top representative tracks
    const referenceTracks = favoriteTracks.length > 0 
      ? favoriteTracks 
      : [catalog[0], catalog[2], catalog[5]];

    const trackScores = new Map();

    for (const track of catalog) {
      if (referenceTracks.some(r => r.id === track.id)) continue;

      let highestScore = 0;
      let bestRef = referenceTracks[0];

      for (const ref of referenceTracks) {
        const score = this.calculateSimilarity(ref, track, dial);
        if (score > highestScore) {
          highestScore = score;
          bestRef = ref;
        }
      }

      // Slightly prioritize tracks not played recently to prevent echo chamber
      const recentIndex = history.findIndex(h => h.trackId === track.id);
      if (recentIndex !== -1 && recentIndex < 4) {
        highestScore *= 0.75; // de-emphasize the last 4 played songs!
      }

      trackScores.set(track.id, {
        track,
        score: highestScore,
        reason: this.generateReason(bestRef, track, dial)
      });
    }

    return Array.from(trackScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Filter tracks by mood tag
   */
  static getTracksByMood(mood, catalog) {
    if (!mood || mood === 'All') return catalog;
    return catalog.filter(t => t.mood.toLowerCase() === mood.toLowerCase());
  }

  /**
   * Filter tracks by genre
   */
  static getTracksByGenre(genre, catalog) {
    if (!genre || genre === 'All') return catalog;
    return catalog.filter(t => t.genre.toLowerCase() === genre.toLowerCase());
  }
}
