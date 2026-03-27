"use client";

import { useState } from "react";
import { MessageSquare, Send, CheckCircle2, XCircle, Loader2, Info } from "lucide-react";

export default function WhatsAppTestPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [templateName, setTemplateName] = useState("hello_world");
  const [languageCode, setLanguageCode] = useState("en_US");
  const [loading, setLoading] = useState(false);

  const templateLanguageMap: Record<string, string> = {
    hello_world: "en_US",
    mpire_rent_upcoming_en: "en",
    mpire_rent_upcoming_ar: "ar",
    mpire_rent_overdue_en: "en",
    mpire_rent_overdue_ar: "ar",
    mpire_cheque_due_en: "en",
    mpire_cheque_due_ar: "ar",
    mpire_lease_expiry_en: "en",
    mpire_lease_expiry_ar: "ar",
  };

  const handleTemplateChange = (template: string) => {
    setTemplateName(template);
    const lang = templateLanguageMap[template];
    if (lang) setLanguageCode(lang);
  };
  const [result, setResult] = useState<{
    success: boolean;
    messageId?: string;
    sentTo?: string;
    error?: string;
    errorCode?: number;
    errorType?: string;
    details?: Record<string, unknown>;
  } | null>(null);

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
    <div className="space-y-8 max-w-2xl stagger-children">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-semibold text-text-primary font-display">
          WhatsApp Test
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Send a test message via Meta WhatsApp Cloud API
        </p>
      </div>

      {/* Info Card */}
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-accent mt-0.5 shrink-0" />
          <div className="text-sm text-text-secondary space-y-1">
            <p>
              <strong className="text-text-primary">hello_world</strong> is
              Meta&apos;s pre-approved test template. Use it to verify your API
              connection without creating custom templates.
            </p>
            <p>
              The recipient must have a WhatsApp account and the phone number
              must include the country code (e.g. +968XXXXXXXX).
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-accent/10 rounded-md">
            <MessageSquare className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary font-display">
              Send Test Message
            </h2>
            <p className="text-xs text-text-secondary">
              Test your Meta WhatsApp Business API credentials
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Phone Number */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+968XXXXXXXX"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent font-mono"
            />
            <p className="text-xs text-text-secondary mt-1">
              Include country code (e.g. +968 for Oman)
            </p>
          </div>

          {/* Template Name */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Template Name
            </label>
            <select
              value={templateName}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            >
              <option value="hello_world">hello_world (Meta default)</option>
              <option value="mpire_rent_upcoming_en">mpire_rent_upcoming_en (English)</option>
              <option value="mpire_rent_upcoming_ar">mpire_rent_upcoming_ar (Arabic)</option>
              <option value="mpire_rent_overdue_en">mpire_rent_overdue_en (English)</option>
              <option value="mpire_rent_overdue_ar">mpire_rent_overdue_ar (Arabic)</option>
              <option value="mpire_lease_expiry_en">mpire_lease_expiry_en (English)</option>
              <option value="mpire_lease_expiry_ar">mpire_lease_expiry_ar (Arabic)</option>
            </select>
            <p className="text-xs text-text-secondary mt-1">
              Use hello_world to test API connectivity first
            </p>
          </div>

          {/* Language Code */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Language Code
            </label>
            <select
              value={languageCode}
              onChange={(e) => setLanguageCode(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            >
              <option value="en_US">en_US (English)</option>
              <option value="en">en (English)</option>
              <option value="ar">ar (Arabic)</option>
            </select>
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!phoneNumber || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Test Message
              </>
            )}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`border rounded-lg p-6 ${
            result.success
              ? "bg-green-500/5 border-green-500/20"
              : "bg-red-500/5 border-red-500/20"
          }`}
        >
          <div className="flex items-center gap-3 mb-4">
            {result.success ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <h3
              className={`text-base font-medium ${
                result.success ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
              }`}
            >
              {result.success ? "Message Sent Successfully" : "Failed to Send"}
            </h3>
          </div>

          <div className="space-y-2 text-sm font-mono">
            {result.success && (
              <>
                <div className="flex gap-2">
                  <span className="text-text-secondary">Message ID:</span>
                  <span className="text-text-primary break-all">{result.messageId}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-text-secondary">Sent to:</span>
                  <span className="text-text-primary">{result.sentTo}</span>
                </div>
              </>
            )}
            {!result.success && (
              <>
                <div className="flex gap-2">
                  <span className="text-text-secondary">Error:</span>
                  <span className="text-red-600 dark:text-red-400">{result.error}</span>
                </div>
                {result.errorCode && (
                  <div className="flex gap-2">
                    <span className="text-text-secondary">Code:</span>
                    <span className="text-text-primary">{result.errorCode}</span>
                  </div>
                )}
                {result.errorType && (
                  <div className="flex gap-2">
                    <span className="text-text-secondary">Type:</span>
                    <span className="text-text-primary">{result.errorType}</span>
                  </div>
                )}
                {result.details && (
                  <details className="mt-2">
                    <summary className="text-text-secondary cursor-pointer hover:text-text-primary text-xs">
                      Full error details
                    </summary>
                    <pre className="mt-2 p-3 bg-background rounded-md text-xs overflow-auto max-h-48">
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
