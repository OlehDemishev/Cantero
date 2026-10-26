/**
 * Theme-aware styling for recharts. Every value is a CSS variable from app/globals.css, so a chart
 * follows light/dark with no re-render: the `.dark` class swaps the variables underneath it.
 * Spread the props objects onto the recharts elements (`<Tooltip {...chartTooltipProps} />`)
 * rather than wrapping them in components — recharts finds its children by element type.
 */
import type { CSSProperties } from "react";

/** Categorical series colors, in the order a multi-series chart should use them. */
export const CHART_SERIES = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
] as const;

/** Named roles for single-series and status charts. */
export const chartColors = {
  primary: "var(--color-chart-1)",
  warning: "var(--color-chart-2)",
  danger: "var(--color-chart-3)",
  success: "var(--color-chart-4)",
} as const;

export const chartGridProps = { strokeDasharray: "3 3", stroke: "var(--color-chart-grid)" } as const;

/** For <XAxis>/<YAxis>: axis line in the grid color, tick labels in the subtle text color. */
export const chartAxisProps = {
  stroke: "var(--color-chart-grid)",
  tick: { fontSize: 11, fill: "var(--color-chart-axis)" },
} as const;

const tooltipContentStyle: CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  boxShadow: "var(--shadow-theme-md)",
  color: "var(--color-fg)",
  fontSize: 12,
};

/** For <Tooltip>: a surface-colored box instead of recharts' fixed white one. */
export const chartTooltipProps = {
  contentStyle: tooltipContentStyle,
  labelStyle: { color: "var(--color-fg)", fontWeight: 500 },
  // The hover band behind bars / the vertical line on line charts.
  cursor: { fill: "var(--color-chart-cursor)", stroke: "var(--color-chart-grid)" },
};
