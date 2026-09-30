import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const cruisesTable = pgTable("sway_cruises", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  route: text("route").notNull(),
  durationHours: real("duration_hours").notNull(),
  capacity: integer("capacity").notNull(),
  pricePerPerson: integer("price_per_person_cents").notNull(),
  rating: real("rating").notNull(),
  imageUrl: text("image_url").notNull(),
  departure: text("departure").notNull(),
  highlights: text("highlights").array().notNull(),
  active: integer("active").notNull().default(1),
});

export const insertCruiseSchema = createInsertSchema(cruisesTable).omit({ id: true });
export type InsertCruise = z.infer<typeof insertCruiseSchema>;
export type Cruise = typeof cruisesTable.$inferSelect;