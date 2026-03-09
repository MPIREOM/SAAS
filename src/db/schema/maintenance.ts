import { relations, sql } from "drizzle-orm";
import {
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { units } from "./properties";
import { tenants } from "./tenants";

// ── Enums ──────────────────────────────────────────────────────────────────

export const maintenanceCategoryEnum = pgEnum("maintenance_category", [
  "plumbing",
  "electrical",
  "ac",
  "structural",
  "other",
]);

export const maintenanceUrgencyEnum = pgEnum("maintenance_urgency", [
  "low",
  "medium",
  "high",
  "emergency",
]);

export const maintenanceStatusEnum = pgEnum("maintenance_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

// ── Maintenance Requests ───────────────────────────────────────────────────

export const maintenanceRequests = pgTable("maintenance_requests", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, {
    onDelete: "set null",
  }),
  category: maintenanceCategoryEnum("category"),
  description: text("description").notNull(),
  urgency: maintenanceUrgencyEnum("urgency").notNull().default("medium"),
  status: maintenanceStatusEnum("status").notNull().default("open"),
  assignedToName: text("assigned_to_name"),
  assignedToPhone: text("assigned_to_phone"),
  estimatedCost: numeric("estimated_cost"),
  actualCost: numeric("actual_cost"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  createdBy: uuid("created_by"),
});

export const maintenanceRequestsRelations = relations(
  maintenanceRequests,
  ({ one, many }) => ({
    unit: one(units, {
      fields: [maintenanceRequests.unitId],
      references: [units.id],
    }),
    tenant: one(tenants, {
      fields: [maintenanceRequests.tenantId],
      references: [tenants.id],
    }),
    notes: many(maintenanceNotes),
    attachments: many(maintenanceAttachments),
  }),
);

// ── Maintenance Notes ──────────────────────────────────────────────────────

export const maintenanceNotes = pgTable("maintenance_notes", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  requestId: uuid("request_id")
    .notNull()
    .references(() => maintenanceRequests.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const maintenanceNotesRelations = relations(
  maintenanceNotes,
  ({ one }) => ({
    request: one(maintenanceRequests, {
      fields: [maintenanceNotes.requestId],
      references: [maintenanceRequests.id],
    }),
  }),
);

// ── Maintenance Attachments ────────────────────────────────────────────────

export const maintenanceAttachments = pgTable("maintenance_attachments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  requestId: uuid("request_id")
    .notNull()
    .references(() => maintenanceRequests.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const maintenanceAttachmentsRelations = relations(
  maintenanceAttachments,
  ({ one }) => ({
    request: one(maintenanceRequests, {
      fields: [maintenanceAttachments.requestId],
      references: [maintenanceRequests.id],
    }),
  }),
);
