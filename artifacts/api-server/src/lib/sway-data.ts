import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  activityTable,
  bookingsTable,
  cruisesTable,
  db,
  operationalAlertsTable,
  vesselsTable,
} from "@workspace/db";

let seedPromise: Promise<void> | undefined;

export function addDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function bookingReference(): string {
  return `SWY-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function ensureSwaySeedData(): Promise<void> {
  if (!seedPromise) {
    seedPromise = db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: cruisesTable.id }).from(cruisesTable).limit(1);
      if (existing) return;

      const cruises = await tx
        .insert(cruisesTable)
        .values([
          {
            name: "Golden Hour",
            tagline: "The city, softened by sunset.",
            route: "Harbor loop · Lighthouse Point",
            durationHours: 2.5,
            capacity: 12,
            pricePerPerson: 18500,
            rating: 4.98,
            imageUrl: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1400&q=85",
            departure: "Marina Pier 4",
            highlights: ["Golden-hour skyline", "A welcome drink", "Small-group sailing"],
          },
          {
            name: "Blue Current",
            tagline: "A little further from everything.",
            route: "Open water · North Cove",
            durationHours: 4,
            capacity: 10,
            pricePerPerson: 32000,
            rating: 4.96,
            imageUrl: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1400&q=85",
            departure: "Marina Pier 4",
            highlights: ["Swim stop", "Fresh lunch", "Captain-led coastal tour"],
          },
          {
            name: "Afterglow",
            tagline: "The best stories start after dark.",
            route: "Harbor lights · Old Town",
            durationHours: 3,
            capacity: 14,
            pricePerPerson: 24500,
            rating: 4.94,
            imageUrl: "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=1400&q=85",
            departure: "West Quay",
            highlights: ["Night-sky views", "Live jazz set", "Late-night tasting board"],
          },
        ])
        .returning();

      const vessels = await tx
        .insert(vesselsTable)
        .values([
          {
            name: "Pearl Current",
            model: "Aquila 36 Sport",
            registration: "SWY-042",
            capacity: 12,
            status: "on_cruise",
            location: "North Cove",
            mileage: 1842,
            lastService: addDays(-86),
            nextService: addDays(4),
            fuelPercent: 72,
            imageUrl: "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=900&q=80",
          },
          {
            name: "Solstice",
            model: "Sea Ray Sundancer 320",
            registration: "SWY-018",
            capacity: 10,
            status: "available",
            location: "Marina Pier 4",
            mileage: 936,
            lastService: addDays(-28),
            nextService: addDays(32),
            fuelPercent: 96,
            imageUrl: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=900&q=80",
          },
          {
            name: "Little Wave",
            model: "Beneteau Flyer 9",
            registration: "SWY-106",
            capacity: 8,
            status: "maintenance",
            location: "Service dock",
            mileage: 2230,
            lastService: addDays(-171),
            nextService: addDays(0),
            fuelPercent: 41,
            imageUrl: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&w=900&q=80",
          },
          {
            name: "Sundaze",
            model: "Jeanneau Leader 10",
            registration: "SWY-073",
            capacity: 14,
            status: "available",
            location: "West Quay",
            mileage: 1274,
            lastService: addDays(-52),
            nextService: addDays(18),
            fuelPercent: 83,
            imageUrl: "https://images.unsplash.com/photo-1530053969600-caed2596d242?auto=format&fit=crop&w=900&q=80",
          },
        ])
        .returning();

      await tx.insert(bookingsTable).values([
        {
          reference: "SWY-24A81C",
          cruiseId: cruises[0].id,
          vesselId: vessels[1].id,
          guestName: "Amara Okafor",
          guestEmail: "amara@example.com",
          guestPhone: "+234 801 555 0142",
          departureDate: addDays(1),
          departureTime: "17:30",
          passengers: 2,
          totalCents: cruises[0].pricePerPerson * 2,
          status: "confirmed",
          paymentStatus: "paid",
          paymentMethod: "Visa ···· 0428",
        },
        {
          reference: "SWY-81C029",
          cruiseId: cruises[1].id,
          vesselId: null,
          guestName: "Noah Williams",
          guestEmail: "noah@example.com",
          guestPhone: "+234 802 555 0183",
          departureDate: addDays(3),
          departureTime: "10:00",
          passengers: 4,
          totalCents: cruises[1].pricePerPerson * 4,
          status: "requested",
          paymentStatus: "unpaid",
          paymentMethod: "Online card",
        },
        {
          reference: "SWY-3F191A",
          cruiseId: cruises[2].id,
          vesselId: vessels[0].id,
          guestName: "Zara Bello",
          guestEmail: "zara@example.com",
          guestPhone: null,
          departureDate: addDays(-1),
          departureTime: "14:00",
          passengers: 3,
          totalCents: cruises[2].pricePerPerson * 3,
          status: "in_progress",
          paymentStatus: "overdue",
          paymentMethod: "Bank transfer",
        },
      ]);

      await tx.insert(operationalAlertsTable).values([
        {
          severity: "critical",
          category: "Return",
          title: "Return check-in overdue",
          detail: "Pearl Current was expected back 38 minutes ago.",
          vesselId: vessels[0].id,
        },
        {
          severity: "warning",
          category: "Maintenance",
          title: "Service due soon",
          detail: "Little Wave has reached its scheduled service interval.",
          vesselId: vessels[2].id,
        },
        {
          severity: "warning",
          category: "Payment",
          title: "Payment follow-up needed",
          detail: "One active booking still has an outstanding balance.",
        },
      ]);

      await tx.insert(activityTable).values([
        {
          kind: "booking",
          title: "Booking confirmed",
          detail: "SWY-24A81C · Golden Hour · 2 guests",
        },
        {
          kind: "fleet",
          title: "Vessel check-in missed",
          detail: "Pearl Current · North Cove",
        },
        {
          kind: "maintenance",
          title: "Service reminder created",
          detail: "Little Wave · scheduled maintenance",
        },
      ]);
    }).catch((error: unknown) => {
      seedPromise = undefined;
      throw error;
    });
  }
  await seedPromise;
}

export async function recordActivity(
  kind: string,
  title: string,
  detail: string,
): Promise<void> {
  await db.insert(activityTable).values({ kind, title, detail });
}

export async function getLatestBookings(limit = 500) {
  return db
    .select()
    .from(bookingsTable)
    .orderBy(desc(bookingsTable.createdAt))
    .limit(limit);
}

export async function getCruiseById(id: number) {
  const [cruise] = await db
    .select()
    .from(cruisesTable)
    .where(eq(cruisesTable.id, id))
    .limit(1);
  return cruise;
}