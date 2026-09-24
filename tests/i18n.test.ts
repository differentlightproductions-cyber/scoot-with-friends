import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCALES, missingKeys, t, tn, direction, TABLES } from "../src/i18n/index.ts";

test("every language covers every English key", () => {
  for (const { code } of LOCALES) assert.deepEqual(missingKeys(code), [], code);
});
test("placeholders survive translation and are filled", () => {
  for (const { code } of LOCALES) {
    for (const [key, english] of Object.entries(TABLES["en-US"])) {
      const want = (english.match(/\{\w+\}/g) ?? []).filter((p) => p !== "{count}").sort();
      const got = (TABLES[code][key].match(/\{\w+\}/g) ?? []).filter((p) => p !== "{count}").sort();
      assert.deepEqual(got, want, `${code} ${key}`);
    }
  }
  assert.equal(t("playful.pick_up", { item: t("item.can", {}, "es") }, "es"), "B · Recoger lata vacía");
});
test("a missing key falls back to English, an unknown key to nothing", () => {
  TABLES.es["test.only"] = undefined as any; delete TABLES.es["test.only"];
  TABLES["en-US"]["test.only"] = "ENGLISH";
  assert.equal(t("test.only", {}, "es"), "ENGLISH");
  delete TABLES["en-US"]["test.only"];
  assert.equal(t("no.such.key"), "");
});
test("plurals follow each language's rules", () => {
  assert.equal(tn("reward.credits", 1, {}, "en-US"), "You earned 1 Credit");
  assert.equal(tn("reward.credits", 1200, {}, "en-US"), "You earned 1,200 Credits");
  assert.equal(tn("reward.credits", 1, {}, "ar"), "كسبت Credit واحدًا");
  assert.equal(tn("reward.credits", 1, {}, "pt-BR"), "Você ganhou 1 Credit");
});
test("Arabic reads right to left, the rest left to right", () => {
  assert.equal(direction("ar"), "rtl");
  for (const code of ["en-US", "es", "zh-CN", "hi", "pt-BR"] as const) assert.equal(direction(code), "ltr");
});
