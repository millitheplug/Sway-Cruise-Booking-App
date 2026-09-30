import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { vesselsTable } from "./vessels";

export const operationalAlertsTable = pgTable("sway_operational_alerts", {
  id: serial("id").primaryKey(),
  severity: text("severity").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  vesselId: integer("vessel_id").references(() => vesselsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
});

export const activityTable = pgTable("sway_activity", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAlertSchema = createInsertSchema(operationalAlertsTable).omit({
  id: true,
  createdAt: true,
});
export const insertActivitySchema = createInsertSchema(activityTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type OperationalAlert = typeof operationalAlertsTable.$inferSelect;
export type Activity = typeof activityTable.$inferSelect;