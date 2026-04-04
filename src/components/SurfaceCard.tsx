import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  style?: CSSProperties;
};

export default function SurfaceCard({ children, style }: Props) {
  return (
    <div
      style={{
        background: "linear-gradient(160deg,rgba(18,18,36,0.98),rgba(11,16,28,0.94))",
        borderRadius: 20,
        padding: 16,
        border: "1px solid rgba(148,163,184,0.1)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
