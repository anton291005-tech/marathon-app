import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";

export type TimePickerValue = {
  hours: number;
  minutes: number;
  seconds: number;
};

type Props = {
  value: TimePickerValue;
  onChange: (value: TimePickerValue) => void;
};

const ITEM_HEIGHT = 40;
const VISIBLE_COUNT = 5;
const PAD_SLOTS = Math.floor(VISIBLE_COUNT / 2);
const SCROLL_END_DEBOUNCE_MS = 80;

const HOURS = [0, 1, 2, 3, 4, 5, 6] as const;
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const SECONDS = Array.from({ length: 60 }, (_, i) => i);

const containerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 0,
  background: "#070b16",
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  padding: "8px 4px",
};

const columnWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flex: 1,
  minWidth: 0,
};

const columnStyle: CSSProperties = {
  flex: 1,
  height: ITEM_HEIGHT * VISIBLE_COUNT,
  overflowY: "auto",
  scrollSnapType: "y mandatory",
  WebkitOverflowScrolling: "touch",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

const separatorStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: "#94a3b8",
  padding: "0 2px",
  flexShrink: 0,
  userSelect: "none",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTimePickerValue(value: TimePickerValue): string {
  return `${value.hours}:${pad2(value.minutes)}:${pad2(value.seconds)}`;
}

/** Default scroll-picker values from race distance. */
export function getDefaultTimePickerForDistance(
  km: number | null,
  label: string,
): TimePickerValue {
  const l = label.toLowerCase();
  if ((km != null && km >= 42.2) || /\bmarathon\b/.test(l)) {
    return { hours: 3, minutes: 30, seconds: 0 };
  }
  if ((km != null && km >= 21 && km < 42.2) || /\bhalb/.test(l)) {
    return { hours: 1, minutes: 45, seconds: 0 };
  }
  if (km != null && km < 21) {
    return { hours: 0, minutes: 45, seconds: 0 };
  }
  if (km != null && km > 21) {
    return { hours: 2, minutes: 30, seconds: 0 };
  }
  return { hours: 0, minutes: 45, seconds: 0 };
}

function itemStyle(selected: boolean): CSSProperties {
  return {
    height: ITEM_HEIGHT,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    scrollSnapAlign: "center",
    fontSize: selected ? 22 : 16,
    fontWeight: selected ? 800 : 600,
    color: selected ? "#fff" : "#94a3b8",
    opacity: selected ? 1 : 0.4,
    transition: "font-size 0.15s ease, opacity 0.15s ease",
  };
}

type WheelColumnProps = {
  items: readonly (string | number)[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

function WheelColumn({ items, selectedIndex, onSelect }: WheelColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  const scrollToIndex = useCallback((index: number, smooth: boolean) => {
    const el = ref.current;
    if (!el) return;
    const top = index * ITEM_HEIGHT;
    el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    scrollToIndex(selectedIndex, false);
  }, [selectedIndex, scrollToIndex]);

  const handleScroll = useCallback(() => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const index = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      if (clamped !== selectedIndexRef.current) {
        onSelect(clamped);
      } else {
        scrollToIndex(clamped, true);
      }
    }, SCROLL_END_DEBOUNCE_MS);
  }, [items.length, onSelect, scrollToIndex]);

  useEffect(
    () => () => {
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    },
    [],
  );

  const centerIndex = selectedIndex;

  return (
    <div
      ref={ref}
      style={columnStyle}
      onScroll={handleScroll}
      role="listbox"
      aria-label="Zeitauswahl"
    >
      {Array.from({ length: PAD_SLOTS }).map((_, i) => (
        <div key={`pad-top-${i}`} style={{ height: ITEM_HEIGHT }} aria-hidden />
      ))}
      {items.map((item, i) => (
        <div key={`${item}-${i}`} style={itemStyle(i === centerIndex)} role="option" aria-selected={i === centerIndex}>
          {typeof item === "number" ? pad2(item) : item}
        </div>
      ))}
      {Array.from({ length: PAD_SLOTS }).map((_, i) => (
        <div key={`pad-bot-${i}`} style={{ height: ITEM_HEIGHT }} aria-hidden />
      ))}
    </div>
  );
}

export default function TimePicker({ value, onChange }: Props) {
  const hourIndex = Math.max(0, HOURS.findIndex((h) => h === value.hours));
  const minuteIndex = Math.min(59, Math.max(0, value.minutes));
  const secondIndex = Math.min(59, Math.max(0, value.seconds));

  const hourItems = useMemo(() => [...HOURS], []);
  const minuteItems = useMemo(() => MINUTES, []);
  const secondItems = useMemo(() => SECONDS, []);

  const setHours = useCallback(
    (index: number) => {
      onChange({ ...value, hours: HOURS[index] ?? 0 });
    },
    [onChange, value],
  );

  const setMinutes = useCallback(
    (index: number) => {
      onChange({ ...value, minutes: index });
    },
    [onChange, value],
  );

  const setSeconds = useCallback(
    (index: number) => {
      onChange({ ...value, seconds: index });
    },
    [onChange, value],
  );

  return (
    <div style={containerStyle}>
      <div style={columnWrapStyle}>
        <WheelColumn items={hourItems} selectedIndex={hourIndex >= 0 ? hourIndex : 0} onSelect={setHours} />
      </div>
      <span style={separatorStyle}>:</span>
      <div style={columnWrapStyle}>
        <WheelColumn items={minuteItems} selectedIndex={minuteIndex} onSelect={setMinutes} />
      </div>
      <span style={separatorStyle}>:</span>
      <div style={columnWrapStyle}>
        <WheelColumn items={secondItems} selectedIndex={secondIndex} onSelect={setSeconds} />
      </div>
    </div>
  );
}
