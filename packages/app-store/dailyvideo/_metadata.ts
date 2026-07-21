import process from "node:process";
import type { AppMeta } from "@calcom/types/App";

export const metadata = {
  name: "Reunión online",
  description:
    "Videoconferencia web integrada, minimalista y liviana, con la mayoría de las funciones que necesitás.",
  installed: !!process.env.DAILY_API_KEY,
  type: "daily_video",
  variant: "conferencing",
  url: "https://daily.co",
  categories: ["conferencing"],
  logo: "icon.svg",
  publisher: "Agenda Systemlabs",
  category: "conferencing",
  slug: "daily-video",
  title: "Reunión online",
  isGlobal: true,
  email: "help@cal.com",
  appData: {
    location: {
      linkType: "dynamic",
      type: "integrations:daily",
      label: "Reunión online",
    },
  },
  key: { apikey: process.env.DAILY_API_KEY },
  dirName: "dailyvideo",
  isOAuth: false,
} as AppMeta;

export default metadata;
