"use client";

import { useState, useRef, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  Upload,
  Scan,
  X,
  FileText,
  Building2,
  Search,
  Users,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { logAudit } from "@/lib/audit";
import { ChequeFormRows, ChequeEntry } from "@/components/cheques/cheque-form-rows";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/ui/page-header";
import { Stepper } from "@/components/ui/stepper";
import { cn } from "@/lib/utils/cn";

export default function NewTenantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  const t = useTranslations("tenants");
  const tl = useTranslations("leases");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [scanSuccess, setScanSuccess] = useState(false);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [cheques, setCheques] = useState<ChequeEntry[]>([]);
  const [tenantMode, setTenantMode] = useState<"new" | "existing">("new");
  const [tenantSearch, setTenantSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; full_name: string; phone: string }[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<{ id: string; full_name: string; phone: string } | null>(null);
  const [searchingTenants, setSearchingTenants] = useState(false);
  // 3-step wizard state — only used when assigning to a unit. Standalone
  // tenant creation keeps the original single-page form.
  const [currentStep, setCurrentStep] = useState(0);

  // Unit context from query params (when assigning from a property/unit page)
  const unitId = searchParams.get("unitId");
  const propertyId = searchParams.get("propertyId");
  const defaultRent = searchParams.get("rentAmount") || "";
  const isAssigningToUnit = Boolean(unitId && propertyId);

  // Fetch unit info for display when in assignment mode
  const [unitInfo, setUnitInfo] = useState<{
    unit_number: string;
    rent_amount: string;
    property_name: string;
  } | null>(null);

  // Search existing tenants
  useEffect(() => {
    if (tenantMode !== "existing" || tenantSearch.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingTenants(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("tenants")
        .select("id, full_name, phone")
        .eq("status", "active")
        .or(`full_name.ilike.%${tenantSearch}%,phone.ilike.%${tenantSearch}%`)
        .order("full_name")
        .limit(10);
      setSearchResults(data || []);
      setSearchingTenants(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [tenantSearch, tenantMode]);

  useEffect(() => {
    if (unitId) {
      const supabase = createClient();
      supabase
        .from("units")
        .select("unit_number, rent_amount, properties(name)")
        .eq("id", unitId)
        .single()
        .then(({ data }) => {
          if (data) {
            const property = data.properties as unknown as Record<string, string> | null;
            setUnitInfo({
              unit_number: data.unit_number,
              rent_amount: data.rent_amount,
              property_name: property?.name || "",
            });
          }
        });
    }
  }, [unitId]);

  const handleIdScan = async (file: File) => {
    setScanning(true);
    setError("");
    setScanSuccess(false);
    setIsPdf(file.type === "application/pdf");

    const reader = new FileReader();
    reader.onload = (e) => setIdPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/scan-id", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t("scanFailed"));
        return;
      }

      // Backfill the form fields with whatever the OCR returned. Each
      // field is optional — partial scans (e.g. just the name) still
      // populate what's available.
      const form = formRef.current;
      if (form) {
        if (data.full_name) {
          const input = form.elements.namedItem("full_name") as HTMLInputElement;
          if (input) input.value = data.full_name;
        }
        if (data.nationality) {
          const input = form.elements.namedItem("nationality") as HTMLInputElement;
          if (input) input.value = data.nationality;
        }
        if (data.national_id) {
          const input = form.elements.namedItem("national_id") as HTMLInputElement;
          if (input) input.value = data.national_id;
        }
      }

      setScanSuccess(true);
    } catch {
      setError(t("scanFailed"));
    } finally {
      setScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleIdScan(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith("image/") || file.type === "application/pdf"))
      handleIdScan(file);
  };

  const clearPreview = () => {
    setIdPreview(null);
    setScanSuccess(false);
    setIsPdf(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Validate tenant fields (step 0). Returns an error message or null.
  // Reads the form via the formRef so it can be invoked from the
  // wizard's "Next" handler without waiting for actual form submit.
  function validateTenantStep(): string | null {
    if (tenantMode === "existing") {
      return selectedTenant ? null : t("selectTenantRequired");
    }
    const form = formRef.current;
    if (!form) return null;
    const fullName =
      ((form.elements.namedItem("full_name") as HTMLInputElement | null)?.value || "").trim();
    const phone =
      ((form.elements.namedItem("phone") as HTMLInputElement | null)?.value || "").trim();
    const email =
      ((form.elements.namedItem("email") as HTMLInputElement | null)?.value || "").trim();
    if (!fullName) return t("fullNameRequired");
    if (!phone) return t("phoneRequired");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return t("invalidEmail");
    return null;
  }

  // Validate lease fields (step 1). Returns an error message or null.
  function validateLeaseStep(): string | null {
    const form = formRef.current;
    if (!form) return null;
    const startDate =
      (form.elements.namedItem("lease_start_date") as HTMLInputElement | null)?.value || "";
    const endDate =
      (form.elements.namedItem("lease_end_date") as HTMLInputElement | null)?.value || "";
    const monthlyRent = parseFloat(
      (form.elements.namedItem("monthly_rent") as HTMLInputElement | null)?.value || ""
    );
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      return t("endDateAfterStart");
    }
    if (isNaN(monthlyRent) || monthlyRent <= 0) {
      return t("invalidRent");
    }
    return null;
  }

  function handleNext() {
    setError("");
    if (currentStep === 0) {
      const err = validateTenantStep();
      if (err) {
        setError(err);
        return;
      }
    } else if (currentStep === 1) {
      const err = validateLeaseStep();
      if (err) {
        setError(err);
        return;
      }
    }
    setCurrentStep((s) => s + 1);
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    // Re-run all validations on submit. In the standalone (non-wizard)
    // path nothing is gated by step state, so this is the only check.
    // In the wizard path the user has already passed each step's
    // validation, but re-checking here protects against form tampering
    // and catches stale state.
    if (isAssigningToUnit) {
      const leaseErr = validateLeaseStep();
      if (leaseErr) {
        setError(leaseErr);
        return;
      }
      if (tenantMode === "existing" && !selectedTenant) {
        setError(t("selectTenantRequired"));
        return;
      }
    }
    if (tenantMode === "new") {
      const tenantErr = validateTenantStep();
      if (tenantErr) {
        setError(tenantErr);
        return;
      }
    }

    const formData = new FormData(e.currentTarget);

    setLoading(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let tenantId: string;

    if (tenantMode === "existing" && selectedTenant) {
      // Use existing tenant
      tenantId = selectedTenant.id;
    } else {
      // Create new tenant
      const fullName = (formData.get("full_name") as string).trim();
      const phone = (formData.get("phone") as string).trim();
      const email = (formData.get("email") as string)?.trim() || "";

      const { data: tenant, error: insertError } = await supabase
        .from("tenants")
        .insert({
          full_name: fullName,
          nationality: (formData.get("nationality") as string)?.trim() || null,
          national_id: (formData.get("national_id") as string)?.trim() || null,
          phone,
          email: email || null,
          emergency_contact: (formData.get("emergency_contact") as string)?.trim() || null,
          language_preference: formData.get("language_preference") as string,
          status: "active",
          created_by: user?.id,
        })
        .select("id")
        .single();

      if (insertError || !tenant) {
        setError(insertError?.message || t("failedToCreate"));
        setLoading(false);
        return;
      }

      logAudit(supabase, {
        action: "create",
        entity_type: "tenant",
        entity_id: tenant.id,
        metadata: { full_name: fullName },
      });

      tenantId = tenant.id;
    }

    // If assigning to a unit, create lease and update unit status
    if (isAssigningToUnit) {
      const startDate = formData.get("lease_start_date") as string;
      const endDate = formData.get("lease_end_date") as string;
      const monthlyRent = formData.get("monthly_rent") as string;
      const securityDeposit =
        (formData.get("security_deposit") as string) || null;
      const paymentDueDay = formData.get("payment_due_day") as string;

      const { error: leaseError } = await supabase.from("leases").insert({
        tenant_id: tenantId,
        unit_id: unitId,
        start_date: startDate,
        end_date: endDate,
        monthly_rent: monthlyRent,
        security_deposit: securityDeposit,
        payment_due_day: parseInt(paymentDueDay) || 1,
        is_active: true,
        created_by: user?.id,
      });

      if (leaseError) {
        setError(leaseError.message);
        setLoading(false);
        return;
      }

      // Update unit status to occupied. The DB trigger added in 022
      // will keep this in sync going forward, but we also write it here
      // explicitly so the change is visible immediately on this same
      // request without waiting for a refresh.
      const { error: unitError } = await supabase
        .from("units")
        .update({ status: "occupied" })
        .eq("id", unitId);

      if (unitError) {
        setError(unitError.message);
        setLoading(false);
        return;
      }

      // Insert cheques if any were added
      const validCheques = cheques.filter(
        (c) => c.cheque_number && c.bank_name && c.cheque_date && c.amount
      );
      if (validCheques.length > 0) {
        const { error: chequesError } = await supabase.from("cheques").insert(
          validCheques.map((c) => ({
            tenant_id: tenantId,
            cheque_number: c.cheque_number,
            bank_name: c.bank_name,
            cheque_date: c.cheque_date,
            amount: c.amount,
            status: "pending" as const,
          }))
        );
        if (chequesError) {
          setError(chequesError.message);
          setLoading(false);
          return;
        }
      }

      // Navigate back to the unit page
      router.push(`/${locale}/properties/${propertyId}/units/${unitId}`);
      router.refresh();
      return;
    }

    router.push(`/${locale}/tenants`);
    router.refresh();
  };

  // Wizard steps — only rendered in assign-to-unit mode. Standalone
  // creation skips the wizard entirely and uses the original single-page
  // form so the simple "Add a tenant" path stays one click + scroll.
  const wizardSteps = [
    { id: "tenant", label: t("wizardStepTenant") },
    { id: "lease", label: t("wizardStepLease") },
    { id: "cheques", label: t("wizardStepCheques") },
  ];
  const isLastStep = currentStep === wizardSteps.length - 1;

  // Per-step visibility helpers. In standalone mode every section is
  // always visible (no wizard); in assign-to-unit mode each section is
  // gated by the current step.
  const showTenantStep = !isAssigningToUnit || currentStep === 0;
  const showLeaseStep = isAssigningToUnit && currentStep === 1;
  const showChequesStep = isAssigningToUnit && currentStep === 2;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader
        title={isAssigningToUnit ? t("assignTenantToUnit") : t("createTenant")}
        description={isAssigningToUnit ? t("assigningToUnit") : undefined}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/tenants` },
          { label: t("createTenant") },
        ]}
      />

      {/* Unit Context Banner */}
      {unitId && unitInfo && (
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 flex items-center gap-3 animate-fade-in-up">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
            <Building2 aria-hidden="true" className="h-5 w-5 text-accent" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {unitInfo.property_name} — {unitInfo.unit_number}
            </p>
            <p className="text-xs text-text-secondary">
              {t("monthlyRent")}:{" "}
              <span className="font-mono ltr-nums text-text-primary">
                {unitInfo.rent_amount} OMR
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Wizard step indicator — assign-to-unit mode only */}
      {isAssigningToUnit && (
        <div className="bg-surface border border-border/40 rounded-xl px-4 py-3">
          <Stepper
            steps={wizardSteps}
            activeIndex={currentStep}
            onChange={setCurrentStep}
          />
        </div>
      )}

      {/* New vs Existing Tenant Toggle - shown when assigning to a unit AND on the tenant step */}
      {isAssigningToUnit && currentStep === 0 && (
        <div className="bg-surface border border-border/40 rounded-xl p-4 sm:p-5">
          <span className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            {t("tenantType")}
          </span>
          <div role="tablist" aria-label={t("tenantType")} className="grid grid-cols-2 gap-2">
            <button
              type="button"
              role="tab"
              aria-selected={tenantMode === "new"}
              onClick={() => { setTenantMode("new"); setSelectedTenant(null); }}
              className={cn(
                "flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                tenantMode === "new"
                  ? "bg-accent/10 border-accent/40 text-accent"
                  : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary"
              )}
            >
              <Users aria-hidden="true" className="h-4 w-4" />
              {t("newTenant")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tenantMode === "existing"}
              onClick={() => setTenantMode("existing")}
              className={cn(
                "flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                tenantMode === "existing"
                  ? "bg-accent/10 border-accent/40 text-accent"
                  : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary"
              )}
            >
              <Search aria-hidden="true" className="h-4 w-4" />
              {t("existingTenant")}
            </button>
          </div>

          {/* Existing tenant search */}
          {tenantMode === "existing" && (
            <div className="mt-4 space-y-3">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none z-10"
                />
                <Input
                  type="text"
                  value={tenantSearch}
                  onChange={(e) => { setTenantSearch(e.target.value); setSelectedTenant(null); }}
                  placeholder={t("searchTenantPlaceholder")}
                  aria-label={t("searchTenantPlaceholder")}
                  className="ps-10 pe-10"
                />
                {searchingTenants && (
                  <Spinner
                    sizeClassName="h-4 w-4"
                    label={tc("loading")}
                    className="absolute end-3 top-1/2 -translate-y-1/2"
                  />
                )}
              </div>

              {/* Selected tenant */}
              {selectedTenant && (
                <div className="p-3 rounded-lg bg-success/5 border border-success/20 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{selectedTenant.full_name}</p>
                    <p className="text-xs text-text-secondary font-mono ltr-nums">{selectedTenant.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedTenant(null); setTenantSearch(""); }}
                    aria-label={tc("close")}
                    className="h-6 w-6 shrink-0 rounded-full border border-border flex items-center justify-center cursor-pointer hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <X aria-hidden="true" className="h-3 w-3 text-text-secondary" />
                  </button>
                </div>
              )}

              {/* Search results */}
              {!selectedTenant && searchResults.length > 0 && (
                <div className="border border-border/60 rounded-lg overflow-hidden divide-y divide-border/50">
                  {searchResults.map((tenant) => (
                    <button
                      key={tenant.id}
                      type="button"
                      onClick={() => { setSelectedTenant(tenant); setTenantSearch(tenant.full_name); setSearchResults([]); }}
                      className="w-full text-start px-4 py-3 cursor-pointer hover:bg-surface-elevated/50 transition-colors focus-visible:outline-none focus-visible:bg-surface-elevated"
                    >
                      <p className="text-sm font-medium text-text-primary">{tenant.full_name}</p>
                      <p className="text-xs text-text-secondary font-mono ltr-nums">{tenant.phone}</p>
                    </button>
                  ))}
                </div>
              )}

              {!selectedTenant && tenantSearch.length >= 2 && !searchingTenants && searchResults.length === 0 && (
                <p className="text-xs text-text-secondary text-center py-2">
                  {t("noTenantsFound")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ID Scan Section — visible when creating a new tenant AND on the tenant step (or in standalone mode) */}
      {tenantMode === "new" && showTenantStep && (
        <div className="bg-surface border border-border/40 rounded-xl p-5 sm:p-6">
          <div className="flex items-start gap-3 mb-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <Scan aria-hidden="true" className="h-4 w-4 text-accent" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text-primary font-display tracking-tight">
                {t("scanId")}
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">{t("scanIdDescription")}</p>
            </div>
          </div>

          {idPreview ? (
            <div>
              <div className="relative">
                {isPdf ? (
                  <div className="w-full h-48 rounded-lg border border-border/60 bg-surface-elevated flex flex-col items-center justify-center gap-2">
                    <FileText aria-hidden="true" className="h-12 w-12 text-text-secondary/50" />
                    <span className="text-sm text-text-secondary">PDF Document</span>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={idPreview}
                    alt="ID Preview"
                    className="w-full max-h-48 object-contain rounded-lg border border-border/60 bg-surface-elevated/50"
                  />
                )}
                <button
                  type="button"
                  onClick={clearPreview}
                  aria-label={tc("close")}
                  className="absolute top-2 end-2 h-7 w-7 bg-surface/80 backdrop-blur-sm border border-border rounded-full flex items-center justify-center cursor-pointer hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5 text-text-secondary" />
                </button>
                {scanning && (
                  <div
                    className="absolute inset-0 bg-surface/70 backdrop-blur-sm rounded-lg flex items-center justify-center"
                    aria-busy="true"
                  >
                    <div className="flex items-center gap-2 text-sm text-text-secondary">
                      <Spinner sizeClassName="h-4 w-4" label={t("scanningId")} />
                      {t("scanningId")}
                    </div>
                  </div>
                )}
              </div>
              {scanSuccess && (
                <Alert variant="success" className="mt-3">
                  {t("scanSuccess")}
                </Alert>
              )}
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className="border-2 border-dashed border-border/60 rounded-xl p-8 text-center cursor-pointer transition-all duration-200 hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated">
                <Upload aria-hidden="true" className="h-5 w-5 text-text-secondary/60" />
              </span>
              <p className="text-sm text-text-secondary">{tc("dragAndDrop")}</p>
              <p className="text-xs text-text-secondary/70 mt-1">
                {tc("or")}{" "}
                <span className="text-accent underline underline-offset-2">{tc("browseFiles")}</span>
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            onChange={handleFileChange}
            aria-label={t("scanId")}
            className="hidden"
          />
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        {/* Tenant Info — only for new tenant mode. Wrapper is visually
            hidden when the wizard is on a later step so the form fields
            stay mounted and FormData captures them on submit. */}
        {tenantMode === "new" && (
          <div
            className={cn(
              "bg-surface border border-border/40 rounded-xl p-5 sm:p-6 space-y-4",
              !showTenantStep && "hidden"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <Users aria-hidden="true" className="h-4 w-4 text-accent" />
              </span>
              <h2 className="text-sm font-semibold text-text-primary font-display tracking-tight">
                {t("personalInfo")}
              </h2>
            </div>

            <Input
              name="full_name"
              required
              label={`${t("fullName")} *`}
              placeholder={t("fullNamePlaceholder")}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                name="nationality"
                label={t("nationality")}
                placeholder={t("nationalityPlaceholder")}
              />
              <Input
                name="national_id"
                label={t("nationalId")}
                placeholder={t("nationalIdPlaceholder")}
                className="font-mono ltr-nums"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                name="phone"
                required
                label={`${t("phone")} *`}
                placeholder={t("phonePlaceholder")}
                className="font-mono ltr-nums"
              />
              <Input
                name="email"
                type="email"
                label={t("email")}
                placeholder={t("emailPlaceholder")}
              />
            </div>

            <Input
              name="emergency_contact"
              label={t("emergencyContact")}
              placeholder={t("emergencyContactPlaceholder")}
            />

            <Select
              name="language_preference"
              defaultValue="en"
              label={t("languagePreference")}
            >
              <option value="en">{t("languages.en")}</option>
              <option value="ar">{t("languages.ar")}</option>
            </Select>
          </div>
        )}

        {/* Lease Details — only in assign-to-unit mode. Wrapper hidden
            when on other steps so form fields stay mounted. */}
        {isAssigningToUnit && (
          <div
            className={cn(
              "bg-surface border border-border/40 rounded-xl p-5 sm:p-6 space-y-4",
              !showLeaseStep && "hidden"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <FileText aria-hidden="true" className="h-4 w-4 text-accent" />
              </span>
              <h2 className="text-sm font-semibold text-text-primary font-display tracking-tight">
                {t("leaseInfo")}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                name="lease_start_date"
                type="date"
                required
                label={`${tl("startDate")} *`}
                defaultValue={new Date().toISOString().split("T")[0]}
                className="font-mono ltr-nums"
              />
              <Input
                name="lease_end_date"
                type="date"
                required
                label={`${tl("endDate")} *`}
                defaultValue={
                  new Date(
                    new Date().setFullYear(new Date().getFullYear() + 1)
                  )
                    .toISOString()
                    .split("T")[0]
                }
                className="font-mono ltr-nums"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                name="monthly_rent"
                type="number"
                step={0.01}
                min={0.01}
                required
                label={`${tl("monthlyRent")} (OMR) *`}
                defaultValue={unitInfo?.rent_amount || defaultRent}
                placeholder="0.00"
                className="font-mono ltr-nums tabular-nums"
              />
              <Input
                name="security_deposit"
                type="number"
                step={0.01}
                label={`${tl("securityDeposit")} (OMR)`}
                placeholder="0.00"
                className="font-mono ltr-nums tabular-nums"
              />
            </div>

            <Select
              name="payment_due_day"
              defaultValue="1"
              label={t("paymentDueDay")}
              className="font-mono ltr-nums"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Cheques Section — only in assign-to-unit mode. Wrapper hidden
            when on other steps. (Cheques are React state, not form
            fields, so they survive across step changes regardless.) */}
        {isAssigningToUnit && (
          <div
            className={cn(
              "bg-surface border border-border/40 rounded-xl p-5 sm:p-6 space-y-4",
              !showChequesStep && "hidden"
            )}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <FileText aria-hidden="true" className="h-4 w-4 text-accent" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-text-primary font-display tracking-tight">
                  {tc("cheques")}
                </h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  {tc("chequesOptional")}
                </p>
              </div>
            </div>
            <ChequeFormRows cheques={cheques} onChange={setCheques} />
          </div>
        )}

        {error && <Alert variant="destructive">{error}</Alert>}

        {/* Action row. In wizard mode (assign-to-unit) the layout
            depends on the current step:
              step 0      [Cancel]      [Next]
              step 1..N-1 [Back]        [Next]
              last step   [Back]        [Submit]
            In standalone mode it's just [Submit] [Cancel]. */}
        <div className="flex items-center gap-3">
          {isAssigningToUnit ? (
            <>
              {currentStep === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  {tc("cancel")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setError("");
                    setCurrentStep((s) => Math.max(0, s - 1));
                  }}
                >
                  <ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
                  {tc("back")}
                </Button>
              )}
              {isLastStep ? (
                <Button type="submit" loading={loading} className="ms-auto">
                  {loading ? tc("loading") : t("assignTenant")}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleNext}
                  className="ms-auto group"
                >
                  {tc("next")}
                  <ArrowRight
                    aria-hidden="true"
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                  />
                </Button>
              )}
            </>
          ) : (
            <>
              <Button type="submit" loading={loading}>
                {loading ? tc("loading") : tc("save")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                {tc("cancel")}
              </Button>
            </>
          )}
        </div>
      </form>

    </div>
  );
}
