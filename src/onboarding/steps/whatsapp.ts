import { stepHeader, success, fail, info, spinner } from "../utils/ui.js";
import { askText, askSecret, askYesNo } from "../utils/prompt.js";

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  ownerPhone: string;
  webhookPort: number;
}

export async function setupWhatsApp(): Promise<WhatsAppConfig | null> {
  stepHeader(2, "WhatsApp Business einrichten");

  console.log(`
  Voraussetzungen:
  1. Meta Business Account + App erstellt
  2. WhatsApp Business API aktiviert
  3. Permanenter Access Token generiert
  → Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
`);

  const phoneNumberId = await askText("Phone Number ID:");
  if (!phoneNumberId.trim()) { fail("Phone Number ID fehlt"); return null; }

  const accessToken = await askSecret("Access Token:");
  if (!accessToken.trim()) { fail("Access Token fehlt"); return null; }

  // Validate via Graph API
  const spin = spinner("Verbindung wird geprüft...");
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      spin.succeed("WhatsApp Business API verbunden");
    } else {
      spin.fail("API-Verbindung fehlgeschlagen — prüfe Phone Number ID und Access Token");
      const cont = await askYesNo("Trotzdem fortfahren?", false);
      if (!cont) return null;
    }
  } catch {
    spin.fail("Netzwerkfehler bei der Validierung");
    const cont = await askYesNo("Trotzdem fortfahren?", false);
    if (!cont) return null;
  }

  const verifyToken = await askText("Webhook Verify Token (frei wählbar):", `geofrey-${Date.now()}`);
  const ownerPhone = await askText("Deine Telefonnummer (mit Ländercode, z.B. 491234567890):");
  if (!ownerPhone.trim()) { fail("Telefonnummer fehlt"); return null; }

  const portStr = await askText("Webhook Port:", "3000");
  const webhookPort = parseInt(portStr, 10);

  info("WICHTIG: Aktiviere 'Erweiterten Chat-Datenschutz' in WhatsApp");
  info("→ Einstellungen > Datenschutz > Erweiterter Chat-Datenschutz");

  return { phoneNumberId, accessToken, verifyToken, ownerPhone, webhookPort };
}
