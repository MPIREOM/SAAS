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
import { properties, units } from "./properties";
import { users } from "./users";

export const expenseCategoryEnum = pgEnum("expense_category", [
  "maintenance",
  "insurance",
  "utilities",
  "cleaning",
  "legal",
  "taxes",
  "management_fees",
  "other",
]);

export const expenses = pgTable("expenses", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  unitId: uuid("unit_id").references(() => units.id, {
    onDelete: "set null",
  }),
  category: expenseCategoryEnum("category").notNull().default("other"),
  description: text("description"),
  amount: numeric("amount").notNull(),
  expenseDate: date("expense_date").notNull(),
  vendor: text("vendor"),
  receiptUrl: text("receipt_url"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const expensesRelations = relations(expenses, ({ one }) => ({
  property: one(properties, {
    fields: [expenses.propertyId],
    references: [properties.id],
  }),
  unit: one(units, {
    fields: [expenses.unitId],
    references: [units.id],
  }),
}));
