import type { ReactNode } from "react";

/**
 * Kopf eines Tabs: kleine Zeile (Datum, Phase) über dem Titel in `title-l`, rechts ein Chip oder Aktionen
 * (docs/design-system/mockups/heute.html, woche.html).
 */
export function ScreenHeader({ meta, title, children }: { meta?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <header className="mr-screen-head">
      <div className="mr-screen-head__text">
        {meta ? <div className="mr-screen-head__meta">{meta}</div> : null}
        <h1 className="mr-screen-head__title">{title}</h1>
      </div>
      {children ? <div className="mr-screen-head__aside">{children}</div> : null}
    </header>
  );
}
