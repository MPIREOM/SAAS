import { relations, sql } from "drizzle-orm";
import {
  date,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { leases, tenants } from "./tenants";

// ── Enums ──────────────────────────────────────────────────────────────────

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "bank_transfer",
  "cheque",
]);

export const chequeStatusEnum = pgEnum("cheque_status", [
  "pending",
  "cleared",
  "bounced",
  "cancelled",
]);

// ── Payments ───────────────────────────────────────────────────────────────

export const payments = pgTable("payments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  leaseId: uuid("lease_id")
    .notNull()
    .references(() => leases.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  amount: numeric("amount").notNull(),
  paymentDate: date("payment_date").notNull(),
  method: paymentMethodEnum("method"),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  createdBy: uuid("created_by"),
});

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  lease: one(leases, {
    fields: [payments.leaseId],
    references: [leases.id],
  }),
  tenant: one(tenants, {
    fields: [payments.tenantId],
    references: [tenants.id],
  }),
  cheques: many(cheques),
}));

// ── Cheques ────────────────────────────────────────────────────────────────

export const cheques = pgTable("cheques", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  paymentId: uuid("payment_id").references(() => payments.id, {
    onDelete: "set null",
  }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  chequeNumber: text("cheque_number").notNull(),
  bankName: text("bank_name").notNull(),
  chequeDate: date("cheque_date").notNull(),
  amount: numeric("amount").notNull(),
  status: chequeStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const chequesRelations = relations(cheques, ({ one }) => ({
  payment: one(payments, {
    fields: [cheques.paymentId],
    references: [payments.id],
  }),
  tenant: one(tenants, {
    fields: [cheques.tenantId],
    references: [tenants.id],
  }),
}));
