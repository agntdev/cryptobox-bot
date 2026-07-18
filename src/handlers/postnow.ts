import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getGlobalSettings, getGlobalPosts, postUpdate, now } from "../scheduler.js";

const composer = new Composer<Ctx>();

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.command("postnow", async (ctx) => {
  const s = getGlobalSettings();
  if (!s.channelId) {
    await ctx.reply("⚠️ No channel configured yet. Set a channel first.", {
      reply_markup: backToMenu,
    });
    return;
  }
  try {
    await ctx.reply("⏳ Posting update…");
    await postUpdate(ctx.api, s, now);
    await ctx.reply("✅ Update posted!", { reply_markup: backToMenu });
  } catch (err) {
    await ctx.reply("❌ Couldn't post. Check channel permissions and try again.", {
      reply_markup: backToMenu,
    });
  }
});

composer.callbackQuery("postnow:do", async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = getGlobalSettings();
  if (!s.channelId) {
    await ctx.editMessageText("⚠️ No channel configured yet. Set a channel first.", {
      reply_markup: backToMenu,
    });
    return;
  }
  try {
    await ctx.editMessageText("⏳ Posting update…");
    await postUpdate(ctx.api, s, now);
    await ctx.editMessageText("✅ Update posted!", { reply_markup: backToMenu });
  } catch (err) {
    await ctx.editMessageText("❌ Couldn't post. Check channel permissions and try again.", {
      reply_markup: backToMenu,
    });
  }
});

export default composer;
