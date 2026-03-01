type Category = {
  key: string;
  name: string;
};

export type AchievementDefinition = {
  key: string;
  name: string;
  badge_key: string;
  category_key: string;
  category_name: string;
  target_value: number;
  target_label: string;
};

const CATEGORIES: readonly Category[] = [
  { key: "longest_current_streak", name: "Longest Current Streak" },
  { key: "longest_habit_streak", name: "Longest Habit Streak" },
  { key: "total_habit_completions", name: "Total Habit Completions" },
  { key: "total_habits_achieved", name: "Total Habits Achieved" },
  { key: "account_age", name: "Account Age" },
];

const STREAK_MILESTONES = [2, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 365] as const;
const COMPLETION_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;
const HABIT_GOAL_MILESTONES = [1, 3, 5, 10, 20, 30, 50, 75, 100] as const;
const ACCOUNT_AGE_MILESTONES = [7, 14, 30, 60, 90, 180, 365, 730, 1095, 1825] as const;

const asDayLabel = (value: number) => `${value} ${value === 1 ? "day" : "days"}`;
const asCompletionLabel = (value: number) => `${value} ${value === 1 ? "completion" : "completions"}`;
const asHabitLabel = (value: number) => `${value} ${value === 1 ? "habit" : "habits"}`;

function buildStreakCatalog(categoryKey: "longest_current_streak" | "longest_habit_streak", streakType: "Current" | "Habit") {
  const category = CATEGORIES.find((item) => item.key === categoryKey)!;
  return STREAK_MILESTONES.map((days): AchievementDefinition => {
    const key = `${categoryKey}_${days}_days`;
    return {
      key,
      name: `${days} Day ${streakType} Streak`,
      badge_key: key,
      category_key: category.key,
      category_name: category.name,
      target_value: days,
      target_label: asDayLabel(days),
    };
  });
}

function buildTotalCompletionsCatalog() {
  const category = CATEGORIES.find((item) => item.key === "total_habit_completions")!;
  return COMPLETION_MILESTONES.map((value): AchievementDefinition => {
    const key = `total_habit_completions_${value}`;
    return {
      key,
      name: `${value} Total Habit Completions`,
      badge_key: key,
      category_key: category.key,
      category_name: category.name,
      target_value: value,
      target_label: asCompletionLabel(value),
    };
  });
}

function buildTotalHabitsAchievedCatalog() {
  const category = CATEGORIES.find((item) => item.key === "total_habits_achieved")!;
  return HABIT_GOAL_MILESTONES.map((value): AchievementDefinition => {
    const key = `total_habits_achieved_${value}`;
    return {
      key,
      name: `${value} Habits Achieved`,
      badge_key: key,
      category_key: category.key,
      category_name: category.name,
      target_value: value,
      target_label: asHabitLabel(value),
    };
  });
}

function buildAccountAgeCatalog() {
  const category = CATEGORIES.find((item) => item.key === "account_age")!;
  return ACCOUNT_AGE_MILESTONES.map((days): AchievementDefinition => {
    const key = `account_age_${days}_days`;
    return {
      key,
      name: `${days} Day Account Age`,
      badge_key: key,
      category_key: category.key,
      category_name: category.name,
      target_value: days,
      target_label: asDayLabel(days),
    };
  });
}

export const APP_ACHIEVEMENT_CATEGORY_ORDER = CATEGORIES.map((category) => category.key);

export const APP_ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  ...buildStreakCatalog("longest_current_streak", "Current"),
  ...buildStreakCatalog("longest_habit_streak", "Habit"),
  ...buildTotalCompletionsCatalog(),
  ...buildTotalHabitsAchievedCatalog(),
  ...buildAccountAgeCatalog(),
];

export const APP_ACHIEVEMENT_KEYS = APP_ACHIEVEMENT_CATALOG.map((item) => item.key);

export const APP_ACHIEVEMENT_BY_KEY = new Map(
  APP_ACHIEVEMENT_CATALOG.map((item, index) => [item.key, { ...item, sort_order: index }]),
);

