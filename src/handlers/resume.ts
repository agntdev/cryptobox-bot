import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getGlobalSettings, getGlobalSchedule, setGlobalSchedule, now } from "../scheduler.js";

const composer = new Composer<Ctx>();

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.command("resume", async (ctx) => {
  const sch = getGlobalSchedule();
  const s = getGlobalSettings();
  let nextTime = sch.nextPostTime;
  if (nextTime <= now()) {
    nextTime = now() + s.postFrequency * 60 * 1000;
  }
  setGlobalSchedule({ ...sch, isPaused: false, nextPostTime: nextTime });
  await ctx.reply("▶️ Scheduled posts resumed.", { reply_markup: backToMenu });
});

composer.callbackQuery("resume:do", async (ctx) => {
  await ctx.answerCallbackQuery();
  const sch = getGlobalSchedule();
  const s = getGlobalSettings();
  let nextTime = sch.nextPostTime;
  if (nextTime <= now()) {
    nextTime = now() + s.postFrequency * 60 * 1000;
  }
  setGlobalSchedule({ ...sch, isPaused: false, nextPostTime: nextTime });
  await ctx.editMessageText("▶️ Scheduled posts resumed.", { reply_markup: backToMenu });
});

export default composer;
