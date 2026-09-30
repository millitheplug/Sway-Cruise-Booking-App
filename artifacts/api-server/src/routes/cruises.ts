import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  CreateBookingBody,
  CreateBookingResponse,
  ListCruisesResponse,
} from "@workspace/api-zod";
import {
  activityTable,
  bookingsTable,
  cruisesTable,
  db,
  vesselsTable,
} from "@workspace/db";
import {
  bookingReference,
  ensureSwaySeedData,
  getCruiseById,
} from "../lib/sway-data";

const router: IRouter = Router();

router.get("/cruises", async (_req, res): Promise<void> => {
  await ensureSwaySeedData();
  const cruises = await db
    .select()
    .from(cruisesTable)
    .where(eq(cruisesTable.active, 1));
  const response = ListCruisesResponse.parse(
    cruises.map((cruise) => ({
      ...cruise,
      pricePerPerson: cruise.pricePerPerson / 100,
    })),
  );
  res.json(response);
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await ensureSwaySeedData();
  const input = parsed.data;
  const cruise = await getCruiseById(input.cruiseId);
  if (!cruise || cruise.active !== 1) {
    res.status(400).json({ error: "That cruise is not currently available." });
    return;
  }
  const departureDate = input.departureDate.toISOString().slice(0, 10);
  if (departureDate < new Date().toISOString().slice(0, 10)) {
    res.status(400).json({ error: "Choose a departure date from today onward." });
    return;
  }
  if (input.passengers > cruise.capacity) {
    res.status(400).json({
      error: `This cruise can accommodate up to ${cruise.capacity} guests.`,
    });
    return;
  }

  const [availableVessel] = await db
    .select()
    .from(vesselsTable)
    .where(eq(vesselsTable.status, "available"))
    .limit(1);
  const reference = bookingReference();
  const [booking] = await db
    .insert(bookingsTable)
    .values({
      reference,
      cruiseId: cruise.id,
      guestName: input.guestName.trim(),
      guestEmail: input.guestEmail.trim().toLowerCase(),
      guestPhone: input.guestPhone?.trim() || null,
      departureDate,
      departureTime: "17:30",
      passengers: input.passengers,
      totalCents: cruise.pricePerPerson * input.passengers,
      status: "requested",
      paymentStatus: "unpaid",
      paymentMethod: "Online card",
      notes: input.notes?.trim() ?? "",
    })
    .returning();

  const response = CreateBookingResponse.parse({
    id: booking.id,
    reference: booking.reference,
    cruiseId: booking.cruiseId,
    cruiseName: cruise.name,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestPhone: booking.guestPhone,
    departureDate: booking.departureDate,
    passengers: booking.passengers,
    total: booking.totalCents / 100,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    createdAt: booking.createdAt.toISOString(),
  });

  await db.insert(activityTable).values({
    kind: "booking",
    title: "New cruise request",
    detail: `${reference} · ${cruise.name} · ${input.passengers} guests${availableVessel ? ` · ${availableVessel.name} available` : ""}`,
  });
  res.status(201).json(response);
});

export default router;