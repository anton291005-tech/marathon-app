import { createContext, useContext, useState } from "react";
import { changeLanguage } from "i18next";
import "../i18n";

type Language = "de" | "en" | "fr" | "es";

const LANGUAGE_LABELS: Record<Language, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  es: "Español",
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  languageLabels: typeof LANGUAGE_LABELS;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "de",
  setLanguage: () => {},
  languageLabels: LANGUAGE_LABELS,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(
    () => (localStorage.getItem("myrace-language") as Language) ?? "de"
  );

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    void changeLanguage(lang);
    localStorage.setItem("myrace-language", lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, languageLabels: LANGUAGE_LABELS }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
