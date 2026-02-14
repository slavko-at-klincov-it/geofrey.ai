import { getLocale } from "../i18n/index.js";

export interface CostLineParams {
  cloudTokens: number;
  cloudCostUsd: number;
  localTokens: number;
}

/**
 * Format a per-request cost line for display after agent responses.
 * Uses locale-aware number formatting (€ comma for DE, $ dot for EN).
 *
 * Example DE: [Cloud: 1.247 Tokens (€0,02) | Lokal: 847 Tokens (€0,00)]
 * Example EN: [Cloud: 1,247 Tokens ($0.02) | Local: 847 Tokens ($0.00)]
 */
export function formatCostLine(params: CostLineParams): string {
  const { cloudTokens, cloudCostUsd, localTokens } = params;
  const locale = getLocale();

  if (cloudTokens === 0 && localTokens === 0) return "";

  const isDE = locale === "de";

  const formatTokens = (n: number): string => {
    if (isDE) return n.toLocaleString("de-DE");
    return n.toLocaleString("en-US");
  };

  const formatCost = (usd: number): string => {
    // Convert USD to EUR approximation for DE display
    if (isDE) {
      const eur = usd * 0.92; // rough EUR conversion
      return `\u20AC${eur.toFixed(2).replace(".", ",")}`;
    }
    return `$${usd.toFixed(2)}`;
  };

  const cloudLabel = isDE ? "Cloud" : "Cloud";
  const localLabel = isDE ? "Lokal" : "Local";

  const parts: string[] = [];

  if (cloudTokens > 0) {
    parts.push(`${cloudLabel}: ${formatTokens(cloudTokens)} Tokens (${formatCost(cloudCostUsd)})`);
  }

  if (localTokens > 0) {
    parts.push(`${localLabel}: ${formatTokens(localTokens)} Tokens (${formatCost(0)})`);
  }

  if (parts.length === 0) return "";
  return `\n\n[${parts.join(" | ")}]`;
}
