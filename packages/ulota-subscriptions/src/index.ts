import {
  personalSubscriptionSchema,
  subscriptionRequestSchema,
  subscriptionFiltersSchema,
  type PersonalSubscription,
} from "@zendev-lab/spark-protocol";
export interface SubscriptionRepository {
  list(): PersonalSubscription[];
  get(id: string): PersonalSubscription | undefined;
  insert(item: PersonalSubscription): void;
  replace(item: PersonalSubscription, expectedRevision: number): void;
  remove(id: string, expectedRevision: number): void;
}
export function nextPaymentDate(
  date: string,
  cycle: PersonalSubscription["billing_cycle"],
  amount = 1,
): string | null {
  if (cycle === "Lifetime") return null;
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(`${date}T00:00:00Z`);
  if (cycle === "Daily" || cycle === "Weekly")
    value.setUTCDate(day! + amount * (cycle === "Weekly" ? 7 : 1));
  else {
    const months = amount * (cycle === "Monthly" ? 1 : cycle === "Quarterly" ? 3 : 12);
    value.setUTCDate(1);
    value.setUTCFullYear(year!, month! - 1 + months, 1);
    const last = new Date(value.getTime());
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    value.setUTCDate(Math.min(day!, last.getUTCDate()));
  }
  if (!Number.isFinite(value.getTime()))
    throw Object.assign(new Error("Payment date is outside the supported calendar."), {
      code: "invalid_input",
    });
  const result = value.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(result))
    throw Object.assign(new Error("Payment date is outside the supported calendar."), {
      code: "invalid_input",
    });
  return result;
}
const cycleDays = { Daily: 1, Weekly: 7, Monthly: 30, Quarterly: 90, Yearly: 365, Lifetime: 0 };
export function subscriptionSnapshot(
  repository: SubscriptionRepository,
  input: unknown = {},
  today = new Date().toISOString().slice(0, 10),
) {
  const filters = subscriptionFiltersSchema.parse(input);
  const query = filters.search.trim().toLocaleLowerCase();
  const items = repository
    .list()
    .filter(
      (item) =>
        (!query ||
          `${item.name} ${item.notes} ${item.category}`.toLocaleLowerCase().includes(query)) &&
        (!filters.status || item.status === filters.status) &&
        (!filters.category || item.category === filters.category) &&
        (!filters.currency || item.currency === filters.currency),
    )
    .sort(
      (a, b) =>
        (a.next_payment_date ?? "9999").localeCompare(b.next_payment_date ?? "9999") ||
        a.id.localeCompare(b.id),
    );
  const byCurrency: Record<
    string,
    {
      monthly_cost: number;
      yearly_cost: number;
      estimated_spent: number;
      active_subscriptions: number;
    }
  > = {};
  const categories: Record<string, number> = Object.create(null);
  for (const item of items) {
    const group = (byCurrency[item.currency] ??= {
      monthly_cost: 0,
      yearly_cost: 0,
      estimated_spent: 0,
      active_subscriptions: 0,
    });
    categories[item.category] = (categories[item.category] ?? 0) + 1;
    const days = cycleDays[item.billing_cycle] * item.cycle_amount;
    if (item.status === "Active") {
      group.active_subscriptions++;
      if (days) {
        group.monthly_cost += (item.price / days) * 30;
        group.yearly_cost += (item.price / days) * 365;
      }
    }
    const elapsed = Math.max(
      0,
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${item.start_date}T00:00:00Z`)) / 86400000,
    );
    // Historical payment events are unavailable; this is a schedule estimate, never an actual ledger total.
    group.estimated_spent +=
      item.start_date > today ? 0 : days ? (elapsed * item.price) / days : item.price;
  }
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  const endDate = end.toISOString().slice(0, 10);
  const upcoming = items.filter(
    (item) =>
      item.status === "Active" &&
      item.next_payment_date &&
      item.next_payment_date >= today &&
      item.next_payment_date <= endDate,
  );
  return {
    items,
    filters,
    stats: {
      total_subscriptions: items.length,
      active_subscriptions: items.filter((item) => item.status === "Active").length,
      cancelled_subscriptions: items.filter((item) => item.status === "Cancelled").length,
      paused_subscriptions: items.filter((item) => item.status === "Paused").length,
      expired_subscriptions: items.filter((item) => item.status === "Expired").length,
      byCurrency,
      category_counts: categories,
      upcoming_payments: upcoming.length,
      upcoming_renewals: upcoming.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        currency: item.currency,
        next_payment_date: item.next_payment_date!,
        days_until:
          (Date.parse(`${item.next_payment_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
          86400000,
      })),
    },
  };
}
export function executeSubscription(
  repository: SubscriptionRepository,
  raw: unknown,
  now = new Date(),
) {
  const request = subscriptionRequestSchema.parse(raw);
  if (request.action === "list" || request.action === "stats") {
    const snapshot = subscriptionSnapshot(
      repository,
      request.input,
      now.toISOString().slice(0, 10),
    );
    return request.action === "stats"
      ? { stats: snapshot.stats, filters: snapshot.filters }
      : snapshot;
  }
  if (request.action === "create") {
    const item = personalSubscriptionSchema.parse({
      ...request.input,
      next_payment_date:
        request.input.next_payment_date === undefined
          ? nextPaymentDate(
              request.input.start_date,
              request.input.billing_cycle,
              request.input.cycle_amount,
            )
          : request.input.next_payment_date,
      id: crypto.randomUUID(),
      revision: 1,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    repository.insert(item);
    return item;
  }
  const current = repository.get(request.input.id);
  if (!current) throw Object.assign(new Error("Subscription not found."), { code: "not_found" });
  if (request.action === "get") return current;
  if (request.action === "delete") {
    repository.remove(current.id, request.input.expectedRevision);
    return { deleted: true };
  }
  let patch: Partial<PersonalSubscription>;
  if (request.action === "renew") {
    if (current.billing_cycle === "Lifetime")
      throw Object.assign(new Error("Lifetime subscriptions do not renew."), {
        code: "invalid_input",
      });
    patch = {
      next_payment_date: nextPaymentDate(
        current.next_payment_date ?? now.toISOString().slice(0, 10),
        current.billing_cycle,
        current.cycle_amount,
      ),
    };
  } else if (request.action === "cancel") patch = { status: "Cancelled", auto_renew: false };
  else
    patch = Object.fromEntries(
      Object.entries(request.input.patch).filter(([, value]) => value !== undefined),
    );
  const item = personalSubscriptionSchema.parse({
    ...current,
    ...patch,
    revision: current.revision + 1,
    updated_at: now.toISOString(),
  });
  repository.replace(item, request.input.expectedRevision);
  return item;
}
