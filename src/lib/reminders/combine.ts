// One tenant renting several units used to get one WhatsApp message per
// lease in the same run — five identical "rent due" notices for a tenant
// with five shops. Reminders are now gathered first and merged here, so a
// tenant gets one message per reminder type (and due date), listing every
// unit and the combined amount.

export interface CombinableOverdueInvoice {
  amount: string;
  dueDate: string;
  periodLabel: string;
}

export interface CombinableReminder {
  tenantId: string;
  reminderType: "rent_upcoming" | "rent_overdue" | "cheque_due" | "lease_expiry";
  unitNumber: string;
  propertyName: string;
  amount: string;
  dueDate: string;
  chequeNumber?: string;
  overdueInvoices?: CombinableOverdueInvoice[];
  totalOverdue?: string;
}

function groupKey(r: CombinableReminder, index: number): string {
  switch (r.reminderType) {
    // Each cheque is its own instrument with its own number.
    case "cheque_due":
      return `cheque:${index}`;
    // All of a tenant's overdue invoices go in one notice, whatever unit.
    case "rent_overdue":
      return `${r.tenantId}:rent_overdue`;
    // Same due date → one notice; different dates stay separate.
    default:
      return `${r.tenantId}:${r.reminderType}:${r.dueDate}`;
  }
}

function joinDistinct(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(", ");
}

function merge<T extends CombinableReminder>(group: T[]): T {
  if (group.length === 1) return group[0];
  const first = group[0];
  const unitNumber = joinDistinct(group.map((r) => r.unitNumber));
  const propertyName = joinDistinct(group.map((r) => r.propertyName));

  if (first.reminderType === "rent_overdue") {
    // Label each invoice with its unit, or "Sep 2026" would appear once per
    // unit with nothing to tell the lines apart.
    const overdueInvoices = group
      .flatMap((r) =>
        (r.overdueInvoices ?? []).map((inv) => ({
          ...inv,
          periodLabel: r.unitNumber ? `${r.unitNumber} · ${inv.periodLabel}` : inv.periodLabel,
        }))
      )
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
    const totalOverdue = overdueInvoices
      .reduce((sum, inv) => sum + Number(inv.amount), 0)
      .toFixed(2);
    return {
      ...first,
      unitNumber,
      propertyName,
      amount: totalOverdue,
      dueDate: overdueInvoices[0]?.dueDate ?? first.dueDate,
      overdueInvoices,
      totalOverdue,
    };
  }

  const amount = group.reduce((sum, r) => sum + Number(r.amount || 0), 0).toFixed(2);
  return { ...first, unitNumber, propertyName, amount };
}

/** Merge same-tenant reminders so each tenant gets one message per notice. */
export function combineByTenant<T extends CombinableReminder>(reminders: T[]): T[] {
  const groups = new Map<string, T[]>();
  reminders.forEach((r, i) => {
    const key = groupKey(r, i);
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  });
  return [...groups.values()].map(merge);
}
