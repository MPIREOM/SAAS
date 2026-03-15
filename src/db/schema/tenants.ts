import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { units } from "./properties";
import { payments, cheques } from "./payments";
import { maintenanceRequests } from "./maintenance";
import { reminderLogs } from "./reminders";
import { languageEnum } from "./users";

// ── Enums ──────────────────────────────────────────────────────────────────

export const tenantStatusEnum = pgEnum("tenant_status", [
  "active",
  "archived",
]);

// ── Tenants ────────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  nationality: text("nationality"),
  nationalId: text("national_id"),
  phone: text("phone").notNull(),
  email: text("email"),
  emergencyContact: text("emergency_contact"),
  languagePreference: languageEnum("language_preference")
    .notNull()
    .default("en"),
  status: tenantStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  createdBy: uuid("created_by"),
});

export const tenantsRelations = relations(tenants, ({ many }) => ({
  leases: many(leases),
  payments: many(payments),
  cheques: many(cheques),
  maintenanceRequests: many(maintenanceRequests),
  reminderLogs: many(reminderLogs),
}));

// ── Enums (move-out) ────────────────────────────────────────────────────────

export const depositStatusEnum = pgEnum("deposit_status", [
  "pending",
  "refunded",
  "deducted",
]);

// ── Leases ─────────────────────────────────────────────────────────────────

export const leases = pgTable("leases", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  monthlyRent: numeric("monthly_rent").notNull(),
  securityDeposit: numeric("security_deposit"),
  paymentDueDay: integer("payment_due_day").notNull().default(1),
  leaseDocumentUrl: text("lease_document_url"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  // Move-out metadata
  vacateDate: date("vacate_date"),
  vacateReason: text("vacate_reason"),
  vacateNotes: text("vacate_notes"),
  finalInspection: boolean("final_inspection").default(false),
  keysReturned: boolean("keys_returned").default(false),
  depositStatus: depositStatusEnum("deposit_status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  createdBy: uuid("created_by"),
});

export const leasesRelations = relations(leases, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [leases.tenantId],
    references: [tenants.id],
  }),
  unit: one(units, {
    fields: [leases.unitId],
    references: [units.id],
  }),
  payments: many(payments),
}));
