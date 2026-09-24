import { EN_US } from "./locales/en-US";
import { ES } from "./locales/es";
import { ZH_CN } from "./locales/zh-CN";
import { HI } from "./locales/hi";
import { AR } from "./locales/ar";
import { PT_BR } from "./locales/pt-BR";

/**
 * Localization (#49). One canonical system: every user-facing string has a
 * stable key (menu.play, pause.resume, phone.music...) looked up with t().
 * English (en-US) is the master table; a key missing in another language
 * falls back to English, and a key missing in English shows nothing rather
 * than an id (and is logged in development). Gameplay code never branches on
 * the language: it asks t() for the words.
 *
 * Placeholders are named, {item}, {amount}: never glued-together fragments.
 * Plurals use the language's own rules (Intl.PluralRules): a key's forms live
 * under key.one, key.few, key.many, key.other as that language needs.
 *
 * Player-made text (usernames, chat, replay and build names), brand names
 * and place names are never translated.
 */
export type Locale = "en-US" | "es" | "zh-CN" | "hi" | "ar" | "pt-BR";
export type Table = Record<string, string>;
export const LOCALES: { code: Locale; native: string; english: string; dir: "ltr" | "rtl" }[] = [
  { code: "en-US", native: "English", english: "English", dir: "ltr" },
  { code: "es", native: "Español", english: "Spanish", dir: "ltr" },
  { code: "zh-CN", native: "简体中文", english: "Chinese (Simplified)", dir: "ltr" },
  { code: "hi", native: "हिन्दी", english: "Hindi", dir: "ltr" },
  { code: "ar", native: "العربية", english: "Arabic", dir: "rtl" },
  { code: "pt-BR", native: "Português (Brasil)", english: "Portuguese (Brazil)", dir: "ltr" },
];
export const TABLES: Record<Locale, Table> = { "en-US": EN_US, es: ES, "zh-CN": ZH_CN, hi: HI, ar: AR, "pt-BR": PT_BR };

let current: Locale = "en-US";
const listeners = new Set<(locale: Locale) => void>();
const warned = new Set<string>();

export const isLocale = (v: unknown): v is Locale => LOCALES.some((l) => l.code === v);
export const locale = () => current;
export const direction = (code: Locale = current) => LOCALES.find((l) => l.code === code)!.dir;

/** Switches the language: the document's lang and direction follow, and listeners re-render. */
export function setLocale(code: Locale) {
  if (!isLocale(code)) code = "en-US";
  const changed = code !== current;
  current = code;
  if (typeof document !== "undefined") {
    document.documentElement.lang = code;
    document.documentElement.dir = direction(code);
    document.body?.classList.toggle("rtl", direction(code) === "rtl");
  }
  if (changed) for (const f of listeners) f(code);
}
export function onLocale(f: (locale: Locale) => void) { listeners.add(f); return () => listeners.delete(f); }

const fill = (text: string, params?: Record<string, string | number>) =>
  params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? formatValue(params[name]) : m)) : text;
const formatValue = (v: string | number) => (typeof v === "number" ? new Intl.NumberFormat(current).format(v) : v);

/** The words for `key` in the current language (English when it has none). */
export function t(key: string, params?: Record<string, string | number>, code: Locale = current): string {
  const text = TABLES[code][key] ?? TABLES["en-US"][key];
  if (text === undefined) {
    if (!warned.has(key) && typeof import.meta !== "undefined" && (import.meta as any).env?.DEV) { warned.add(key); console.warn("[i18n] missing key", key); }
    return "";
  }
  return fill(text, params);
}
/** A counted phrase with the language's plural rules: key.one / key.few / key.many / key.other. */
export function tn(key: string, count: number, params: Record<string, string | number> = {}, code: Locale = current): string {
  const form = new Intl.PluralRules(code).select(count);
  const table = TABLES[code], english = TABLES["en-US"];
  const text = table[`${key}.${form}`] ?? table[`${key}.other`] ?? english[`${key}.${new Intl.PluralRules("en-US").select(count)}`] ?? english[`${key}.other`];
  return text === undefined ? "" : fill(text, { ...params, count });
}
/** Every key a table is missing against English (tests, and a dev coverage report). */
export const missingKeys = (code: Locale) => Object.keys(EN_US).filter((k) => !(k in TABLES[code]));
