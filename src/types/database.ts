// ============================================================================
// MPIRE Property Management System - Database Types
// ============================================================================

// --- Enums ---

export type UserRole = "super_admin" | "property_manager";

export type UnitStatus = "vacant" | "occupied" | "maintenance";

export type TenantStatus = "active" | "archived";

export type PaymentStatus = "paid" | "partial" | "overdue" | "upcoming";

export type PaymentMethod = "cash" | "bank_transfer" | "cheque";

export type ChequeStatus = "pending" | "cleared" | "bounced" | "cancelled";

export type DepositStatus = "pending" | "refunded" | "deducted";

export type MaintenanceStatus = "open" | "in_progress" | "resolved" | "closed";

export type MaintenanceUrgency = "low" | "medium" | "high" | "emergency";

export type MaintenanceCategory =
  | "plumbing"
  | "electrical"
  | "ac"
  | "structural"
  | "other";

export type ReminderType =
  | "rent_upcoming"
  | "rent_overdue"
  | "cheque_due"
  | "lease_expiry";

export type ReminderChannel = "whatsapp" | "email";

export type ReminderStatus = "sent" | "failed" | "pending";

export type DocumentType =
  | "lease_agreement"
  | "id_copy"
  | "passport"
  | "visa"
  | "noc"
  | "title_deed"
  | "permit"
  | "insurance"
  | "custom";

export type LanguagePreference = "en" | "ar";

export type EntityType = "tenant" | "property";

// --- Entity Interfaces ---

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  language_preference: LanguagePreference;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  name: string;
  location: string;
  total_units: number;
  property_type: string;
  is_archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface UserPropertyAssignment {
  id: string;
  user_id: string;
  property_id: string;
  assigned_at: string;
  assigned_by: string;
}

export interface Unit {
  id: string;
  property_id: string;
  unit_number: string;
  floor: number;
  unit_type: string;
  bedrooms: number | null;
  size_sqm: number;
  rent_amount: number;
  status: UnitStatus;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  full_name: string;
  nationality: string;
  national_id: string;
  phone: string;
  email: string;
  emergency_contact: string;
  language_preference: LanguagePreference;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface Lease {
  id: string;
  tenant_id: string;
  unit_id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number;
  payment_due_day: number;
  lease_document_url: string | null;
  is_active: boolean;
  notes: string | null;
  vacate_date: string | null;
  vacate_reason: string | null;
  vacate_notes: string | null;
  final_inspection: boolean;
  keys_returned: boolean;
  deposit_status: DepositStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface Payment {
  id: string;
  lease_id: string;
  tenant_id: string;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  created_by: string;
}

export interface Cheque {
  id: string;
  payment_id: string;
  tenant_id: string;
  cheque_number: string;
  bank_name: string;
  cheque_date: string;
  amount: number;
  status: ChequeStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceRequest {
  id: string;
  unit_id: string;
  tenant_id: string;
  category: MaintenanceCategory;
  description: string;
  urgency: MaintenanceUrgency;
  status: MaintenanceStatus;
  assigned_to_name: string | null;
  assigned_to_phone: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface MaintenanceNote {
  id: string;
  request_id: string;
  note: string;
  created_by_name: string;
  created_at: string;
}

export interface MaintenanceAttachment {
  id: string;
  request_id: string;
  file_url: string;
  file_name: string;
  created_at: string;
}

export interface Document {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  document_type: DocumentType;
  file_url: string;
  file_name: string;
  expiry_date: string | null;
  uploaded_at: string;
  uploaded_by: string;
}

export interface ReminderLog {
  id: string;
  tenant_id: string;
  reminder_type: ReminderType;
  channel: ReminderChannel;
  template_name: string;
  message_content: string;
  status: ReminderStatus;
  sent_at: string;
  error_message: string | null;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  reminder_type: ReminderType;
  channel: ReminderChannel;
  language: LanguagePreference;
  subject: string;
  body_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
