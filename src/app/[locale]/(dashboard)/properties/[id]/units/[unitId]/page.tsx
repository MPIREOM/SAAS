import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Home,
  User,
  CreditCard,
  Plus,
  Folder,
  FileText,
  Wrench,
  AlertTriangle,
  ExternalLink,
  MapPin,
  Phone,
  Mail,
  Shield,
  Globe,
  Calendar,
  Banknote,
  Hash,
  Layers,
  Ruler,
  CheckCircle2,
  Clock,
  XCircle,
  LogOut,
} from "lucide-react";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { UnitStatusToggle } from "@/components/units/unit-status-toggle";
import { AddChequeDialog } from "@/components/cheques/add-cheque-dialog";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; unitId: string }>;
}) {
  const { locale, id: propertyId, unitId } = await params;
  const t = await getTranslations("units");
  const tt = await getTranslations("tenants");
  const tc = await getTranslations("common");
  const td = await getTranslations("documents");
  const tch = await getTranslations("cheques");
  const supabase = await createClient();

  const { data: unit } = await supabase
    .from("units")
    .select("*, properties(name, location)")
    .eq("id", unitId)
    .single();

  if (!unit) {
    notFound();
  }

  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  if (propertyIds !== null && !propertyIds.includes(propertyId)) {
    notFound();
  }

  // Fetch current tenant via active lease
  const { data: activeLease } = await supabase
    .from("leases")
    .select(
      "*, tenants(id, full_name, phone, email, nationality, national_id, emergency_contact, language_preference, status)"
    )
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .single();

  const currentTenant = activeLease?.tenants as Record<
    string,
    unknown
  > | null;
  const tenantId = currentTenant?.id as string | undefined;

  // Fetch payment history, cheques, documents, maintenance in parallel
  const [paymentsRes, chequesRes, documentsRes, maintenanceRes, pastLeasesRes] =
    await Promise.all([
      activeLease
        ? supabase
            .from("payments")
            .select("*")
            .eq("lease_id", activeLease.id)
            .order("payment_date", { ascending: false })
        : Promise.resolve({ data: null }),
      tenantId
        ? supabase
            .from("cheques")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("cheque_date", { ascending: false })
        : Promise.resolve({ data: null }),
      tenantId
        ? supabase
            .from("documents")
            .select("*")
            .eq("entity_type", "tenant")
            .eq("entity_id", tenantId)
            .order("uploaded_at", { ascending: false })
        : Promise.resolve({ data: null }),
      supabase
            .from("maintenance_requests")
            .select("*")
            .eq("unit_id", unitId)
            .order("created_at", { ascending: false }),
      supabase
        .from("leases")
        .select("*, tenants(id, full_name, phone, status)")
        .eq("unit_id", unitId)
        .eq("is_active", false)
        .order("vacate_date", { ascending: false }),
    ]);

  const payments = paymentsRes.data;
  const cheques = chequesRes.data;
  const documents = documentsRes.data;
  const maintenance = maintenanceRes.data;
  const pastLeases = pastLeasesRes.data;

  const property = unit.properties as Record<string, unknown> | null;
  const now = new Date();
  const thirtyDaysFromNow = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000
  );

  const statusConfig: Record<
    string,
    { bg: string; text: string; dot: string; icon: typeof CheckCircle2 }
  > = {
    vacant: {
      bg: "bg-success/10",
      text: "text-success",
      dot: "bg-success",
      icon: CheckCircle2,
    },
    occupied: {
      bg: "bg-info/10",
      text: "text-info",
      dot: "bg-info",
      icon: User,
    },
    maintenance: {
      bg: "bg-warning/10",
      text: "text-warning",
      dot: "bg-warning",
      icon: Wrench,
    },
  };

  const unitStatus = (unit.status as string) || "vacant";
  const config = statusConfig[unitStatus] || statusConfig.vacant;
  const StatusIcon = config.icon;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href={`/${locale}/properties/${propertyId}`}
              className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all duration-200"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-text-primary font-mono">
                {unit.unit_number}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${config.bg} ${config.text}`}
              >
                <StatusIcon className="h-3 w-3" />
                {t(unitStatus)}
              </span>
              <UnitStatusToggle unitId={unitId} currentStatus={unitStatus} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-10">
            <MapPin className="h-3.5 w-3.5 text-text-secondary/60" />
            <span className="text-sm text-text-secondary">
              {(property?.name as string) || ""}
              {property?.location ? ` — ${property.location}` : ""}
            </span>
          </div>
        </div>
        {unitStatus === "vacant" && (
          <Link
            href={`/${locale}/tenants/new?unitId=${unitId}&propertyId=${propertyId}&rentAmount=${unit.rent_amount || ""}`}
            className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            {t("assignTenant")}
          </Link>
        )}
      </div>

      {/* Unit Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: t("unitNumber"),
            value: unit.unit_number,
            icon: Hash,
            mono: true,
          },
          {
            label: t("floor"),
            value: unit.floor ?? "—",
            icon: Layers,
            mono: true,
          },
          {
            label: t("unitType"),
            value: unit.unit_type || "—",
            icon: Home,
            capitalize: true,
          },
          {
            label: t("sizeSqm"),
            value: unit.size_sqm ? `${unit.size_sqm} m²` : "—",
            icon: Ruler,
            mono: true,
          },
          {
            label: t("rentAmount"),
            value: unit.rent_amount
              ? `${Number(unit.rent_amount).toLocaleString("en-OM", { minimumFractionDigits: 0 })} ${CURRENCY.code}`
              : "—",
            icon: Banknote,
            mono: true,
            highlight: true,
          },
          {
            label: t("status"),
            value: t(unitStatus),
            icon: StatusIcon,
            statusColor: config.text,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="bg-surface border border-border rounded-xl p-4"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="h-3.5 w-3.5 text-text-secondary/50" />
                <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                  {item.label}
                </span>
              </div>
              <p
                className={`text-sm font-medium ${
                  item.statusColor
                    ? item.statusColor
                    : item.highlight
                      ? "text-accent"
                      : "text-text-primary"
                } ${item.mono ? "font-mono tabular-nums" : ""} ${item.capitalize ? "capitalize" : ""}`}
              >
                {item.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Current Tenant */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-accent/10">
            <User className="h-4 w-4 text-accent" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary font-display tracking-tight">
            {t("currentTenant")}
          </h2>
        </div>

        {currentTenant ? (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            {/* Tenant header */}
            <div className="p-5 bg-gradient-to-r from-accent/5 to-transparent border-b border-border/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <Link
                      href={`/${locale}/tenants/${currentTenant.id}`}
                      className="text-base font-semibold text-text-primary hover:text-accent transition-colors font-display"
                    >
                      {currentTenant.full_name as string}
                    </Link>
                    <div className="flex items-center gap-3 mt-0.5">
                      {currentTenant.phone ? (
                        <span className="text-xs text-text-secondary flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {currentTenant.phone as string}
                        </span>
                      ) : null}
                      {currentTenant.email ? (
                        <span className="text-xs text-text-secondary flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {currentTenant.email as string}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {activeLease?.monthly_rent && (
                    <div className="text-end hidden sm:block">
                      <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                        {tt("monthlyRent")}
                      </p>
                      <p className="text-lg font-bold font-mono tabular-nums text-accent">
                        {Number(activeLease.monthly_rent).toLocaleString(
                          "en-OM",
                          { minimumFractionDigits: 2 }
                        )}
                        <span className="text-xs font-sans font-normal text-text-secondary ml-1">
                          {CURRENCY.code}
                        </span>
                      </p>
                    </div>
                  )}
                  <Link
                    href={`/${locale}/tenants/${currentTenant.id}/move-out`}
                    className="inline-flex items-center gap-2 h-8 px-3 bg-surface-elevated border border-border text-text-secondary text-xs rounded-md hover:bg-border/30 hover:text-text-primary transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    {t("moveOut") || "Move Out"}
                  </Link>
                </div>
              </div>
            </div>

            {/* Tenant details grid */}
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: tt("nationality"),
                    value: currentTenant.nationality as string,
                    icon: Globe,
                  },
                  {
                    label: tt("nationalId"),
                    value: currentTenant.national_id as string,
                    icon: Shield,
                    mono: true,
                  },
                  {
                    label: tt("emergencyContact"),
                    value: currentTenant.emergency_contact as string,
                    icon: Phone,
                    mono: true,
                  },
                  {
                    label: tt("languagePreference"),
                    value:
                      (currentTenant.language_preference as string)?.toUpperCase() ||
                      "—",
                    icon: Globe,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label}>
                      <div className="flex items-center gap-1 mb-1">
                        <Icon className="h-3 w-3 text-text-secondary/50" />
                        <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                          {item.label}
                        </span>
                      </div>
                      <p
                        className={`text-sm text-text-primary ${item.mono ? "font-mono tabular-nums" : ""}`}
                      >
                        {item.value || "—"}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Lease info */}
              {activeLease && (
                <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    {
                      label: tt("startDate"),
                      value: new Date(
                        activeLease.start_date
                      ).toLocaleDateString(),
                      icon: Calendar,
                    },
                    {
                      label: tt("endDate"),
                      value: new Date(
                        activeLease.end_date
                      ).toLocaleDateString(),
                      icon: Calendar,
                    },
                    {
                      label: tt("securityDeposit"),
                      value: activeLease.security_deposit
                        ? `${activeLease.security_deposit} ${CURRENCY.code}`
                        : "—",
                      icon: Shield,
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label}>
                        <div className="flex items-center gap-1 mb-1">
                          <Icon className="h-3 w-3 text-text-secondary/50" />
                          <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                            {item.label}
                          </span>
                        </div>
                        <p className="text-sm text-text-primary font-mono tabular-nums">
                          {item.value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl p-12 text-center">
            <div className="p-3 bg-accent/10 rounded-2xl w-fit mx-auto mb-3">
              <User className="h-8 w-8 text-accent/50" />
            </div>
            <p className="text-sm text-text-secondary mb-4">
              {t("noTenant")}
            </p>
            <Link
              href={`/${locale}/tenants/new?unitId=${unitId}&propertyId=${propertyId}&rentAmount=${unit.rent_amount || ""}`}
              className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20"
            >
              <Plus className="h-4 w-4" />
              {t("assignTenant")}
            </Link>
          </div>
        )}
      </section>

      {/* Previous Tenants */}
      {pastLeases && pastLeases.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-text-secondary/10">
              <Clock className="h-4 w-4 text-text-secondary" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary font-display tracking-tight">
              {t("previousTenants")}
            </h2>
            <span className="text-xs font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md">
              {pastLeases.length}
            </span>
          </div>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/30">
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("fullName")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("phone")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("startDate")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("endDate")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {t("vacateDate")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {t("vacateReason")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {pastLeases.map((lease: Record<string, unknown>) => {
                  const pastTenant = lease.tenants as Record<string, unknown> | null;
                  return (
                    <tr key={lease.id as string} className="hover:bg-surface-elevated/30 transition-colors">
                      <td className="px-5 py-3.5">
                        {pastTenant ? (
                          <Link href={`/${locale}/tenants/${pastTenant.id}`} className="text-sm font-medium text-text-primary hover:text-accent transition-colors">
                            {pastTenant.full_name as string}
                          </Link>
                        ) : <span className="text-sm text-text-secondary">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-text-secondary font-mono">{(pastTenant?.phone as string) || "—"}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-text-primary font-mono tabular-nums">
                          {new Date(lease.start_date as string).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-text-primary font-mono tabular-nums">
                          {new Date(lease.end_date as string).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-text-primary font-mono tabular-nums">
                          {lease.vacate_date ? new Date(lease.vacate_date as string).toLocaleDateString() : "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-text-secondary capitalize">
                          {((lease.vacate_reason as string) || "—").replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Payment History */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-success/10">
            <CreditCard className="h-4 w-4 text-success" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary font-display tracking-tight">
            {t("paymentHistory")}
          </h2>
          {payments && payments.length > 0 && (
            <span className="text-xs font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md">
              {payments.length}
            </span>
          )}
        </div>

        {payments && payments.length > 0 ? (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/30">
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("paymentDate")}
                  </th>
                  <th className="text-end text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("amount")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("paymentMethod")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("reference")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("notes")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {payments.map((payment: Record<string, unknown>) => (
                  <tr
                    key={payment.id as string}
                    className="hover:bg-surface-elevated/30 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-text-primary font-mono tabular-nums">
                        {new Date(
                          payment.payment_date as string
                        ).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-end">
                      <span className="text-sm font-bold text-text-primary font-mono tabular-nums">
                        {Number(payment.amount).toLocaleString("en-OM", {
                          minimumFractionDigits: 2,
                        })}
                        <span className="text-[10px] font-normal text-text-secondary ml-1">
                          {CURRENCY.code}
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-text-secondary capitalize">
                        {((payment.method as string) || "—").replace(
                          "_",
                          " "
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-text-secondary font-mono">
                        {(payment.reference_number as string) || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-text-secondary">
                        {(payment.notes as string) || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl p-10 text-center">
            <CreditCard className="h-8 w-8 text-text-secondary/30 mx-auto mb-2" />
            <p className="text-sm text-text-secondary">{tt("noPayments")}</p>
          </div>
        )}
      </section>

      {/* Cheques */}

      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-warning/10">
              <FileText className="h-4 w-4 text-warning" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary font-display tracking-tight">
              {tch("title")}
            </h2>
            {cheques && cheques.length > 0 && (
              <span className="text-xs font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md">
                {cheques.length}
              </span>
            )}
          </div>
          {tenantId && <AddChequeDialog tenantId={tenantId} />}
        </div>

        {cheques && cheques.length > 0 ? (
          <div className="bg-surface border border-border rounded-xl overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/30">
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tch("chequeNumber")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tch("bankName")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tch("chequeDate")}
                  </th>
                  <th className="text-end text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tch("amount")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tch("status")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {cheques.map((cheque: Record<string, unknown>) => (
                  <tr
                    key={cheque.id as string}
                    className="hover:bg-surface-elevated/30 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-text-primary font-mono font-medium">
                        #{cheque.cheque_number as string}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-text-secondary">
                        {cheque.bank_name as string}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-text-primary font-mono tabular-nums">
                        {new Date(
                          cheque.cheque_date as string
                        ).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-end">
                      <span className="text-sm font-bold text-text-primary font-mono tabular-nums">
                        {Number(cheque.amount).toLocaleString("en-OM", {
                          minimumFractionDigits: 2,
                        })}
                        <span className="text-[10px] font-normal text-text-secondary ml-1">
                          {CURRENCY.code}
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg capitalize ${
                          cheque.status === "cleared"
                            ? "bg-success/10 text-success"
                            : cheque.status === "pending"
                              ? "bg-warning/10 text-warning"
                              : cheque.status === "bounced"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-text-secondary/10 text-text-secondary"
                        }`}
                      >
                        {cheque.status === "cleared" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : cheque.status === "pending" ? (
                          <Clock className="h-3 w-3" />
                        ) : cheque.status === "bounced" ? (
                          <XCircle className="h-3 w-3" />
                        ) : null}
                        {cheque.status as string}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl p-10 text-center">
            <FileText className="h-8 w-8 text-text-secondary/30 mx-auto mb-2" />
            <p className="text-sm text-text-secondary mb-3">{tch("noCheques")}</p>
            {tenantId && <AddChequeDialog tenantId={tenantId} />}
          </div>
        )}
      </section>

      {/* Documents */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-accent/10">
              <Folder className="h-4 w-4 text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary font-display tracking-tight">
              {td("title")}
            </h2>
            {documents && documents.length > 0 && (
              <span className="text-xs font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md">
                {documents.length}
              </span>
            )}
          </div>
          {tenantId && (
            <Link
              href={`/${locale}/documents/upload?entityType=tenant&entityId=${tenantId}`}
              className="inline-flex items-center gap-1.5 h-8 px-3 bg-accent/10 text-accent text-xs font-semibold rounded-lg hover:bg-accent/20 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {td("uploadDocument")}
            </Link>
          )}
        </div>

        {documents && documents.length > 0 ? (
          <div className="bg-surface border border-border rounded-xl overflow-x-auto">
            <table className="w-full min-w-[550px]">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/30">
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {td("fileName")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {td("documentType")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {td("expiryDate")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {td("uploadDate")}
                  </th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {documents.map((doc: Record<string, unknown>) => {
                  const expiryDate = doc.expiry_date
                    ? new Date(doc.expiry_date as string)
                    : null;
                  const isExpiringSoon =
                    expiryDate &&
                    expiryDate <= thirtyDaysFromNow &&
                    expiryDate >= now;
                  const isExpired = expiryDate && expiryDate < now;

                  return (
                    <tr
                      key={doc.id as string}
                      className="hover:bg-surface-elevated/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-medium text-text-primary">
                          {(doc.file_name as string) || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-accent/10 text-accent capitalize">
                          {(
                            (doc.document_type as string) || ""
                          ).replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-sm font-mono tabular-nums ${
                              isExpired
                                ? "text-destructive font-medium"
                                : isExpiringSoon
                                  ? "text-warning font-medium"
                                  : "text-text-secondary"
                            }`}
                          >
                            {expiryDate
                              ? expiryDate.toLocaleDateString()
                              : "—"}
                          </span>
                          {isExpired && (
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                          )}
                          {isExpiringSoon && !isExpired && (
                            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-text-secondary font-mono tabular-nums">
                          {new Date(
                            doc.uploaded_at as string
                          ).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {Boolean(doc.file_url) ? (
                          <a
                            href={doc.file_url as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors inline-flex"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl p-10 text-center">
            <Folder className="h-8 w-8 text-text-secondary/30 mx-auto mb-2" />
            <p className="text-sm text-text-secondary mb-3">{tt("noDocuments")}</p>
            {tenantId && (
              <Link
                href={`/${locale}/documents/upload?entityType=tenant&entityId=${tenantId}`}
                className="inline-flex items-center gap-1.5 h-8 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-xs font-semibold rounded-lg transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {td("uploadDocument")}
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Maintenance */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-destructive/10">
              <Wrench className="h-4 w-4 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary font-display tracking-tight">
              {tt("maintenance")}
            </h2>
            {maintenance && maintenance.length > 0 && (
              <span className="text-xs font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md">
                {maintenance.length}
              </span>
            )}
          </div>
          <Link
            href={`/${locale}/maintenance/new?unitId=${unitId}&propertyId=${propertyId}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 bg-destructive/10 text-destructive text-xs font-semibold rounded-lg hover:bg-destructive/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {tt("newRequest") || "New Request"}
          </Link>
        </div>

        {maintenance && maintenance.length > 0 ? (
          <div className="bg-surface border border-border rounded-xl overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/30">
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("maintenanceDate")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("maintenanceTitle")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("maintenancePriority")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-5 py-3">
                    {tt("status")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {maintenance.map((req: Record<string, unknown>) => {
                  const priorityColors: Record<string, string> = {
                    low: "text-text-secondary",
                    medium: "text-warning",
                    high: "text-destructive",
                    emergency: "text-destructive font-bold",
                  };
                  return (
                    <tr
                      key={req.id as string}
                      className="hover:bg-surface-elevated/30 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3.5">
                        <Link href={`/${locale}/maintenance/${req.id}`} className="text-sm text-text-primary font-mono tabular-nums hover:text-accent transition-colors">
                          {new Date(
                            req.created_at as string
                          ).toLocaleDateString()}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <Link href={`/${locale}/maintenance/${req.id}`} className="text-sm font-medium text-text-primary hover:text-accent transition-colors">
                          {(req.description as string)?.slice(0, 60) || "—"}
                          {(req.description as string)?.length > 60
                            ? "..."
                            : ""}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`text-xs font-semibold capitalize ${
                            priorityColors[
                              (req.urgency as string) || "medium"
                            ] || "text-text-secondary"
                          }`}
                        >
                          {(req.urgency as string) || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg capitalize ${
                            req.status === "resolved" ||
                            req.status === "closed"
                              ? "bg-success/10 text-success"
                              : req.status === "in_progress"
                                ? "bg-warning/10 text-warning"
                                : "bg-accent/10 text-accent"
                          }`}
                        >
                          {req.status === "resolved" ||
                          req.status === "closed" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : req.status === "in_progress" ? (
                            <Clock className="h-3 w-3" />
                          ) : (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {((req.status as string) || "").replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl p-10 text-center">
            <Wrench className="h-8 w-8 text-text-secondary/30 mx-auto mb-2" />
            <p className="text-sm text-text-secondary mb-3">
              {tt("noMaintenance")}
            </p>
            <Link
              href={`/${locale}/maintenance/new?unitId=${unitId}&propertyId=${propertyId}`}
              className="inline-flex items-center gap-1.5 h-8 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-xs font-semibold rounded-lg transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {tt("newRequest") || "New Request"}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
