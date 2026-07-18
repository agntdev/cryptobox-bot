import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { ALLOWED_FREQUENCIES, getGlobalSettings, getGlobalSchedule, setGlobalSettings, setGlobalSchedule, now } from "../scheduler.js";

const composer = new Composer<Ctx>();

function buildFreqKeyboard(): ReturnType<typeof inlineKeyboard> {
  const rows = ALLOWED_FREQUENCIES.map((f) => [
    inlineButton(`${f} min`, `setfreq:set:${f}`),
  ]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  return inlineKeyboard(rows);
}

function formatFreqStatus(): string {
  const current = getGlobalSettings().postFrequency;
  return [
    "⏱️ Post Frequency",
    "",
    `Current: every ${current} minutes`,
    "",
    "Tap a frequency to change it:",
  ].join("\n");
}

composer.command("setfreq", async (ctx) => {
  const args = ctx.message?.text?.split(/\s+/).slice(1);
  if (args && args.length > 0) {
    const val = parseInt(args[0], 10);
    if (!ALLOWED_FREQUENCIES.includes(val)) {
      await ctx.reply(
        `❌ Invalid frequency. Allowed values: ${ALLOWED_FREQUENCIES.join(", ")} minutes.`,
      );
      return;
    }
    const settings = getGlobalSettings();
    settings.postFrequency = val;
    setGlobalSettings(settings);
    setGlobalSchedule({ ...getGlobalSchedule(), nextPostTime: now() + val * 60 * 1000 });
    await ctx.reply(`✅ Frequency updated to every ${val} minutes.`);
    return;
  }
  await ctx.reply(formatFreqStatus(), { reply_markup: buildFreqKeyboard() });
});

composer.callbackQuery("setfreq:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(formatFreqStatus(), { reply_markup: buildFreqKeyboard() });
});

composer.callbackQuery(/^setfreq:set:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const val = parseInt(ctx.match[1], 10);
  if (!ALLOWED_FREQUENCIES.includes(val)) {
    await ctx.editMessageText(
      `❌ Invalid frequency. Allowed values: ${ALLOWED_FREQUENCIES.join(", ")} minutes.`,
    );
    return;
  }
  const settings = getGlobalSettings();
  settings.postFrequency = val;
  setGlobalSettings(settings);
  setGlobalSchedule({ ...getGlobalSchedule(), nextPostTime: now() + val * 60 * 1000 });
  await ctx.editMessageText(`✅ Frequency updated to every ${val} minutes.`, {
    reply_markup: buildFreqKeyboard(),
  });
});

export default composer;
