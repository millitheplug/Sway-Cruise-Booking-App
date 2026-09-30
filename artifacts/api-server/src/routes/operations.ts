import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  GetAdminOverviewResponse,
  GetMonitoringResponse,
  GetRevenueResponse,
  ListActivityResponse,
  ListAdminBookingsQueryParams,
  ListAdminBookingsResponse,
  ListFleetResponse,
  UpdateBookingBody,
  UpdateBookingParams,
  UpdateBookingResponse,
  UpdateVesselBody,
  UpdateVesselParams,
  UpdateVesselResponse,
} from "@workspace/api-zod";
import {
  activityTable,
  bookingsTable,
  cruisesTable,
  db,
  operationalAlertsTable,
  vesselsTable,
} from "@workspace/db";
import {
  addDays,
  ensureSwaySeedData,
  getLatestBookings,
  recordActivity,
} from "../lib/sway-data";

const router: IRouter = Router();

function monthRange() {
  const current = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - (5 - index), 1));
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date),
    };
  });
}

function buildRevenueTrend(
  bookings: Awaited<ReturnType<typeof getLatestBookings>>,
) {
  return monthRange().map(({ key, label }) => ({
    label,
    value: bookings
      .filter(
        (booking) =>
          booking.status !== "cancelled" &&
          booking.createdAt.toISOString().slice(0, 7) === key,
      )
      .reduce((sum, booking) => sum + booking.totalCents, 0) / 100,
  }));
}

function mapAlert(
  alert: typeof operationalAlertsTable.$inferSelect,
  vesselName?: string | null,
) {
  return {
    id: alert.id,
    severity: alert.severity,
    category: alert.category,
    title: alert.title,
    detail: alert.detail,
    vesselName: vesselName ?? null,
    createdAt: alert.createdAt.toISOString(),
    resolved: alert.resolved,
  };
}

router.get("/admin/overview", async (_req, res): Promise<void> => {
  await ensureSwaySeedData();
  const [bookings, vessels, alerts] = await Promise.all([
    getLatestBookings(),
    db.select().from(vesselsTable),
    db
      .select()
      .from(operationalAlertsTable)
      .where(eq(operationalAlertsTable.resolved, false))
      .orderBy(desc(operationalAlertsTable.createdAt)),
  ]);
  const activeFleet = vessels.filter(
    (vessel) => vessel.status !== "maintenance" && vessel.status !== "attention",
  );
  const vesselNames = new Map(vessels.map((vessel) => [vessel.id, vessel.name]));
  const revenueTrend = buildRevenueTrend(bookings);
  const bookingTrend = monthRange().map(({ key, label }) => ({
    label,
    value: bookings.filter((booking) => booking.createdAt.toISOString().slice(0, 7) === key).length,
  }));
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const bookingsThisMonth = bookings.filter(
    (booking) => booking.createdAt.toISOString().slice(0, 7) === currentMonthKey,
  );
  const payload = GetAdminOverviewResponse.parse({
    totalBookings: bookingsThisMonth.length,
    activeVessels: activeFleet.length,
    revenue:
      bookingsThisMonth
        .filter((booking) => booking.paymentStatus === "paid")
        .reduce((sum, booking) => sum + booking.totalCents, 0) / 100,
    pendingRequests: bookings.filter((booking) => booking.status === "requested").length,
    occupancyPercent: activeFleet.length
      ? Math.round(
          (vessels.filter((vessel) => vessel.status === "on_cruise").length /
            activeFleet.length) *
            100,
        )
      : 0,
    revenueTrend,
    bookingTrend,
    alerts: alerts.map((alert) =>
      mapAlert(alert, alert.vesselId ? vesselNames.get(alert.vesselId) : null),
    ),
  });
  res.json(payload);
});

router.get("/admin/fleet", async (_req, res): Promise<void> => {
  await ensureSwaySeedData();
  const vessels = await db.select().from(vesselsTable).orderBy(vesselsTable.name);
  res.json(ListFleetResponse.parse(vessels));
});

router.patch("/admin/fleet/:vesselId", async (req, res): Promise<void> => {
  const params = UpdateVesselParams.safeParse(req.params);
  const body = UpdateVesselBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const errors = [
      !params.success ? params.error.message : "",
      !body.success ? body.error.message : "",
    ].filter(Boolean);
    res.status(400).json({
      error: errors.join("; "),
    });
    return;
  }
  await ensureSwaySeedData();
  const [vessel] = await db
    .update(vesselsTable)
    .set({
      ...body.data,
      nextService: body.data.nextService?.toISOString().slice(0, 10),
    })
    .where(eq(vesselsTable.id, params.data.vesselId))
    .returning();
  if (!vessel) {
    res.status(404).json({ error: "Vessel not found." });
    return;
  }
  await recordActivity(
    "fleet",
    "Fleet status updated",
    `${vessel.name} · ${body.data.status ?? "service schedule updated"}`,
  );
  res.json(UpdateVesselResponse.parse(vessel));
});

router.get("/admin/bookings", async (req, res): Promise<void> => {
  const query = ListAdminBookingsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  await ensureSwaySeedData();
  const [bookings, cruises, vessels] = await Promise.all([
    getLatestBookings(),
    db.select({ id: cruisesTable.id, name: cruisesTable.name }).from(cruisesTable),
    db.select({ id: vesselsTable.id, name: vesselsTable.name }).from(vesselsTable),
  ]);
  const cruiseNames = new Map(cruises.map((cruise) => [cruise.id, cruise.name]));
  const vesselNames = new Map(vessels.map((vessel) => [vessel.id, vessel.name]));
  const search = query.data.search?.trim().toLowerCase();
  const filtered = bookings.filter((booking) => {
    if (query.data.status && booking.status !== query.data.status) return false;
    if (
      search &&
      ![
        booking.reference,
        booking.guestName,
        booking.guestEmail,
        cruiseNames.get(booking.cruiseId) ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search)
    ) {
      return false;
    }
    return true;
  });
  const payload = filtered.map((booking) => ({
    id: booking.id,
    reference: booking.reference,
    cruiseId: booking.cruiseId,
    cruiseName: cruiseNames.get(booking.cruiseId) ?? "Cruise",
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestPhone: booking.guestPhone,
    departureDate: booking.departureDate,
    passengers: booking.passengers,
    total: booking.totalCents / 100,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    createdAt: booking.createdAt.toISOString(),
    vesselId: booking.vesselId,
    vesselName: booking.vesselId ? vesselNames.get(booking.vesselId) ?? null : null,
    paymentMethod: booking.paymentMethod,
    departureTime: booking.departureTime,
  }));
  res.json(ListAdminBookingsResponse.parse(payload));
});

router.patch("/admin/bookings/:bookingId", async (req, res): Promise<void> => {
  const params = UpdateBookingParams.safeParse(req.params);
  const body = UpdateBookingBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const errors = [
      !params.success ? params.error.message : "",
      !body.success ? body.error.message : "",
    ].filter(Boolean);
    res.status(400).json({
      error: errors.join("; "),
    });
    return;
  }
  await ensureSwaySeedData();
  const [updated] = await db
    .update(bookingsTable)
    .set({
      ...body.data,
      departureDate: body.data.departureDate?.toISOString().slice(0, 10),
    })
    .where(eq(bookingsTable.id, params.data.bookingId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  const [cruise] = await db
    .select({ name: cruisesTable.name })
    .from(cruisesTable)
    .where(eq(cruisesTable.id, updated.cruiseId))
    .limit(1);
  const [vessel] = updated.vesselId
    ? await db
        .select({ name: vesselsTable.name })
        .from(vesselsTable)
        .where(eq(vesselsTable.id, updated.vesselId))
        .limit(1)
    : [undefined];
  await recordActivity(
    "booking",
    "Booking updated",
    `${updated.reference} · ${body.data.status ?? body.data.paymentStatus ?? "details changed"}`,
  );
  res.json(
    UpdateBookingResponse.parse({
      id: updated.id,
      reference: updated.reference,
      cruiseId: updated.cruiseId,
      cruiseName: cruise?.name ?? "Cruise",
      guestName: updated.guestName,
      guestEmail: updated.guestEmail,
      guestPhone: updated.guestPhone,
      departureDate: updated.departureDate,
      passengers: updated.passengers,
      total: updated.totalCents / 100,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      createdAt: updated.createdAt.toISOString(),
      vesselId: updated.vesselId,
      vesselName: vessel?.name ?? null,
      paymentMethod: updated.paymentMethod,
      departureTime: updated.departureTime,
    }),
  );
});

router.get("/admin/revenue", async (_req, res): Promise<void> => {
  await ensureSwaySeedData();
  const bookings = await getLatestBookings();
  const billable = bookings.filter((booking) => booking.status !== "cancelled");
  const paid = billable.filter((booking) => booking.paymentStatus === "paid");
  const byMethod = new Map<string, { count: number; amount: number }>();
  for (const booking of paid) {
    const method = booking.paymentMethod || "Other";
    const current = byMethod.get(method) ?? { count: 0, amount: 0 };
    current.count += 1;
    current.amount += booking.totalCents;
    byMethod.set(method, current);
  }
  const payload = GetRevenueResponse.parse({
    grossRevenue: billable.reduce((sum, booking) => sum + booking.totalCents, 0) / 100,
    collectedRevenue: paid.reduce((sum, booking) => sum + booking.totalCents, 0) / 100,
    outstanding:
      billable
        .filter((booking) => booking.paymentStatus !== "paid" && booking.paymentStatus !== "refunded")
        .reduce((sum, booking) => sum + booking.totalCents, 0) / 100,
    monthly: buildRevenueTrend(bookings),
    paymentMethods: Array.from(byMethod, ([method, result]) => ({
      method,
      count: result.count,
      amount: result.amount / 100,
    })),
  });
  res.json(payload);
});

router.get("/admin/monitoring", async (_req, res): Promise<void> => {
  const requestStarted = Date.now();
  await ensureSwaySeedData();
  const databaseStarted = Date.now();
  await db.execute(sql`select 1`);
  const databaseLatency = Date.now() - databaseStarted;
  const [vessels, bookings, alerts] = await Promise.all([
    db.select().from(vesselsTable),
    getLatestBookings(),
    db
      .select()
      .from(operationalAlertsTable)
      .where(eq(operationalAlertsTable.resolved, false))
      .orderBy(desc(operationalAlertsTable.createdAt)),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const overdueReturns = bookings.filter(
    (booking) => booking.status === "in_progress" && booking.departureDate < today,
  ).length;
  const maintenanceDue = vessels.filter((vessel) => vessel.nextService <= addDays(7)).length;
  const paymentIssues = bookings.filter(
    (booking) => booking.paymentStatus === "overdue",
  ).length;
  const activeVessels = vessels.filter(
    (vessel) => vessel.status !== "maintenance" && vessel.status !== "attention",
  );
  const now = new Date().toISOString();
  const snapshot = {
    generatedAt: now,
    fleetAvailability: vessels.length
      ? Math.round((activeVessels.length / vessels.length) * 100)
      : 0,
    openAlerts: alerts.length,
    overdueReturns,
    maintenanceDue,
    paymentIssues,
    services: [
      {
        name: "Cruise operations API",
        status: "operational",
        latencyMs: Math.max(1, Date.now() - requestStarted),
        checkedAt: now,
      },
      {
        name: "Operations database",
        status: "operational",
        latencyMs: Math.max(1, databaseLatency),
        checkedAt: now,
      },
      {
        name: "Payment reconciliation",
        status: paymentIssues ? "degraded" : "operational",
        latencyMs: 0,
        checkedAt: now,
      },
      {
        name: "Vessel check-ins",
        status: overdueReturns ? "degraded" : "operational",
        latencyMs: 0,
        checkedAt: now,
      },
    ],
    alerts: alerts.map((alert) => mapAlert(alert)),
  };
  res.json(GetMonitoringResponse.parse(snapshot));
});

router.get("/admin/activity", async (_req, res): Promise<void> => {
  await ensureSwaySeedData();
  const events = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.createdAt))
    .limit(30);
  res.json(
    ListActivityResponse.parse(
      events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    ),
  );
});

export default router;