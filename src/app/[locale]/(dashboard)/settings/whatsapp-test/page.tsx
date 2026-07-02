"use client";

import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const templateLanguageMap: Record<string, string> = {
  hello_world: "en_US",
  mpire_rent_upcoming_en: "en",
  mpire_rent_upcoming_ar: "ar",
  mpire_rent_overdue_en: "en",
  mpire_rent_overdue_ar: "ar",
  mpire_lease_expiry_en: "en",
  mpire_lease_expiry_ar: "ar",
  daily_briefs: "en",
};

interface ParamFieldConfig {
  key: string;
  label: string;
  placeholder: string;
  defaultValue: string;
}

const rentParamFields: ParamFieldConfig[] = [
  { key: "tenantName", label: "Tenant Name", placeholder: "John Doe", defaultValue: "Test Tenant" },
  { key: "unitNumber", label: "Unit Number", placeholder: "101", defaultValue: "101" },
  { key: "propertyName", label: "Property Name", placeholder: "Al Khuwair Tower", defaultValue: "Test Property" },
  { key: "amount", label: "Amount", placeholder: "500", defaultValue: "500" },
  { key: "dueDate", label: "Due Date", placeholder: "2026-04-01", defaultValue: "2026-04-01" },
];

const summaryParamFields: ParamFieldConfig[] = [
  { key: "date", label: "Date", placeholder: "Thursday, 27 March 2026", defaultValue: "Thursday, 27 March 2026" },
  { key: "invoicesDue", label: "Invoices Due Count", placeholder: "3", defaultValue: "3" },
  { key: "invoicesDueAmount", label: "Invoices Due Amount", placeholder: "1500.00", defaultValue: "1500.00" },
  { key: "overdueCount", label: "Overdue Count", placeholder: "2", defaultValue: "2" },
  { key: "overdueAmount", label: "Overdue Amount", placeholder: "800.00", defaultValue: "800.00" },
  { key: "chequesCount", label: "Cheques Due Count", placeholder: "1", defaultValue: "1" },
  { key: "chequesAmount", label: "Cheques Amount", placeholder: "500.00", defaultValue: "500.00" },
  { key: "newMaintenance", label: "New Maintenance Count", placeholder: "1", defaultValue: "1" },
  { key: "openMaintenance", label: "Open Maintenance Count", placeholder: "4", defaultValue: "4" },
];

const templateParamConfig: Record<string, { fields: ParamFieldConfig[]; defaults: Record<string, string> }> = {
  mpire_rent_upcoming_en: { fields: rentParamFields, defaults: { tenantName: "Test Tenant", unitNumber: "101", propertyName: "Test Property", amount: "500", dueDate: "2026-04-01" } },
  mpire_rent_upcoming_ar: { fields: rentParamFields, defaults: { tenantName: "Test Tenant", unitNumber: "101", propertyName: "Test Property", amount: "500", dueDate: "2026-04-01" } },
  mpire_rent_overdue_en: { fields: rentParamFields, defaults: { tenantName: "Test Tenant", unitNumber: "101", propertyName: "Test Property", amount: "500", dueDate: "2026-04-01" } },
  mpire_rent_overdue_ar: { fields: rentParamFields, defaults: { tenantName: "Test Tenant", unitNumber: "101", propertyName: "Test Property", amount: "500", dueDate: "2026-04-01" } },
  mpire_lease_expiry_en: { fields: rentParamFields, defaults: { tenantName: "Test Tenant", unitNumber: "101", propertyName: "Test Property", amount: "500", dueDate: "2026-04-01" } },
  mpire_lease_expiry_ar: { fields: rentParamFields, defaults: { tenantName: "Test Tenant", unitNumber: "101", propertyName: "Test Property", amount: "500", dueDate: "2026-04-01" } },
  daily_briefs: { fields: summaryParamFields, defaults: { date: "Thursday, 27 March 2026", invoicesDue: "3", invoicesDueAmount: "1500.00", overdueCount: "2", overdueAmount: "800.00", chequesCount: "1", chequesAmount: "500.00", newMaintenance: "1", openMaintenance: "4" } },
};

export default function WhatsAppTestPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [templateName, setTemplateName] = useState("hello_world");
  const [languageCode, setLanguageCode] = useState("en_US");
  const [params, setParams] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    messageId?: string;
    sentTo?: string;
    error?: string;
    errorCode?: number;
    errorType?: string;
    details?: Record<string, unknown>;
  } | null>(null);

  const templateConfig = templateParamConfig[templateName];
  const paramFields = templateConfig?.fields || [];

  const handleTemplateChange = (template: string) => {
    setTemplateName(template);
    const lang = templateLanguageMap[template];
    if (lang) setLanguageCode(lang);
    // Reset params to defaults for new template
    const config = templateParamConfig[template];
    setParams(config?.defaults || {});
  };

  const handleSend = async () => {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          templateName: templateName || "hello_world",
          languageCode: languageCode || "en_US",
          ...(paramFields.length > 0 && {
            parameters: paramFields.map((f) => params[f.key] || f.defaultValue),
          }),
        }),
      });

      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: "Network error - could not reach API" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6 stagger-children">
      <PageHeader
        title="WhatsApp Test"
        description="Send a test message via Meta WhatsApp Cloud API"
      />

      {/* Info banner */}
      <Alert variant="info" className="animate-fade-in-up">
        <div className="space-y-1 text-text-secondary">
          <p>
            <strong className="text-text-primary">hello_world</strong> is
            Meta&apos;s pre-approved test template. Use it to verify your API
            connection without creating custom templates.
          </p>
          <p>
            The recipient must have a WhatsApp account and the phone number
            must include the country code (e.g.{" "}
            <span className="ltr-nums font-mono">+968XXXXXXXX</span>).
          </p>
        </div>
      </Alert>

      {/* Form */}
      <section
        aria-labelledby="whatsapp-test-heading"
        className="rounded-xl border border-border/60 bg-surface p-5 sm:p-6"
      >
        <div className="mb-6 flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-accent/10 p-2" aria-hidden="true">
            <MessageSquare className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2
              id="whatsapp-test-heading"
              className="font-display text-base font-semibold tracking-tight text-text-primary"
            >
              Send Test Message
            </h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Test your Meta WhatsApp Business API credentials
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Phone Number */}
          <Input
            type="tel"
            label="Phone Number *"
            required
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+968XXXXXXXX"
            helperText="Include country code (e.g. +968 for Oman)"
            className="ltr-nums font-mono"
          />

          {/* Template Name */}
          <Select
            label="Template Name"
            value={templateName}
            onChange={(e) => handleTemplateChange(e.target.value)}
            helperText="Use hello_world to test API connectivity first"
          >
            <option value="hello_world">hello_world (Meta default)</option>
            <option value="daily_briefs">daily_briefs (Daily Summary)</option>
            <option value="mpire_rent_upcoming_en">mpire_rent_upcoming_en (English)</option>
            <option value="mpire_rent_upcoming_ar">mpire_rent_upcoming_ar (Arabic)</option>
            <option value="mpire_rent_overdue_en">mpire_rent_overdue_en (English)</option>
            <option value="mpire_rent_overdue_ar">mpire_rent_overdue_ar (Arabic)</option>
            <option value="mpire_lease_expiry_en">mpire_lease_expiry_en (English)</option>
            <option value="mpire_lease_expiry_ar">mpire_lease_expiry_ar (Arabic)</option>
          </Select>

          {/* Language Code */}
          <Select
            label="Language Code"
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
          >
            <option value="en_US">en_US (English US)</option>
            <option value="en">en (English)</option>
            <option value="ar">ar (Arabic)</option>
          </Select>

          {/* Template Parameters */}
          {paramFields.length > 0 && (
            <div className="space-y-3 rounded-lg border border-border/50 bg-surface-elevated/50 p-4">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Template Parameters
                </p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  These values will be inserted into the template placeholders
                </p>
              </div>
              {paramFields.map((field) => (
                <Input
                  key={field.key}
                  type="text"
                  label={field.label}
                  value={params[field.key] || ""}
                  onChange={(e) =>
                    setParams((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                  className="h-9"
                />
              ))}
            </div>
          )}

          {/* Send Button */}
          <Button
            type="button"
            onClick={handleSend}
            disabled={!phoneNumber || loading}
            loading={loading}
            className="w-full"
          >
            {!loading && <Send aria-hidden="true" className="h-4 w-4" />}
            {loading ? "Sending..." : "Send Test Message"}
          </Button>
        </div>
      </section>

      {/* Result */}
      {result && (
        <Alert
          variant={result.success ? "success" : "destructive"}
          title={result.success ? "Message Sent Successfully" : "Failed to Send"}
          className="animate-fade-in-up"
        >
          <div className="mt-1 space-y-2 font-mono text-sm text-text-primary">
            {result.success && (
              <>
                <div className="flex flex-wrap gap-2">
                  <span className="text-text-secondary">Message ID:</span>
                  <span className="ltr-nums break-all">{result.messageId}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-text-secondary">Sent to:</span>
                  <span className="ltr-nums">{result.sentTo}</span>
                </div>
              </>
            )}
            {!result.success && (
              <>
                <div className="flex flex-wrap gap-2">
                  <span className="text-text-secondary">Error:</span>
                  <span className="text-destructive">{result.error}</span>
                </div>
                {result.errorCode && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-text-secondary">Code:</span>
                    <span className="ltr-nums">{result.errorCode}</span>
                  </div>
                )}
                {result.errorType && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-text-secondary">Type:</span>
                    <span>{result.errorType}</span>
                  </div>
                )}
                {result.details && (
                  <details className="mt-2">
                    <summary className="cursor-pointer rounded text-xs text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                      Full error details
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border/60 bg-surface p-3 text-xs">
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
        </Alert>
      )}
    </div>
  );
}
