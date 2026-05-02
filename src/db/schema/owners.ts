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
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users, languageEnum } from "./users";
import { properties } from "./properties";
import { expenses } from "./expenses";
import { paymentMethodEnum } from "./payments";

export const commissionTypeEnum = pgEnum("commission_type", [
  "percentage",
  "included_in_business_fee",
  "none",
]);

export const settlementDirectionEnum = pgEnum("settlement_direction", [
  "company_to_owner",
  "owner_to_company",
]);

export const owners = pgTable("owners", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  whatsappPhone: text("whatsapp_phone"),
  email: text("email"),
  languagePreference: languageEnum("language_preference")
    .notNull()
    .default("en"),
  openingBalance: numeric("opening_balance").notNull().default("0"),
  openingBalanceDate: date("opening_balance_date")
    .notNull()
    .default(sql`CURRENT_DATE`),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const ownersRelations = relations(owners, ({ many }) => ({
  properties: many(properties),
  businessFees: many(ownerBusinessFees),
  settlements: many(ownerSettlements),
}));

export const ownerBusinessFees = pgTable(
  "owner_business_fees",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    periodMonth: date("period_month").notNull(),
    amount: numeric("amount").notNull().default("1500"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    uniqueOwnerPeriod: unique("owner_business_fees_owner_id_period_month_key").on(
      table.ownerId,
      table.periodMonth,
    ),
  }),
);

export const ownerBusinessFeesRelations = relations(
  ownerBusinessFees,
  ({ one }) => ({
    owner: one(owners, {
      fields: [ownerBusinessFees.ownerId],
      references: [owners.id],
    }),
  }),
);

export const ownerSettlements = pgTable("owner_settlements", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owners.id, { onDelete: "cascade" }),
  direction: settlementDirectionEnum("direction").notNull(),
  amount: numeric("amount").notNull(),
  method: paymentMethodEnum("method").notNull().default("cash"),
  settledAt: date("settled_at")
    .notNull()
    .default(sql`CURRENT_DATE`),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  recordedBy: uuid("recorded_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const ownerSettlementsRelations = relations(
  ownerSettlements,
  ({ one }) => ({
    owner: one(owners, {
      fields: [ownerSettlements.ownerId],
      references: [owners.id],
    }),
  }),
);

export const expenseAttachments = pgTable("expense_attachments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  expenseId: uuid("expense_id")
    .notNull()
    .references(() => expenses.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, {
    onDelete: "set null",
  }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const expenseAttachmentsRelations = relations(
  expenseAttachments,
  ({ one }) => ({
    expense: one(expenses, {
      fields: [expenseAttachments.expenseId],
      references: [expenses.id],
    }),
  }),
);
