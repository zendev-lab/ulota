import sharedZhCN from "./messages/shared-zh-CN.json";
import zhCN from "./messages/zh-CN.json";
import sharedEn from "./messages/shared-en.json";
import en from "./messages/en.json";
import {
  getCommonMessages,
  resolveRequestLocale,
  type SparkLocale,
  type SparkLocaleRequest,
} from "@zendev-lab/spark-i18n";

export const localeCookieName = "spark_web_locale";

export type SparkWebMessages = typeof en;

type SparkWebSharedMessages = typeof sharedEn & {
  status: Record<string, string>;
};

const dictionaries = {
  en: { web: en, shared: sharedEn },
  "zh-CN": { web: zhCN, shared: sharedZhCN },
} satisfies Record<SparkLocale, { web: SparkWebMessages; shared: typeof sharedEn }>;

export interface SparkWebDictionary {
  shared: SparkWebSharedMessages;
  web: SparkWebMessages;
}

export function getDictionary(locale: SparkLocale): SparkWebDictionary {
  return {
    shared: {
      ...dictionaries[locale].shared,
      status: getCommonMessages(locale).status,
    },
    web: dictionaries[locale].web,
  };
}

export function resolveLocale(input: SparkLocaleRequest): SparkLocale {
  return resolveRequestLocale(input);
}

export type { SparkLocale };
