"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Upload, Scan, X, FileText, Building2 } from "lucide-react";

export default function NewTenantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
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

  // Unit context from query params (when assigning from a property/unit page)
  const unitId = searchParams.get("unitId");
  const propertyId = searchParams.get("propertyId");

  // Fetch unit info for display when in assignment mode
  const [unitInfo, setUnitInfo] = useState<{
    unit_number: string;
    rent_amount: string;
    property_name: string;
  } | null>(null);

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

    // Show preview
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

      // Auto-fill form fields
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
    if (file && (file.type.startsWith("image/") || file.type === "application/pdf")) handleIdScan(file);
  };

  const clearPreview = () => {
    setIdPreview(null);
    setScanSuccess(false);
    setIsPdf(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();

    // Create tenant
    const { data: tenant, error: insertError } = await supabase.from("tenants").insert({
      full_name: formData.get("full_name") as string,
      nationality: (formData.get("nationality") as string) || null,
      national_id: (formData.get("national_id") as string) || null,
      passport_number: (formData.get("passport_number") as string) || null,
      phone: formData.get("phone") as string,
      email: (formData.get("email") as string) || null,
      emergency_contact: (formData.get("emergency_contact") as string) || null,
      language_preference: formData.get("language_preference") as string,
      status: "active",
      created_by: user?.id,
    }).select("id").single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // If coming from a unit context, create lease and update unit status
    if (unitId && tenant) {
      const startDate = formData.get("start_date") as string;
      const endDate = formData.get("end_date") as string;
      const monthlyRent = formData.get("monthly_rent") as string;
      const securityDeposit = (formData.get("security_deposit") as string) || null;

      const { error: leaseError } = await supabase.from("leases").insert({
        tenant_id: tenant.id,
        unit_id: unitId,
        start_date: startDate,
        end_date: endDate,
        monthly_rent: monthlyRent,
        security_deposit: securityDeposit,
        payment_due_day: 1,
        is_active: true,
        created_by: user?.id,
      });

      if (leaseError) {
        setError(leaseError.message);
        setLoading(false);
        return;
      }

      // Update unit status to occupied
      const { error: unitError } = await supabase
        .from("units")
        .update({ status: "occupied" })
        .eq("id", unitId);

      if (unitError) {
        setError(unitError.message);
        setLoading(false);
        return;
      }

      // Navigate back to the unit page
      const { locale } = await params;
      router.push(`/${locale}/properties/${propertyId}/units/${unitId}`);
      router.refresh();
      return;
    }

    const { locale } = await params;
    router.push(`/${locale}/tenants`);
    router.refresh();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">
          {unitId ? t("assignedUnit") : t("createTenant")}
        </h1>
      </div>

      {/* Unit Context Banner */}
      {unitId && unitInfo && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-5 flex items-center gap-3">
          <Building2 className="h-5 w-5 text-accent shrink-0" />
          <div>
            <p className="text-sm font-medium text-text-primary">
              {unitInfo.property_name} — {unitInfo.unit_number}
            </p>
            <p className="text-xs text-text-secondary">
              {t("monthlyRent")}: {unitInfo.rent_amount} OMR
            </p>
          </div>
        </div>
      )}

      {/* ID Scan Section */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Scan className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-medium text-text-primary">
            {t("scanId")}
          </h2>
        </div>
        <p className="text-xs text-text-secondary mb-4">
          {t("scanIdDescription")}
        </p>

        {idPreview ? (
          <div className="relative">
            {isPdf ? (
              <div className="w-full h-48 rounded-md border border-border bg-surface-elevated flex flex-col items-center justify-center gap-2">
                <FileText className="h-12 w-12 text-text-secondary/50" />
                <span className="text-sm text-text-secondary">PDF Document</span>
              </div>
            ) : (
              <img
                src={idPreview}
                alt="ID Preview"
                className="w-full max-h-48 object-contain rounded-md border border-border"
              />
            )}
            <button
              type="button"
              onClick={clearPreview}
              className="absolute top-2 right-2 h-6 w-6 bg-surface/80 backdrop-blur-sm border border-border rounded-full flex items-center justify-center hover:bg-surface transition-colors"
            >
              <X className="h-3 w-3 text-text-secondary" />
            </button>
            {scanning && (
              <div className="absolute inset-0 bg-surface/70 backdrop-blur-sm rounded-md flex items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  {t("scanningId")}
                </div>
              </div>
            )}
            {scanSuccess && (
              <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                {t("scanSuccess")}
              </div>
            )}
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-accent/50 transition-colors"
          >
            <Upload className="h-8 w-8 text-text-secondary/50 mx-auto mb-2" />
            <p className="text-sm text-text-secondary">
              {tc("dragAndDrop")}
            </p>
            <p className="text-xs text-text-secondary/70 mt-1">
              {tc("or")}{" "}
              <span className="text-accent underline">{tc("browseFiles")}</span>
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("fullName")} <span className="text-destructive">*</span>
            </label>
            <input
              name="full_name"
              required
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder={t("fullNamePlaceholder")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("nationality")}
              </label>
              <input
                name="nationality"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                placeholder={t("nationalityPlaceholder")}
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("nationalId")}
              </label>
              <input
                name="national_id"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                placeholder={t("nationalIdPlaceholder")}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("passportNumber")}
            </label>
            <input
              name="passport_number"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
              placeholder={t("passportNumberPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("phone")} <span className="text-destructive">*</span>
              </label>
              <input
                name="phone"
                required
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                placeholder={t("phonePlaceholder")}
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("email")}
              </label>
              <input
                name="email"
                type="email"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                placeholder={t("emailPlaceholder")}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("emergencyContact")}
            </label>
            <input
              name="emergency_contact"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder={t("emergencyContactPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("languagePreference")}
            </label>
            <select
              name="language_preference"
              defaultValue="en"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              <option value="en">{t("languages.en")}</option>
              <option value="ar">{t("languages.ar")}</option>
            </select>
          </div>
        </div>

        {/* Lease Details - only shown when assigning from a unit */}
        {unitId && (
          <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-sm font-medium text-text-primary">
              {t("leaseInfo")}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {tl("startDate")} <span className="text-destructive">*</span>
                </label>
                <input
                  name="start_date"
                  type="date"
                  required
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {tl("endDate")} <span className="text-destructive">*</span>
                </label>
                <input
                  name="end_date"
                  type="date"
                  required
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {tl("monthlyRent")} <span className="text-destructive">*</span>
                </label>
                <input
                  name="monthly_rent"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={unitInfo?.rent_amount || ""}
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {tl("securityDeposit")}
                </label>
                <input
                  name="security_deposit"
                  type="number"
                  step="0.01"
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? tc("loading") : tc("save")}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
          >
            {tc("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
