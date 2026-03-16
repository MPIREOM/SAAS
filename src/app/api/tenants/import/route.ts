import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

interface TenantRow {
  full_name: string;
  phone: string;
  email?: string;
  nationality?: string;
  national_id?: string;
  emergency_contact?: string;
  language_preference?: string;
}

// Column name mappings (case-insensitive, flexible)
const COLUMN_MAP: Record<string, keyof TenantRow> = {
  // full_name
  full_name: "full_name",
  fullname: "full_name",
  name: "full_name",
  "full name": "full_name",
  "tenant name": "full_name",
  tenant: "full_name",
  // phone
  phone: "phone",
  "phone number": "phone",
  phonenumber: "phone",
  mobile: "phone",
  "mobile number": "phone",
  tel: "phone",
  telephone: "phone",
  // email
  email: "email",
  "email address": "email",
  // nationality
  nationality: "nationality",
  country: "nationality",
  // national_id
  national_id: "national_id",
  nationalid: "national_id",
  "national id": "national_id",
  "emirates id": "national_id",
  emiratesid: "national_id",
  "id number": "national_id",
  "civil id": "national_id",
  // emergency_contact
  emergency_contact: "emergency_contact",
  emergencycontact: "emergency_contact",
  "emergency contact": "emergency_contact",
  "emergency phone": "emergency_contact",
  // language_preference
  language_preference: "language_preference",
  language: "language_preference",
  lang: "language_preference",
};

function normalizeColumnName(col: string): keyof TenantRow | null {
  const normalized = col.trim().toLowerCase().replace(/[_\-]/g, " ").replace(/\s+/g, " ");
  // Try direct match
  if (COLUMN_MAP[normalized]) return COLUMN_MAP[normalized];
  // Try without spaces
  const noSpaces = normalized.replace(/\s/g, "");
  if (COLUMN_MAP[noSpaces]) return COLUMN_MAP[noSpaces];
  return null;
}

function normalizePhone(phone: string): string {
  // Keep only digits and leading +
  const cleaned = phone.toString().trim();
  if (cleaned.startsWith("+")) {
    return "+" + cleaned.slice(1).replace(/\D/g, "");
  }
  return cleaned.replace(/\D/g, "");
}

function normalizeLanguage(lang: string | undefined): "en" | "ar" {
  if (!lang) return "en";
  const l = lang.toString().trim().toLowerCase();
  if (l === "ar" || l === "arabic" || l === "\u0639\u0631\u0628\u064A" || l === "\u0639\u0631\u0628\u064A\u0629") return "ar";
  return "en";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file size (5MB max)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rawData.length === 0) {
      return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 });
    }

    // Map columns
    const headers = Object.keys(rawData[0]);
    const columnMapping: Record<string, keyof TenantRow> = {};
    for (const header of headers) {
      const mapped = normalizeColumnName(header);
      if (mapped) columnMapping[header] = mapped;
    }

    // Validate required columns exist
    const mappedFields = new Set(Object.values(columnMapping));
    if (!mappedFields.has("full_name")) {
      return NextResponse.json(
        { error: "Missing required column: Full Name. Please ensure your file has a 'Name' or 'Full Name' column." },
        { status: 400 }
      );
    }
    if (!mappedFields.has("phone")) {
      return NextResponse.json(
        { error: "Missing required column: Phone. Please ensure your file has a 'Phone' or 'Mobile' column." },
        { status: 400 }
      );
    }

    // Parse and validate rows
    const tenants: TenantRow[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rawData.length; i++) {
      const raw = rawData[i];
      const tenant: Partial<TenantRow> = {};

      for (const [originalHeader, field] of Object.entries(columnMapping)) {
        const value = raw[originalHeader];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          tenant[field] = String(value).trim();
        }
      }

      // Validate required fields
      if (!tenant.full_name) {
        errors.push({ row: i + 2, message: "Missing full name" });
        continue;
      }
      if (!tenant.phone) {
        errors.push({ row: i + 2, message: "Missing phone number" });
        continue;
      }

      tenant.phone = normalizePhone(tenant.phone);
      tenant.language_preference = normalizeLanguage(tenant.language_preference);

      tenants.push(tenant as TenantRow);
    }

    if (tenants.length === 0) {
      return NextResponse.json(
        { error: "No valid tenant rows found", validationErrors: errors },
        { status: 400 }
      );
    }

    // Check for preview mode (don't insert, just return parsed data)
    const mode = formData.get("mode") as string;
    if (mode === "preview") {
      return NextResponse.json({
        success: true,
        preview: true,
        tenants,
        totalRows: rawData.length,
        validRows: tenants.length,
        errors,
        mappedColumns: Object.entries(columnMapping).map(([original, mapped]) => ({
          original,
          mapped,
        })),
      });
    }

    // Bulk insert tenants
    const insertData = tenants.map((t) => ({
      full_name: t.full_name,
      phone: t.phone,
      email: t.email || null,
      nationality: t.nationality || null,
      national_id: t.national_id || null,
      emergency_contact: t.emergency_contact || null,
      language_preference: t.language_preference || "en",
      status: "active" as const,
      created_by: user.id,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("tenants")
      .insert(insertData)
      .select("id, full_name");

    if (insertError) {
      return NextResponse.json(
        { error: `Database error: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imported: inserted?.length || 0,
      errors,
      tenants: inserted,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process file" },
      { status: 500 }
    );
  }
}
