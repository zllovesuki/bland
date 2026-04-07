export interface ColorEntry {
  value: string | null;
  label: string;
}

export const TEXT_COLORS: ColorEntry[] = [
  { value: null, label: "Default" },
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#f4f4f5", label: "White" },
];

export const BG_COLORS: ColorEntry[] = [
  { value: null, label: "None" },
  { value: "rgba(239,68,68,0.35)", label: "Red" },
  { value: "rgba(234,179,8,0.35)", label: "Yellow" },
  { value: "rgba(34,197,94,0.35)", label: "Green" },
  { value: "rgba(59,130,246,0.35)", label: "Blue" },
  { value: "rgba(139,92,246,0.35)", label: "Violet" },
  { value: "rgba(236,72,153,0.35)", label: "Pink" },
  { value: "rgba(20,184,166,0.35)", label: "Teal" },
  { value: "rgba(249,115,22,0.35)", label: "Orange" },
  { value: "rgba(244,244,245,0.15)", label: "Gray" },
];
