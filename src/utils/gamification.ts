import { toast } from 'react-hot-toast';
import { checkNewAchievements } from './achievements';
import { getBooks, getSessions, getUserProgress, updateUserProgress } from './db';

export const recordSessionAndUpdateProgress = async (
  wordsRead: number,
  sessionWpm: number,
  durationSeconds: number
) => {
  const progress = await getUserProgress();
  const sessions = await getSessions();
  const allBooks = await getBooks();
  const today = new Date().toISOString().split('T')[0];

  const todaySessions = sessions.filter((session) =>
    new Date(session.timestamp).toISOString().split('T')[0] === today
  );
  const wordsToday = todaySessions.reduce((acc, session) => acc + session.wordsRead, 0) + wordsRead;

  let newStreak = progress.currentStreak;
  let newLongestStreak = progress.longestStreak;

  if (progress.lastReadDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (progress.lastReadDate === yesterdayStr) {
      newStreak = progress.currentStreak + 1;
    } else {
      newStreak = 1;
    }
    newLongestStreak = Math.max(newLongestStreak, newStreak);
  }

  let newGoalMetCount = progress.dailyGoalMetCount;
  const prevWordsToday = wordsToday - wordsRead;
  if (prevWordsToday < progress.dailyGoal && wordsToday >= progress.dailyGoal) {
    newGoalMetCount++;
  }

  const newPeakWpm = Math.max(progress.peakWpm, sessionWpm);
  const newTotalWords = progress.totalWordsRead + wordsRead;
  const totalTimeReadSeconds = sessions.reduce((acc, session) => acc + session.durationSeconds, 0) + durationSeconds;
  const booksFinishedCount = allBooks.filter((book) => book.progress >= 1).length;

  const stats = {
    totalWordsRead: newTotalWords,
    peakWpm: newPeakWpm,
    currentStreak: newStreak,
    longestStreak: newLongestStreak,
    sessionCount: sessions.length + 1,
    dailyGoalMetCount: newGoalMetCount,
    totalTimeReadSeconds,
    booksFinishedCount,
    gymBestTime: progress.gymBestTime,
    lastSessionDuration: durationSeconds,
  };

  const newAchievements = checkNewAchievements(stats, progress.unlockedAchievements);

  await updateUserProgress({
    lastReadDate: today,
    currentStreak: newStreak,
    longestStreak: newLongestStreak,
    peakWpm: newPeakWpm,
    totalWordsRead: newTotalWords,
    dailyGoalMetCount: newGoalMetCount,
    unlockedAchievements: [...progress.unlockedAchievements, ...newAchievements],
  });

  if (newAchievements.length > 0) {
    newAchievements.forEach(() => {
      toast.success('🏆 Achievement Unlocked!', { duration: 4000 });
    });
  }
};
