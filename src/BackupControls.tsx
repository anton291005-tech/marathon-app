import React from "react";

type Props = {
  logs: Record<string, any>;
  onImportSuccess?: (data: Record<string, any>) => void;
};

export default function BackupControls({ logs, onImportSuccess }: Props) {
  const handleExport = () => {
    try {
      const backupObject = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: logs,
      };

      const blob = new Blob([JSON.stringify(backupObject, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `marathon-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Fehler beim Export:", error);
      alert("Backup konnte nicht erstellt werden.");
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== "string") {
          throw new Error("Datei konnte nicht gelesen werden.");
        }

        const parsed = JSON.parse(text);

        if (!parsed || typeof parsed !== "object") {
          throw new Error("Ungültiges Backup-Format.");
        }

        if (!("data" in parsed) || typeof parsed.data !== "object") {
          throw new Error("Backup enthält keine gültigen Daten.");
        }

        localStorage.setItem("marathonLogs", JSON.stringify(parsed.data));

        try {
          // optional für deine Deployment-Storage-Lösung
          // @ts-ignore
          if (window.storage?.set) {
            // @ts-ignore
            await window.storage.set("mwaw26-logs", JSON.stringify(parsed.data));
          }
        } catch (storageError) {
          console.warn("window.storage konnte nicht aktualisiert werden:", storageError);
        }

        if (onImportSuccess) {
          onImportSuccess(parsed.data);
        }

        alert("Backup erfolgreich importiert.");
      } catch (error) {
        console.error("Fehler beim Import:", error);
        alert("Backup konnte nicht importiert werden. Datei ist ungültig.");
      }
    };

    reader.readAsText(file);
    event.target.value = "";
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        marginTop: 12,
      }}
    >
      <button
        onClick={handleExport}
        style={{
          background: "#1e1e3a",
          color: "#e2e8f0",
          border: "1px solid #334155",
          borderRadius: 10,
          padding: "8px 12px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Backup exportieren
      </button>

      <label
        style={{
          background: "#1e1e3a",
          color: "#e2e8f0",
          border: "1px solid #334155",
          borderRadius: 10,
          padding: "8px 12px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        Backup importieren
        <input
          type="file"
          accept="application/json,.json"
          onChange={handleImport}
          style={{ display: "none" }}
        />
      </label>
    </div>
  );
}