import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getGlobalSchedule, setGlobalSchedule } from "../scheduler.js";

const composer = new Composer<Ctx>();

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.command("pause", async (ctx) => {
  const sch = getGlobalSchedule();
  setGlobalSchedule({ ...sch, isPaused: true });
  await ctx.reply("⏸️ Scheduled posts paused.", { reply_markup: backToMenu });
});

composer.callbackQuery("pause:do", async (ctx) => {
  await ctx.answerCallbackQuery();
  const sch = getGlobalSchedule();
  setGlobalSchedule({ ...sch, isPaused: true });
  await ctx.editMessageText("⏸️ Scheduled posts paused.", { reply_markup: backToMenu });
});

export default composer;
