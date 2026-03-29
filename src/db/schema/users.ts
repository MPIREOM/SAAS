import { relations, sql } from "drizzle-orm";
import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { properties } from "./properties";

// ── Enums ──────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "property_manager",
]);

export const languageEnum = pgEnum("language", ["en", "ar"]);

// ── Users ──────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").unique().notNull(),
  fullName: text("full_name"),
  role: userRoleEnum("role").notNull().default("property_manager"),
  isActive: boolean("is_active").notNull().default(true),
  languagePreference: languageEnum("language_preference")
    .notNull()
    .default("en"),
  avatarUrl: text("avatar_url"),
  whatsappPhone: text("whatsapp_phone").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const usersRelations = relations(users, ({ many }) => ({
  propertyAssignments: many(userPropertyAssignments),
  assignedProperties: many(userPropertyAssignments, {
    relationName: "assignedBy",
  }),
}));

// ── User ↔ Property Assignments ────────────────────────────────────────────

export const userPropertyAssignments = pgTable("user_property_assignments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  assignedBy: uuid("assigned_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const userPropertyAssignmentsRelations = relations(
  userPropertyAssignments,
  ({ one }) => ({
    user: one(users, {
      fields: [userPropertyAssignments.userId],
      references: [users.id],
    }),
    property: one(properties, {
      fields: [userPropertyAssignments.propertyId],
      references: [properties.id],
    }),
    assignedByUser: one(users, {
      fields: [userPropertyAssignments.assignedBy],
      references: [users.id],
      relationName: "assignedBy",
    }),
  }),
);
