import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";

const savedLang = localStorage.getItem("myrace-language") ?? "de";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      de: { translation: de },
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
    },
    lng: savedLang,
    fallbackLng: "de",
    interpolation: { escapeValue: false },
  });

export default i18n;
