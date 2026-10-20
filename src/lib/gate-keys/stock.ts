import { createClient } from "@supabase/supabase-js";
import { buildAdminEmailHtml, notifyAdmins, sanitiseTemplateParam } from "@/lib/notifications/admin-notify";
import { GATE_KEY_LOW_STOCK_TEMPLATE } from "./template";

// Spare gate key stock per building (migration 054). Sales are taken out of
// stock by a database trigger on tenant_violations; this module sends the
// admins one WhatsApp alert when a building's stock falls to its reorder
// level, and the dashboard keeps warning until it's restocked.

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Called after keys are sold for a property. If its stock is at or below the
 * reorder level and the admins haven't been told since the last restock,
 * WhatsApp them once. Never throws; returns the stock left (null when the
 * property's stock isn't tracked).
 */
export async function alertIfGateKeysLow(propertyId: string): Promise<number | null> {
  try {
    const db = serviceClient();
    const { data: property } = await db
      .from("properties")
      .select("name, gate_key_stock, gate_key_low_threshold, gate_key_low_alerted_at")
      .eq("id", propertyId)
      .maybeSingle();
    if (!property || property.gate_key_stock === null) return null;
    const stock = Number(property.gate_key_stock);
    const threshold = Number(property.gate_key_low_threshold);
    if (stock > threshold || property.gate_key_low_alerted_at) return stock;

    // Claim the alert so two sales at once don't both send it.
    const { data: claimed } = await db
      .from("properties")
      .update({ gate_key_low_alerted_at: new Date().toISOString() })
      .eq("id", propertyId)
      .is("gate_key_low_alerted_at", null)
      .select("id");
    if (!claimed?.length) return stock;

    const { data: recipients } = await db
      .from("admin_notification_recipients")
      .select("name, phone, notify_whatsapp")
      .eq("is_active", true)
      .eq("notify_whatsapp", true);

    const name = property.name as string;
    const result = await notifyAdmins(
      (recipients ?? []).map((r) => ({
        name: (r.name as string) || "Admin",
        email: null,
        phone: (r.phone as string | null) ?? null,
        notify_email: false,
        notify_whatsapp: true,
      })),
      {
        subject: `Gate keys running low — ${name}`,
        emailHtml: buildAdminEmailHtml({ title: "Gate keys running low", sections: [] }),
        whatsappText: [
          `🔑 *Gate keys running low*`,
          ``,
          `📍 *Property:* ${name}`,
          `🔑 *Keys left:* ${stock}`,
          `⚠️ *Reorder level:* ${threshold}`,
          ``,
          `Please buy more gate keys and add them to the stock in MPIRE.`,
        ].join("\n"),
        whatsappTemplate: {
          name: GATE_KEY_LOW_STOCK_TEMPLATE.name,
          languageCode: GATE_KEY_LOW_STOCK_TEMPLATE.language,
          parameters: [name, String(stock), String(threshold)].map(sanitiseTemplateParam),
          fallbackToText: true,
        },
      }
    );

    // Nobody got it: release the claim so the next sale tries again.
    if (result.whatsappSent === 0) {
      console.error("[gate-keys] low stock alert not delivered", { propertyId, failures: result.failures });
      await db.from("properties").update({ gate_key_low_alerted_at: null }).eq("id", propertyId);
    }
    return stock;
  } catch (err) {
    console.error("[gate-keys] low stock alert failed", { propertyId, err });
    return null;
  }
}
