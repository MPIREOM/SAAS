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
import { owners } from "./owners";

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

// Expenses can be tied to a specific property OR to an owner (portfolio-
// wide costs that aren't allocated per building). DB CHECK enforces that
// at least one of the two is set.
export const expenses = pgTable("expenses", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  propertyId: uuid("property_id").references(() => properties.id, {
    onDelete: "cascade",
  }),
  ownerId: uuid("owner_id").references(() => owners.id, {
    onDelete: "set null",
  }),
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
  owner: one(owners, {
    fields: [expenses.ownerId],
    references: [owners.id],
  }),
  unit: one(units, {
    fields: [expenses.unitId],
    references: [units.id],
  }),
}));
