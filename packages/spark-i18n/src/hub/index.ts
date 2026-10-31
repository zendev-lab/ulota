import type { SparkLocale } from "../index.ts";
import en from "./en.json" with { type: "json" };
import zhCN from "./zh-CN.json" with { type: "json" };

export type HubMessages = typeof en;

export const hubDictionaries = {
  en,
  "zh-CN": zhCN as HubMessages,
} satisfies Record<SparkLocale, HubMessages>;

export function getHubDictionary(locale: SparkLocale): HubMessages {
  return hubDictionaries[locale];
}
