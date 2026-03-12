import { getTranslations } from "next-intl/server";
import { DollarSign, Users, Wrench, CreditCard, AlertTriangle } from "lucide-react";
import DownloadReportButtons from "@/components/reports/DownloadReportButtons";

const REPORTS = [
  {
    id: "monthly-rent",
    title: "Monthly Rent Collection",
    description: "Summary of rent payments collected, outstanding amounts, and collection rate for the current month.",
    icon: DollarSign,
    color: "text-success",
    bgColor: "bg-success/10",
    details: ["Paid vs. pending invoices", "Collection rate", "Per-tenant breakdown"],
  },
  {
    id: "tenant-roster",
    title: "Tenant Roster",
    description: "Complete list of all active tenants with their unit assignments, contact information, and lease details.",
    icon: Users,
    color: "text-accent",
    bgColor: "bg-accent/10",
    details: ["Contact info & nationality", "Lease dates & monthly rent", "Landscape A4 format"],
  },
  {
    id: "maintenance-summary",
    title: "Maintenance Summary",
    description: "Overview of all maintenance requests by status, category, priority, and estimated cost.",
    icon: Wrench,
    color: "text-warning",
    bgColor: "bg-warning/10",
    details: ["Open / in-progress / resolved", "Priority breakdown", "Cost estimates"],
  },
  {
    id: "cheque-tracker",
    title: "Cheque Tracker",
    description: "Track all post-dated cheques by status — pending, cleared, bounced, or cancelled.",
    icon: CreditCard,
    color: "text-accent",
    bgColor: "bg-accent/10",
    details: ["Cheque number & bank details", "Status per cheque", "Total value summary"],
  },
  {
    id: "document-expiry",
    title: "Document Expiry Report",
    description: "Documents expiring within 90 days or already expired across all tenants.",
    icon: AlertTriangle,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    details: ["Expired & expiring-soon flags", "Document type & tenant", "Sorted by expiry date"],
  },
];

export default async function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Reports</h1>
        <p className="text-sm text-text-secondary mt-1">
          Generate and download property management reports as PDF
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <div key={report.id} className="bg-surface border border-border rounded-lg p-5 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-md ${report.bgColor}`}>
                  <Icon className={`h-5 w-5 ${report.color}`} />
                </div>
              </div>
              <h3 className="text-base font-medium text-text-primary mb-1.5">{report.title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed mb-3">{report.description}</p>
              <ul className="space-y-1 mb-4 flex-1">
                {report.details.map((d) => (
                  <li key={d} className="text-xs text-text-secondary flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-text-secondary/40 shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
              <DownloadReportButtons reportId={report.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
