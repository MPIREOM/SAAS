import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { leases } from "./tenants";
import { maintenanceRequests } from "./maintenance";
import { owners, commissionTypeEnum } from "./owners";

// ── Enums ──────────────────────────────────────────────────────────────────

export const unitTypeEnum = pgEnum("unit_type", [
  "studio",
  "1br",
  "2br",
  "3br",
  "4br",
  "penthouse",
  "office",
  "shop",
  "warehouse",
]);

export const unitStatusEnum = pgEnum("unit_status", [
  "vacant",
  "occupied",
  "maintenance",
]);

// ── Properties ─────────────────────────────────────────────────────────────

export const properties = pgTable("properties", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  location: text("location"),
  totalUnits: integer("total_units"),
  propertyType: text("property_type"),
  isArchived: boolean("is_archived").notNull().default(false),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  ownerId: uuid("owner_id").references(() => owners.id, {
    onDelete: "set null",
  }),
  commissionType: commissionTypeEnum("commission_type").notNull().default("none"),
  commissionRate: numeric("commission_rate").notNull().default("0"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [properties.createdBy],
    references: [users.id],
  }),
  owner: one(owners, {
    fields: [properties.ownerId],
    references: [owners.id],
  }),
  units: many(units),
}));

// ── Units ──────────────────────────────────────────────────────────────────

export const units = pgTable(
  "units",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    unitNumber: text("unit_number").notNull(),
    floor: integer("floor"),
    unitType: unitTypeEnum("unit_type"),
    bedrooms: integer("bedrooms"),
    sizeSqm: numeric("size_sqm"),
    rentAmount: numeric("rent_amount").notNull(),
    status: unitStatusEnum("status").notNull().default("vacant"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    uniquePropertyUnit: unique("unique_property_unit").on(
      table.propertyId,
      table.unitNumber,
    ),
  }),
);

export const unitsRelations = relations(units, ({ one, many }) => ({
  property: one(properties, {
    fields: [units.propertyId],
    references: [properties.id],
  }),
  leases: many(leases),
  maintenanceRequests: many(maintenanceRequests),
}));
