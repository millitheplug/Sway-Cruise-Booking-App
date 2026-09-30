import { createInsertSchema } from "drizzle-zod";
import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { cruisesTable } from "./cruises";
import { vesselsTable } from "./vessels";

export const bookingsTable = pgTable("sway_bookings", {
  id: serial("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  cruiseId: integer("cruise_id")
    .notNull()
    .references(() => cruisesTable.id),
  vesselId: integer("vessel_id").references(() => vesselsTable.id),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email").notNull(),
  guestPhone: text("guest_phone"),
  departureDate: date("departure_date", { mode: "string" }).notNull(),
  departureTime: text("departure_time").notNull().default("17:30"),
  passengers: integer("passengers").notNull(),
  totalCents: integer("total_cents").notNull(),
  status: text("status").notNull().default("requested"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paymentMethod: text("payment_method").notNull().default("Online card"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;