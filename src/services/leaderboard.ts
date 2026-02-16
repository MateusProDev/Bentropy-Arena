import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { LeaderboardEntry } from '../types/game';

const LEADERBOARD_COLLECTION = 'leaderboard';

export async function getLeaderboard(maxResults = 50): Promise<LeaderboardEntry[]> {
  try {
    const q = query(
      collection(db, LEADERBOARD_COLLECTION),
      orderBy('highScore', 'desc'),
      limit(maxResults)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    })) as LeaderboardEntry[];
  } catch (error) {
    console.error('Erro ao buscar leaderboard:', error);
    return [];
  }
}

export async function updatePlayerScore(
  uid: string,
  displayName: string,
  photoURL: string | null,
  score: number,
  length: number,
  kills: number
): Promise<void> {
  try {
    const docRef = doc(db, LEADERBOARD_COLLECTION, uid);
    const existing = await getDoc(docRef);

    if (existing.exists()) {
      const data = existing.data() as LeaderboardEntry;
      await updateDoc(docRef, {
        displayName,
        photoURL,
        highScore: Math.max(data.highScore, score),
        totalKills: (data.totalKills || 0) + kills,
        gamesPlayed: (data.gamesPlayed || 0) + 1,
        longestSnake: Math.max(data.longestSnake || 0, length),
        lastPlayed: Date.now(),
      });
    } else {
      await setDoc(docRef, {
        uid,
        displayName,
        photoURL,
        highScore: score,
        totalKills: kills,
        gamesPlayed: 1,
        longestSnake: length,
        lastPlayed: Date.now(),
      });
    }
  } catch (error) {
    console.error('Erro ao atualizar score:', error);
  }
}

export async function getPlayerStats(uid: string): Promise<LeaderboardEntry | null> {
  try {
    const docRef = doc(db, LEADERBOARD_COLLECTION, uid);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return { uid: snapshot.id, ...snapshot.data() } as LeaderboardEntry;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar stats:', error);
    return null;
  }
}
