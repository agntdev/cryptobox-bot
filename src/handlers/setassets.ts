import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getGlobalSettings, setGlobalSettings } from "../scheduler.js";

const composer = new Composer<Ctx>();

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

const COMMON_ASSETS: { id: string; symbol: string }[] = [
  { id: "bitcoin", symbol: "BTC" },
  { id: "ethereum", symbol: "ETH" },
  { id: "solana", symbol: "SOL" },
  { id: "dogecoin", symbol: "DOGE" },
  { id: "cardano", symbol: "ADA" },
  { id: "polkadot", symbol: "DOT" },
  { id: "ripple", symbol: "XRP" },
  { id: "avalanche-2", symbol: "AVAX" },
];

function buildAssetToggle(tracked: string[]): ReturnType<typeof inlineKeyboard> {
  const rows: ReturnType<typeof inlineButton>[][] = [];
  for (const asset of COMMON_ASSETS) {
    const active = tracked.includes(asset.id);
    const prefix = active ? "✅" : "⬜";
    rows.push([inlineButton(`${prefix} ${asset.symbol}`, `setassets:toggle:${asset.id}`)]);
  }
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  return inlineKeyboard(rows);
}

function formatAssetStatus(tracked: string[]): string {
  const active = tracked
    .map((id) => COMMON_ASSETS.find((a) => a.id === id)?.symbol ?? id.toUpperCase())
    .join(", ");
  return [
    "🪙 Tracked Assets",
    "",
    `Current: ${active || "None"}`,
    "",
    "Tap to toggle an asset on or off:",
  ].join("\n");
}

composer.command("setassets", async (ctx) => {
  const args = ctx.message?.text?.split(/\s+/).slice(1);
  if (args && args.length > 0) {
    const symbols = args[0].split(",").map((s) => s.trim().toLowerCase());
    const validIds: string[] = [];
    for (const sym of symbols) {
      const asset = COMMON_ASSETS.find(
        (a) => a.symbol.toLowerCase() === sym || a.id === sym,
      );
      if (asset) validIds.push(asset.id);
    }
    if (validIds.length === 0) {
      await ctx.reply(
        "❌ No valid assets found. Use comma-separated symbols like: BTC, ETH, SOL",
      );
      return;
    }
    const settings = getGlobalSettings();
    settings.trackedAssets = validIds;
    setGlobalSettings(settings);
    await ctx.reply(`✅ Tracking: ${validIds.map((id) => COMMON_ASSETS.find((a) => a.id === id)?.symbol ?? id.toUpperCase()).join(", ")}`);
    return;
  }
  await ctx.reply(formatAssetStatus(getGlobalSettings().trackedAssets), {
    reply_markup: buildAssetToggle(getGlobalSettings().trackedAssets),
  });
});

composer.callbackQuery("setassets:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const tracked = getGlobalSettings().trackedAssets;
  await ctx.editMessageText(formatAssetStatus(tracked), {
    reply_markup: buildAssetToggle(tracked),
  });
});

composer.callbackQuery(/^setassets:toggle:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const assetId = ctx.match[1];
  const settings = getGlobalSettings();
  const tracked = [...settings.trackedAssets];
  const idx = tracked.indexOf(assetId);
  if (idx >= 0) {
    tracked.splice(idx, 1);
  } else {
    tracked.push(assetId);
  }
  settings.trackedAssets = tracked;
  setGlobalSettings(settings);
  await ctx.editMessageText(formatAssetStatus(tracked), {
    reply_markup: buildAssetToggle(tracked),
  });
});

export default composer;
