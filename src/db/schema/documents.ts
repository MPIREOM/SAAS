import { sql } from "drizzle-orm";
import {
  date,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────────

export const entityTypeEnum = pgEnum("entity_type", ["tenant", "property"]);

export const documentTypeEnum = pgEnum("document_type", [
  "lease_agreement",
  "id_copy",
  "passport",
  "visa",
  "noc",
  "title_deed",
  "permit",
  "insurance",
  "custom",
]);

// ── Documents ──────────────────────────────────────────────────────────────

export const documents = pgTable("documents", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  entityType: entityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  documentType: documentTypeEnum("document_type").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  expiryDate: date("expiry_date"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  uploadedBy: uuid("uploaded_by"),
});
