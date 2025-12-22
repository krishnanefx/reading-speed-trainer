// Achievement definitions for the Speed Reader app

export interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    // Condition checker - takes stats and returns true if unlocked
    condition: (stats: AchievementStats) => boolean;
}

export interface AchievementStats {
    totalWordsRead: number;
    peakWpm: number;
    currentStreak: number;
    longestStreak: number;
    sessionCount: number;
    dailyGoalMetCount: number;
    // New stats
    totalTimeReadSeconds: number;
    booksFinishedCount: number;
    gymBestTime: number | null; // null if never played
    lastSessionDuration: number;
}

export const ACHIEVEMENTS: Achievement[] = [
    // First Steps
    {
        id: 'first_read',
        name: 'First Steps',
        description: 'Complete your first reading session',
        icon: '📖',
        condition: (stats) => stats.sessionCount >= 1,
    },
    // Word Count Milestones
    {
        id: 'words_1k',
        name: 'Bookworm',
        description: 'Read 1,000 words total',
        icon: '📚',
        condition: (stats) => stats.totalWordsRead >= 1000,
    },
    {
        id: 'words_10k',
        name: 'Scholar',
        description: 'Read 10,000 words total',
        icon: '🎓',
        condition: (stats) => stats.totalWordsRead >= 10000,
    },
    {
        id: 'words_100k',
        name: 'Wordsmith',
        description: 'Read 100,000 words total',
        icon: '✍️',
        condition: (stats) => stats.totalWordsRead >= 100000,
    },
    // Time & Endurance
    {
        id: 'time_1h',
        name: 'Hour of Power',
        description: 'Read for 1 hour total',
        icon: '⏱️',
        condition: (stats) => stats.totalTimeReadSeconds >= 3600,
    },
    {
        id: 'time_5h',
        name: 'Deep Diver',
        description: 'Read for 5 hours total',
        icon: '🌊',
        condition: (stats) => stats.totalTimeReadSeconds >= 18000,
    },
    {
        id: 'time_24h',
        name: 'Day Tripper',
        description: 'Read for 24 hours total',
        icon: '🌞',
        condition: (stats) => stats.totalTimeReadSeconds >= 86400,
    },
    {
        id: 'session_30m',
        name: 'Laser Focus',
        description: 'Read for 30 minutes in one session',
        icon: '🧠',
        condition: (stats) => stats.lastSessionDuration >= 1800,
    },
    // Book Completion
    {
        id: 'finish_1',
        name: 'The End',
        description: 'Finish reading a book',
        icon: '🏁',
        condition: (stats) => stats.booksFinishedCount >= 1,
    },
    {
        id: 'finish_5',
        name: 'Page Turner',
        description: 'Finish 5 books',
        icon: '📑',
        condition: (stats) => stats.booksFinishedCount >= 5,
    },
    {
        id: 'finish_10',
        name: 'Library Conqueror',
        description: 'Finish 10 books',
        icon: '🏰',
        condition: (stats) => stats.booksFinishedCount >= 10,
    },
    // Speed Milestones
    {
        id: 'wpm_300',
        name: 'Speed Starter',
        description: 'Reach 300 WPM',
        icon: '🚀',
        condition: (stats) => stats.peakWpm >= 300,
    },
    {
        id: 'wpm_500',
        name: 'Speed Demon',
        description: 'Reach 500 WPM',
        icon: '⚡',
        condition: (stats) => stats.peakWpm >= 500,
    },
    {
        id: 'wpm_800',
        name: 'Lightning Reader',
        description: 'Reach 800 WPM',
        icon: '🌩️',
        condition: (stats) => stats.peakWpm >= 800,
    },
    {
        id: 'wpm_1000',
        name: 'Quantum Reader',
        description: 'Reach 1,000 WPM',
        icon: '⚛️',
        condition: (stats) => stats.peakWpm >= 1000,
    },
    {
        id: 'wpm_1500',
        name: 'Singularity',
        description: 'Reach 1,500 WPM',
        icon: '🌌',
        condition: (stats) => stats.peakWpm >= 1500,
    },
    // Streak Milestones
    {
        id: 'streak_3',
        name: 'On a Roll',
        description: 'Maintain a 3-day reading streak',
        icon: '🔥',
        condition: (stats) => stats.longestStreak >= 3,
    },
    {
        id: 'streak_7',
        name: 'Week Warrior',
        description: 'Maintain a 7-day reading streak',
        icon: '💪',
        condition: (stats) => stats.longestStreak >= 7,
    },
    {
        id: 'streak_30',
        name: 'Monthly Master',
        description: 'Maintain a 30-day reading streak',
        icon: '🏆',
        condition: (stats) => stats.longestStreak >= 30,
    },
    {
        id: 'streak_100',
        name: 'Centurion',
        description: 'Maintain a 100-day reading streak',
        icon: '💯',
        condition: (stats) => stats.longestStreak >= 100,
    },
    {
        id: 'streak_365',
        name: 'Legend',
        description: 'Maintain a 365-day reading streak',
        icon: '👑',
        condition: (stats) => stats.longestStreak >= 365,
    },
    // Daily Goal Milestones
    {
        id: 'goal_met',
        name: 'Goal Crusher',
        description: 'Hit your daily reading goal',
        icon: '🎯',
        condition: (stats) => stats.dailyGoalMetCount >= 1,
    },
    {
        id: 'goal_5x',
        name: 'Consistent',
        description: 'Hit your daily goal 5 times',
        icon: '⭐',
        condition: (stats) => stats.dailyGoalMetCount >= 5,
    },
    // Eye Gym Milestones
    {
        id: 'gym_play',
        name: 'Warm Up',
        description: 'Complete a round of Eye Gym',
        icon: '🏋️',
        condition: (stats) => stats.gymBestTime !== null, // Any time logged
    },
    {
        id: 'gym_30s',
        name: 'Keen Eye',
        description: 'Finish Eye Gym in under 30s',
        icon: '👁️',
        condition: (stats) => stats.gymBestTime !== null && stats.gymBestTime <= 30,
    },
    {
        id: 'gym_20s',
        name: 'Eagle Eye',
        description: 'Finish Eye Gym in under 20s',
        icon: '🦅',
        condition: (stats) => stats.gymBestTime !== null && stats.gymBestTime <= 20,
    },
    {
        id: 'gym_15s',
        name: 'Alien Reflexes',
        description: 'Finish Eye Gym in under 15s',
        icon: '👽',
        condition: (stats) => stats.gymBestTime !== null && stats.gymBestTime <= 15,
    },
];

// Helper to check which achievements are newly unlocked
export const checkNewAchievements = (
    stats: AchievementStats,
    alreadyUnlocked: string[]
): string[] => {
    const newlyUnlocked: string[] = [];
    for (const achievement of ACHIEVEMENTS) {
        if (!alreadyUnlocked.includes(achievement.id) && achievement.condition(stats)) {
            newlyUnlocked.push(achievement.id);
        }
    }
    return newlyUnlocked;
};
