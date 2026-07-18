import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { getGlobalSettings, setGlobalSettings, setGlobalSchedule } from "../scheduler.js";

registerMainMenuItem({ label: "📊 Status", data: "status:show", order: 10 });
registerMainMenuItem({ label: "⏸️ Pause", data: "pause:do", order: 20 });
registerMainMenuItem({ label: "▶️ Resume", data: "resume:do", order: 30 });
registerMainMenuItem({ label: "🚀 Post now", data: "postnow:do", order: 40 });
registerMainMenuItem({ label: "⏱️ Set frequency", data: "setfreq:show", order: 50 });
registerMainMenuItem({ label: "🪙 Set assets", data: "setassets:show", order: 60 });

const composer = new Composer<Ctx>();

const WELCOME = "👋 Welcome! Tap a button below to get started.";

composer.command("start", async (ctx) => {
  if (ctx.from) {
    const settings = getGlobalSettings();
    settings.ownerChatId = ctx.from.id;
    setGlobalSettings(settings);
  }
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
