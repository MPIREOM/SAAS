import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import {
  BarChart3,
  Download,
  FileText,
  DollarSign,
  Users,
  Wrench,
  CreditCard,
  AlertTriangle,
} from "lucide-react";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("reports");
  const tc = await getTranslations("common");

  const reports = [
    {
      id: "monthly-rent",
      title: "Monthly Rent Collection",
      description:
        "Summary of rent payments collected, outstanding amounts, and collection rate for the selected period.",
      icon: DollarSign,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      id: "tenant-roster",
      title: "Tenant Roster",
      description:
        "Complete list of all active tenants with their unit assignments, contact information, and lease details.",
      icon: Users,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      id: "maintenance-summary",
      title: "Maintenance Summary",
      description:
        "Overview of maintenance requests by status, category, and response time. Includes cost analysis.",
      icon: Wrench,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      id: "cheque-tracker",
      title: "Cheque Tracker",
      description:
        "Track post-dated cheques by status, upcoming deposits, and bounced cheque history.",
      icon: CreditCard,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      id: "document-expiry",
      title: "Document Expiry Report",
      description:
        "List of documents nearing expiry or already expired. Includes tenant IDs, contracts, and insurance.",
      icon: AlertTriangle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Reports
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Generate and download property management reports
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => {
          const Icon = report.icon;

          return (
            <div
              key={report.id}
              className="bg-surface border border-border rounded-lg p-5 flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-md ${report.bgColor}`}>
                  <Icon className={`h-5 w-5 ${report.color}`} />
                </div>
              </div>
              <h3 className="text-base font-medium text-text-primary mb-2">
                {report.title}
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed mb-4 flex-1">
                {report.description}
              </p>
              <div className="flex items-center gap-2 pt-3 border-t border-border">
                <button className="inline-flex items-center gap-1.5 h-8 px-3 bg-accent hover:bg-accent-hover text-background text-xs font-medium rounded-md transition-colors">
                  <FileText className="h-3.5 w-3.5" />
                  PDF
                </button>
                <button className="inline-flex items-center gap-1.5 h-8 px-3 bg-surface-elevated border border-border text-text-primary text-xs font-medium rounded-md hover:bg-border/30 transition-colors">
                  <Download className="h-3.5 w-3.5" />
                  Excel
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
