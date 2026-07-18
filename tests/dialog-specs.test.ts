import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { buildBot } from "../src/bot";
import { runSpec } from "../src/toolkit/harness/runner";
import { parseBotSpecs } from "../src/toolkit/harness/run-specs";
import type { BotSpec } from "../src/toolkit/harness/types";
import { resetGlobalConfig } from "../src/scheduler";

const SPECS_DIR = join(process.cwd(), "tests", "specs");

describe("dialog specs (the publish gate replays these)", () => {
  it("every tests/specs/*.json spec passes against the real bot", async () => {
    if (!existsSync(SPECS_DIR)) return;
    const files = readdirSync(SPECS_DIR).filter((f) => f.endsWith(".json"));
    if (files.length === 0) return;
    const specs: BotSpec[] = files.flatMap((f) =>
      parseBotSpecs(JSON.parse(readFileSync(join(SPECS_DIR, f), "utf8"))),
    );

    const results = [];
    for (const spec of specs) {
      resetGlobalConfig();
      const bot = await buildBot("123456:TEST");
      const result = await runSpec(bot, spec);
      results.push(result);
    }

    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    const header = `${passed}/${results.length} specs passed${failed > 0 ? ` (${failed} failed)` : ""}`;
    const lines = [header];
    for (const r of results) {
      lines.push(`${r.ok ? "✓" : "✗"} ${r.name}`);
      if (!r.ok) {
        r.steps.forEach((st, i) => {
          if (!st.ok) lines.push(`    step ${i + 1}: ${st.failures.join("; ")}`);
        });
      }
    }
    expect(failed, "\n" + lines.join("\n")).toBe(0);
  });
});
