import type { Bot, Api } from "grammy";
import type { Ctx } from "./bot.js";
import {
  fetchPrices,
  fetchNews,
  computeSignals,
  formatSnapshot,
  type MarketSnapshot,
} from "./api.js";

export interface AdminSettings {
  channelId: string;
  enabled: boolean;
  timezone: string;
  postFrequency: number;
  trackedAssets: string[];
  ownerChatId: number;
}

export interface ScheduleState {
  lastPostTime: number;
  nextPostTime: number;
  isPaused: boolean;
}

export interface PostRecord {
  timestamp: number;
  summary: string;
}

export const DEFAULT_SETTINGS: AdminSettings = {
  channelId: "",
  enabled: true,
  timezone: "UTC",
  postFrequency: 15,
  trackedAssets: ["bitcoin", "ethereum", "solana"],
  ownerChatId: 0,
};

export const ALLOWED_FREQUENCIES = [5, 15, 30, 60, 240, 1440];

export function now(): number {
  return Date.now();
}

export function buildPostMessage(snapshot: MarketSnapshot): string {
  return formatSnapshot(snapshot);
}

const globalConfig: {
  settings: AdminSettings;
  schedule: ScheduleState;
  posts: PostRecord[];
} = {
  settings: { ...DEFAULT_SETTINGS },
  schedule: { lastPostTime: 0, nextPostTime: 0, isPaused: false },
  posts: [],
};

export function getGlobalSettings(): AdminSettings {
  return globalConfig.settings;
}

export function getGlobalSchedule(): ScheduleState {
  return globalConfig.schedule;
}

export function getGlobalPosts(): PostRecord[] {
  return globalConfig.posts;
}

export function setGlobalSettings(settings: AdminSettings): void {
  globalConfig.settings = settings;
}

export function setGlobalSchedule(schedule: ScheduleState): void {
  globalConfig.schedule = schedule;
}

export function addGlobalPost(record: PostRecord): void {
  globalConfig.posts.push(record);
  if (globalConfig.posts.length > 50) globalConfig.posts.shift();
}

export function resetGlobalConfig(): void {
  globalConfig.settings = { ...DEFAULT_SETTINGS };
  globalConfig.schedule = { lastPostTime: 0, nextPostTime: 0, isPaused: false };
  globalConfig.posts = [];
}

function apiSend(api: Api<any>, chatId: string, text: string): Promise<any> {
  return api.sendMessage(chatId, text);
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let schedulerBot: Bot<Ctx> | null = null;

export function startScheduler(
  bot: Bot<Ctx>,
  clock: () => number = now,
): void {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerBot = bot;

  schedulerTimer = setInterval(async () => {
    try {
      const settings = getGlobalSettings();
      const schedule = getGlobalSchedule();

      if (schedule.isPaused) return;
      if (!settings.channelId) return;
      if (settings.ownerChatId <= 0) return;
      if (clock() < schedule.nextPostTime) return;

      await postUpdate(bot.api, settings, clock);
      setGlobalSchedule({
        ...schedule,
        lastPostTime: clock(),
        nextPostTime: clock() + settings.postFrequency * 60 * 1000,
      });
    } catch (err) {
      console.error("[scheduler] posting error:", err);
      const settings = getGlobalSettings();
      if (settings.ownerChatId > 0) {
        try {
          await bot.api.sendMessage(
            settings.ownerChatId,
            "⚠️ Failed to post update. Check bot logs and channel permissions.",
          );
        } catch {
          // owner may have blocked the bot
        }
      }
    }
  }, 30_000);

  schedulerTimer.unref?.();
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerBot = null;
}

export function getSchedulerBot(): Bot<Ctx> | null {
  return schedulerBot;
}

export async function postUpdate(
  api: Api<any>,
  settings: AdminSettings,
  clock: () => number = now,
): Promise<void> {
  const prices = await fetchPrices(settings.trackedAssets);
  const signals = computeSignals(prices);
  const news = await fetchNews(2);

  const ts = new Date(clock()).toLocaleString("en-US", {
    timeZone: settings.timezone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const snapshot: MarketSnapshot = { prices, signals, news, timestamp: ts };
  const message = buildPostMessage(snapshot);

  await apiSend(api, settings.channelId, message);

  addGlobalPost({
    timestamp: clock(),
    summary: `Posted update: ${prices.map((p) => p.symbol).join(", ")}`,
  });
}
