import { Composer } from "grammy";
import { readdirSync } from "node:fs";
import { createBot, type BotContext } from "./toolkit/index.js";
import type { AdminSettings, ScheduleState, PostRecord } from "./scheduler.js";
import { DEFAULT_SETTINGS, resetGlobalConfig } from "./scheduler.js";

export interface Session {
  settings: AdminSettings;
  schedule: ScheduleState;
  posts: PostRecord[];
  step?: string;
}

export type Ctx = BotContext<Session>;

export async function buildBot(token: string) {
  resetGlobalConfig();
  const bot = createBot<Session>(token, {
    initial: () => ({
      settings: { ...DEFAULT_SETTINGS },
      schedule: {
        lastPostTime: 0,
        nextPostTime: 0,
        isPaused: false,
      },
      posts: [],
    }),
  });

  const dir = new URL("./handlers/", import.meta.url);
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(
      (f) =>
        (f.endsWith(".js") || f.endsWith(".ts")) &&
        !f.endsWith(".d.ts") &&
        !f.includes(".test.") &&
        !f.includes(".spec."),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    files = [];
  }
  for (const file of files.sort()) {
    const mod = (await import(new URL(file, dir).href)) as { default?: Composer<Ctx> };
    if (!mod.default) {
      throw new Error(`handler ${file} must default-export a grammY Composer`);
    }
    bot.use(mod.default);
  }

  bot.on("message", (ctx) => ctx.reply("Sorry, I didn't understand that. Try /help."));

  return bot;
}
