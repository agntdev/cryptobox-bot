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

export type ScheduledPostType = "price" | "signal" | "news" | "custom";
export type RecurrenceType = "once" | "daily" | "weekly" | "custom";
export type ScheduledPostStatus = "pending" | "completed" | "disabled";

export interface ScheduledPostContent {
  assets?: string[];
  pair?: string;
  signalText?: string;
  imageUrl?: string;
  newsUrl?: string;
  newsTitle?: string;
  customText?: string;
}

export interface ScheduledPost {
  id: string;
  adminUserId: number;
  type: ScheduledPostType;
  content: ScheduledPostContent;
  channelId: string;
  scheduledTime: string;
  recurrence: RecurrenceType;
  cronExpression?: string;
  timezone: string;
  status: ScheduledPostStatus;
  createdAt: string;
}

let nextScheduleId = 1;

export function generateScheduleId(): string {
  return `sp_${nextScheduleId++}`;
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
  scheduledPosts: ScheduledPost[];
} = {
  settings: { ...DEFAULT_SETTINGS },
  schedule: { lastPostTime: 0, nextPostTime: 0, isPaused: false },
  posts: [],
  scheduledPosts: [],
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

export function getGlobalScheduledPosts(): ScheduledPost[] {
  return globalConfig.scheduledPosts;
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

export function addScheduledPost(post: ScheduledPost): void {
  globalConfig.scheduledPosts.push(post);
}

export function getScheduledPost(id: string): ScheduledPost | undefined {
  return globalConfig.scheduledPosts.find((p) => p.id === id);
}

export function updateScheduledPost(id: string, updates: Partial<ScheduledPost>): boolean {
  const idx = globalConfig.scheduledPosts.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  globalConfig.scheduledPosts[idx] = { ...globalConfig.scheduledPosts[idx], ...updates };
  return true;
}

export function deleteScheduledPost(id: string): boolean {
  const idx = globalConfig.scheduledPosts.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  globalConfig.scheduledPosts.splice(idx, 1);
  return true;
}

export function getUpcomingScheduledPosts(): ScheduledPost[] {
  return globalConfig.scheduledPosts
    .filter((p) => p.status === "pending")
    .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
}

export function resetGlobalConfig(): void {
  globalConfig.settings = { ...DEFAULT_SETTINGS };
  globalConfig.schedule = { lastPostTime: 0, nextPostTime: 0, isPaused: false };
  globalConfig.posts = [];
  globalConfig.scheduledPosts = [];
  nextScheduleId = 1;
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

    // Process scheduled posts
    try {
      const upcoming = getUpcomingScheduledPosts();
      const settings = getGlobalSettings();
      const currentTime = clock();

      for (const post of upcoming) {
        const postTime = new Date(post.scheduledTime).getTime();
        if (postTime <= currentTime) {
          try {
            await postScheduledMessage(bot.api, post, settings, clock);
            addGlobalPost({
              timestamp: currentTime,
              summary: `Scheduled post ${post.id} posted (${post.type})`,
            });
          } catch (postErr) {
            console.error(`[scheduler] scheduled post ${post.id} error:`, postErr);
            if (settings.ownerChatId > 0) {
              try {
                await bot.api.sendMessage(
                  settings.ownerChatId,
                  `⚠️ Failed to post scheduled message (${post.id}). Will retry.`,
                );
              } catch {
                // owner may have blocked the bot
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[scheduler] scheduled posts processing error:", err);
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

export function buildScheduledPostMessage(post: ScheduledPost): string {
  const lines: string[] = [];
  switch (post.type) {
    case "price":
      lines.push("📊 Scheduled Price Snapshot");
      if (post.content.assets && post.content.assets.length > 0) {
        lines.push(`Assets: ${post.content.assets.join(", ").toUpperCase()}`);
      }
      break;
    case "signal":
      lines.push("📈 Scheduled Signal");
      if (post.content.pair) lines.push(`Pair: ${post.content.pair}`);
      if (post.content.signalText) lines.push(post.content.signalText);
      break;
    case "news":
      lines.push("📰 Scheduled News");
      if (post.content.newsTitle) lines.push(post.content.newsTitle);
      if (post.content.newsUrl) lines.push(post.content.newsUrl);
      break;
    case "custom":
      lines.push("📝 Custom Post");
      if (post.content.customText) lines.push(post.content.customText);
      break;
  }
  lines.push("");
  lines.push(`Scheduled: ${post.scheduledTime} (${post.timezone})`);
  lines.push(`Recurrence: ${post.recurrence}`);
  return lines.join("\n");
}

export async function postScheduledMessage(
  api: Api<any>,
  post: ScheduledPost,
  settings: AdminSettings,
  clock: () => number = now,
): Promise<void> {
  let message = "";

  switch (post.type) {
    case "price": {
      const assets = post.content.assets ?? settings.trackedAssets;
      const prices = await fetchPrices(assets);
      const signals = computeSignals(prices);
      const ts = new Date(clock()).toLocaleString("en-US", {
        timeZone: settings.timezone,
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
      const snapshot: MarketSnapshot = { prices, signals, news: [], timestamp: ts };
      message = formatSnapshot(snapshot);
      break;
    }
    case "signal":
      message = `📈 Signal: ${post.content.pair ?? "N/A"}\n${post.content.signalText ?? ""}`;
      break;
    case "news":
      message = `📰 ${post.content.newsTitle ?? "News"}\n${post.content.newsUrl ?? ""}`;
      break;
    case "custom":
      message = post.content.customText ?? "Custom post";
      break;
  }

  const channelId = post.channelId || settings.channelId;
  await apiSend(api, channelId, message);

  if (post.recurrence === "once") {
    updateScheduledPost(post.id, { status: "completed" });
  }
}
