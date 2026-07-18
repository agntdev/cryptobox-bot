import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { ALLOWED_FREQUENCIES, getGlobalSettings, getGlobalSchedule, getGlobalPosts } from "../scheduler.js";

const composer = new Composer<Ctx>();

function formatStatus(): string {
  const s = getGlobalSettings();
  const sch = getGlobalSchedule();
  const posts = getGlobalPosts();
  const freqLabel = `${s.postFrequency} min`;
  const assets = s.trackedAssets.join(", ").toUpperCase();
  const status = sch.isPaused ? "Paused" : "Running";
  const channel = s.channelId || "Not set";
  const nextPost =
    sch.nextPostTime > 0
      ? new Date(sch.nextPostTime).toLocaleString("en-US", {
          timeZone: s.timezone,
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        })
      : "Not scheduled";

  return [
    "📊 Current Settings",
    "",
    `Channel: ${channel}`,
    `Status: ${status}`,
    `Frequency: ${freqLabel} (options: ${ALLOWED_FREQUENCIES.join(", ")} min)`,
    `Assets: ${assets}`,
    `Timezone: ${s.timezone}`,
    "",
    `Next post: ${nextPost}`,
    `Posts so far: ${posts.length}`,
  ].join("\n");
}

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.command("status", async (ctx) => {
  await ctx.reply(formatStatus(), { reply_markup: backToMenu });
});

composer.callbackQuery("status:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(formatStatus(), { reply_markup: backToMenu });
});

export default composer;
