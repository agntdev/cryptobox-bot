import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import {
  getGlobalSettings,
  getGlobalScheduledPosts,
  getScheduledPost,
  addScheduledPost,
  updateScheduledPost,
  deleteScheduledPost,
  getUpcomingScheduledPosts,
  generateScheduleId,
  buildScheduledPostMessage,
  type ScheduledPost,
  type ScheduledPostType,
  type RecurrenceType,
} from "../scheduler.js";

registerMainMenuItem({ label: "📝 Add post", data: "sched:add:start", order: 70 });
registerMainMenuItem({ label: "📋 My schedules", data: "sched:list", order: 80 });

const composer = new Composer<Ctx>();

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

const TYPE_KEYBOARD = inlineKeyboard([
  [inlineButton("📊 Price snapshot", "sched:type:price")],
  [inlineButton("📈 Signal", "sched:type:signal")],
  [inlineButton("📰 News", "sched:type:news")],
  [inlineButton("✏️ Custom", "sched:type:custom")],
  [inlineButton("❌ Cancel", "sched:cancel")],
]);

const RECURRENCE_KEYBOARD = inlineKeyboard([
  [inlineButton("One-time", "sched:rec:once")],
  [inlineButton("Daily", "sched:rec:daily")],
  [inlineButton("Weekly", "sched:rec:weekly")],
  [inlineButton("❌ Cancel", "sched:cancel")],
]);

const CONFIRM_KEYBOARD = inlineKeyboard([
  [inlineButton("✅ Confirm", "sched:confirm:yes")],
  [inlineButton("❌ Cancel", "sched:confirm:no")],
]);

function buildSchedulesList(schedules: ScheduledPost[]): string {
  if (schedules.length === 0) {
    return "📋 No scheduled posts yet.\n\nTap 📝 Add post to create one.";
  }
  const lines: string[] = ["📋 Scheduled Posts", ""];
  for (const s of schedules) {
    const typeLabel = s.type === "price" ? "📊" : s.type === "signal" ? "📈" : s.type === "news" ? "📰" : "✏️";
    const statusLabel = s.status === "completed" ? " ✅" : s.status === "disabled" ? " ⏸️" : "";
    lines.push(`${typeLabel} ${s.id} — ${s.scheduledTime}${statusLabel}`);
  }
  return lines.join("\n");
}

function buildScheduleActions(schedules: ScheduledPost[]): ReturnType<typeof inlineKeyboard> {
  const rows: ReturnType<typeof inlineButton>[][] = [];
  for (const s of schedules) {
    if (s.status === "pending") {
      rows.push([
        inlineButton(`✏️ Edit ${s.id}`, `sched:edit:${s.id}`),
        inlineButton(`🗑️ Delete ${s.id}`, `sched:delete:${s.id}`),
        inlineButton(`⏸️ Disable ${s.id}`, `sched:disable:${s.id}`),
      ]);
    }
  }
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  return inlineKeyboard(rows);
}

composer.command("list_schedules", async (ctx) => {
  const schedules = getUpcomingScheduledPosts();
  if (schedules.length === 0) {
    await ctx.reply("📋 No scheduled posts yet.\n\nTap 📝 Add post to create one.", {
      reply_markup: backToMenu,
    });
    return;
  }
  await ctx.reply(buildSchedulesList(schedules), {
    reply_markup: buildScheduleActions(schedules),
  });
});

composer.callbackQuery("sched:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const schedules = getUpcomingScheduledPosts();
  if (schedules.length === 0) {
    await ctx.editMessageText("📋 No scheduled posts yet.\n\nTap 📝 Add post to create one.", {
      reply_markup: backToMenu,
    });
    return;
  }
  await ctx.editMessageText(buildSchedulesList(schedules), {
    reply_markup: buildScheduleActions(schedules),
  });
});

composer.callbackQuery("sched:add:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.flowStep = "type";
  ctx.session.flowData = {};
  await ctx.editMessageText("📝 Create a scheduled post\n\nChoose the post type:", {
    reply_markup: TYPE_KEYBOARD,
  });
});

composer.callbackQuery(/^sched:type:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const type = ctx.match[1] as ScheduledPostType;
  ctx.session.flowData = { ...ctx.session.flowData, type };
  ctx.session.flowStep = "content";

  switch (type) {
    case "price":
      ctx.session.flowStep = "content_price";
      await ctx.editMessageText(
        "📊 Price Snapshot\n\nEnter comma-separated asset symbols (e.g. BTC, ETH, SOL):",
        { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "sched:cancel")]]) },
      );
      break;
    case "signal":
      ctx.session.flowStep = "content_signal_pair";
      await ctx.editMessageText(
        "📈 Signal\n\nEnter the trading pair (e.g. BTC/USDT):",
        { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "sched:cancel")]]) },
      );
      break;
    case "news":
      ctx.session.flowStep = "content_news_title";
      await ctx.editMessageText(
        "📰 News\n\nEnter the news headline:",
        { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "sched:cancel")]]) },
      );
      break;
    case "custom":
      ctx.session.flowStep = "content_custom";
      await ctx.editMessageText(
        "✏️ Custom Post\n\nEnter the message text:",
        { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "sched:cancel")]]) },
      );
      break;
  }
});

composer.on("message:text", async (ctx, next) => {
  const flowStep = ctx.session.flowStep;
  if (!flowStep || (!flowStep.startsWith("content_") && flowStep !== "datetime")) return next();

  const text = ctx.message.text.trim();
  const flowData = ctx.session.flowData ?? {};

  switch (flowStep) {
    case "content_price": {
      const symbols = text.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (symbols.length === 0) {
        await ctx.reply("Please enter at least one asset symbol (e.g. BTC, ETH).");
        return;
      }
      flowData.assets = symbols;
      ctx.session.flowData = flowData;
      ctx.session.flowStep = "datetime";
      await ctx.reply(
        "📅 When should this post be published?\n\nEnter date and time (e.g. 2025-01-15 14:30 or 'in 30m', 'in 2h'):",
        { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "sched:cancel")]]) },
      );
      break;
    }
    case "content_signal_pair": {
      flowData.pair = text;
      ctx.session.flowData = flowData;
      ctx.session.flowStep = "content_signal_text";
      await ctx.reply("Enter the signal text (e.g. 'Strong buy signal — RSI oversold'):", {
        reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "sched:cancel")]]),
      });
      break;
    }
    case "content_signal_text": {
      flowData.signalText = text;
      ctx.session.flowData = flowData;
      ctx.session.flowStep = "datetime";
      await ctx.reply(
        "📅 When should this post be published?\n\nEnter date and time (e.g. 2025-01-15 14:30 or 'in 30m', 'in 2h'):",
        { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "sched:cancel")]]) },
      );
      break;
    }
    case "content_news_title": {
      flowData.newsTitle = text;
      ctx.session.flowData = flowData;
      ctx.session.flowStep = "content_news_url";
      await ctx.reply("Enter the news URL (or 'skip' to skip):", {
        reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "sched:cancel")]]),
      });
      break;
    }
    case "content_news_url": {
      if (text.toLowerCase() !== "skip") {
        flowData.newsUrl = text;
      }
      ctx.session.flowData = flowData;
      ctx.session.flowStep = "datetime";
      await ctx.reply(
        "📅 When should this post be published?\n\nEnter date and time (e.g. 2025-01-15 14:30 or 'in 30m', 'in 2h'):",
        { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "sched:cancel")]]) },
      );
      break;
    }
    case "content_custom": {
      flowData.customText = text;
      ctx.session.flowData = flowData;
      ctx.session.flowStep = "datetime";
      await ctx.reply(
        "📅 When should this post be published?\n\nEnter date and time (e.g. 2025-01-15 14:30 or 'in 30m', 'in 2h'):",
        { reply_markup: inlineKeyboard([[inlineButton("❌ Cancel", "sched:cancel")]]) },
      );
      break;
    }
    case "datetime": {
      let scheduledTime: Date;
      const now = new Date();
      const inMatch = /^in\s+(\d+)(m|h|d)$/i.exec(text);
      if (inMatch) {
        const amount = parseInt(inMatch[1], 10);
        const unit = inMatch[2].toLowerCase();
        scheduledTime = new Date(now.getTime());
        if (unit === "m") scheduledTime.setMinutes(scheduledTime.getMinutes() + amount);
        else if (unit === "h") scheduledTime.setHours(scheduledTime.getHours() + amount);
        else if (unit === "d") scheduledTime.setDate(scheduledTime.getDate() + amount);
      } else {
        const parsed = new Date(text);
        if (isNaN(parsed.getTime())) {
          await ctx.reply(
            "Invalid date format. Use '2025-01-15 14:30' or 'in 30m' / 'in 2h' / 'in 1d'.",
          );
          return;
        }
        scheduledTime = parsed;
      }
      flowData.scheduledTime = scheduledTime.toISOString();
      ctx.session.flowData = flowData;
      ctx.session.flowStep = "recurrence";
      await ctx.reply("🔄 How often should this repeat?", {
        reply_markup: RECURRENCE_KEYBOARD,
      });
      break;
    }
    default:
      return next();
  }
});

composer.callbackQuery(/^sched:rec:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const recurrence = ctx.match[1] as RecurrenceType;
  const flowData = ctx.session.flowData ?? {};
  flowData.recurrence = recurrence;
  flowData.timezone = getGlobalSettings().timezone;
  ctx.session.flowData = flowData;
  ctx.session.flowStep = "preview";

  const previewPost: ScheduledPost = {
    id: "preview",
    adminUserId: ctx.from?.id ?? 0,
    type: (flowData.type as ScheduledPostType) ?? "custom",
    content: {
      assets: flowData.assets,
      pair: flowData.pair,
      signalText: flowData.signalText,
      imageUrl: flowData.imageUrl,
      newsUrl: flowData.newsUrl,
      newsTitle: flowData.newsTitle,
      customText: flowData.customText,
    },
    channelId: getGlobalSettings().channelId || "Binance Crypto Box",
    scheduledTime: flowData.scheduledTime ?? "",
    recurrence: recurrence,
    timezone: flowData.timezone ?? "UTC",
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  const preview = buildScheduledPostMessage(previewPost);
  await ctx.editMessageText(`Preview:\n\n${preview}\n\nConfirm to save this scheduled post.`, {
    reply_markup: CONFIRM_KEYBOARD,
  });
});

composer.callbackQuery("sched:confirm:yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const flowData = ctx.session.flowData;
  if (!flowData || !flowData.type || !flowData.scheduledTime) {
    await ctx.editMessageText("Something went wrong. Please start again.", {
      reply_markup: backToMenu,
    });
    ctx.session.flowStep = undefined;
    ctx.session.flowData = undefined;
    return;
  }

  const settings = getGlobalSettings();
  const id = generateScheduleId();
  const post: ScheduledPost = {
    id,
    adminUserId: ctx.from?.id ?? 0,
    type: flowData.type as ScheduledPostType,
    content: {
      assets: flowData.assets,
      pair: flowData.pair,
      signalText: flowData.signalText,
      imageUrl: flowData.imageUrl,
      newsUrl: flowData.newsUrl,
      newsTitle: flowData.newsTitle,
      customText: flowData.customText,
    },
    channelId: settings.channelId || "Binance Crypto Box",
    scheduledTime: flowData.scheduledTime,
    recurrence: (flowData.recurrence as RecurrenceType) ?? "once",
    timezone: flowData.timezone ?? settings.timezone,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  addScheduledPost(post);
  ctx.session.flowStep = undefined;
  ctx.session.flowData = undefined;

  await ctx.editMessageText(
    `✅ Scheduled post saved!\n\nID: ${id}\nType: ${post.type}\nScheduled: ${post.scheduledTime}\nRecurrence: ${post.recurrence}`,
    { reply_markup: backToMenu },
  );
});

composer.callbackQuery("sched:confirm:no", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.flowStep = undefined;
  ctx.session.flowData = undefined;
  await ctx.editMessageText("Cancelled. Tap /start to begin again.", {
    reply_markup: backToMenu,
  });
});

composer.callbackQuery("sched:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.flowStep = undefined;
  ctx.session.flowData = undefined;
  await ctx.editMessageText("Cancelled. Tap /start to begin again.", {
    reply_markup: backToMenu,
  });
});

composer.callbackQuery(/^sched:edit:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  const post = getScheduledPost(id);
  if (!post) {
    await ctx.editMessageText("Schedule not found.", { reply_markup: backToMenu });
    return;
  }
  await ctx.editMessageText(
    `Editing schedule ${id}\n\nCurrent type: ${post.type}\nScheduled: ${post.scheduledTime}\nRecurrence: ${post.recurrence}\n\nTo change, delete and create a new schedule.`,
    { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to schedules", "sched:list")]]) },
  );
});

composer.callbackQuery(/^sched:delete:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  const deleted = deleteScheduledPost(id);
  if (!deleted) {
    await ctx.editMessageText("Schedule not found.", { reply_markup: backToMenu });
    return;
  }
  await ctx.editMessageText(`🗑️ Schedule ${id} deleted.`, { reply_markup: backToMenu });
});

composer.callbackQuery(/^sched:disable:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  const updated = updateScheduledPost(id, { status: "disabled" });
  if (!updated) {
    await ctx.editMessageText("Schedule not found.", { reply_markup: backToMenu });
    return;
  }
  await ctx.editMessageText(`⏸️ Schedule ${id} disabled.`, { reply_markup: backToMenu });
});

export default composer;
