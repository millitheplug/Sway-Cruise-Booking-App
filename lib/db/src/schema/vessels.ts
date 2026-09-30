import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const vesselsTable = pgTable("sway_vessels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  model: text("model").notNull(),
  registration: text("registration").notNull().unique(),
  capacity: integer("capacity").notNull(),
  status: text("status").notNull().default("available"),
  location: text("location").notNull(),
  mileage: integer("mileage").notNull().default(0),
  lastService: date("last_service", { mode: "string" }).notNull(),
  nextService: date("next_service", { mode: "string" }).notNull(),
  fuelPercent: integer("fuel_percent").notNull().default(100),
  imageUrl: text("image_url").notNull(),
});

export const insertVesselSchema = createInsertSchema(vesselsTable).omit({ id: true });
export type InsertVessel = z.infer<typeof insertVesselSchema>;
export type Vessel = typeof vesselsTable.$inferSelect;