const path = require("node:path");
const i18n = require("../../i18n.json");

/** @type {import("next-i18next").UserConfig} */
const config = {
  i18n: {
    // Runtime default is Spanish (this instance serves Chile) - kept separate from
    // i18n.locale.source, which stays "en" because that's the reference language
    // the lingo.dev translation pipeline authors strings in.
    defaultLocale: "es",
    locales: i18n.locale.targets.concat([i18n.locale.source]),
  },
  fallbackLng: {
    default: ["es"],
    zh: ["zh-CN"],
  },
  reloadOnPrerender: process.env.NODE_ENV !== "production",
  localePath: path.resolve(__dirname, "./locales"),
};

module.exports = config;
