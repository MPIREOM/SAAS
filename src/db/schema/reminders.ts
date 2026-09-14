import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { languageEnum } from "./users";

// ── Enums ──────────────────────────────────────────────────────────────────

export const reminderTypeEnum = pgEnum("reminder_type", [
  "rent_upcoming",
  "rent_overdue",
  "cheque_due",
  "lease_expiry",
]);

export const channelEnum = pgEnum("channel", ["whatsapp", "email"]);

export const reminderStatusEnum = pgEnum("reminder_status", [
  "sent",
  "failed",
  "pending",
]);

// ── Reminder Logs ──────────────────────────────────────────────────────────

export const reminderLogs = pgTable("reminder_logs", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  reminderType: reminderTypeEnum("reminder_type").notNull(),
  channel: channelEnum("channel").notNull(),
  templateName: text("template_name"),
  messageContent: text("message_content"),
  status: reminderStatusEnum("status").notNull().default("pending"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  /** Meta message id (wamid) for WhatsApp sends; matches delivery receipts. */
  providerMessageId: text("provider_message_id"),
  /** Latest WhatsApp receipt: sent | delivered | read | failed. */
  deliveryStatus: text("delivery_status"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  deliveryError: text("delivery_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const reminderLogsRelations = relations(reminderLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [reminderLogs.tenantId],
    references: [tenants.id],
  }),
}));

// ── Reminder Settings ─────────────────────────────────────────────────────

export const reminderSettings = pgTable("reminder_settings", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  reminderType: reminderTypeEnum("reminder_type").notNull().unique(),
  daysBefore: integer("days_before").array().notNull().default(sql`'{}'`),
  repeatIntervalDays: integer("repeat_interval_days"),
  /** Overdue only: notices per newly overdue invoice (null = default 3). */
  maxRepeats: integer("max_repeats"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ── Notification Templates ─────────────────────────────────────────────────

export const notificationTemplates = pgTable("notification_templates", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  reminderType: reminderTypeEnum("reminder_type").notNull(),
  channel: channelEnum("channel").notNull(),
  language: languageEnum("language").notNull().default("en"),
  subject: text("subject"),
  bodyTemplate: text("body_template").notNull(),
  whatsappTemplateName: text("whatsapp_template_name"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
