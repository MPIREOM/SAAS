-- MPIRE Property Management System - Initial Schema
-- All tables use UUIDs, created_at/updated_at, and RLS

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('super_admin', 'property_manager');
CREATE TYPE unit_status AS ENUM ('vacant', 'occupied', 'maintenance');
CREATE TYPE unit_type AS ENUM ('studio', '1br', '2br', '3br', '4br', 'penthouse', 'office', 'shop', 'warehouse');
CREATE TYPE tenant_status AS ENUM ('active', 'archived');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'cheque');
CREATE TYPE cheque_status AS ENUM ('pending', 'cleared', 'bounced', 'cancelled');
CREATE TYPE maintenance_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE maintenance_urgency AS ENUM ('low', 'medium', 'high', 'emergency');
CREATE TYPE maintenance_category AS ENUM ('plumbing', 'electrical', 'ac', 'structural', 'other');
CREATE TYPE reminder_type AS ENUM ('rent_upcoming', 'rent_overdue', 'cheque_due', 'lease_expiry');
CREATE TYPE reminder_channel AS ENUM ('whatsapp', 'email');
CREATE TYPE reminder_status AS ENUM ('sent', 'failed', 'pending');
CREATE TYPE document_type AS ENUM ('lease_agreement', 'id_copy', 'passport', 'visa', 'noc', 'title_deed', 'permit', 'insurance', 'custom');
CREATE TYPE entity_type AS ENUM ('tenant', 'property');
CREATE TYPE language_preference AS ENUM ('en', 'ar');

-- ============================================
-- USERS & AUTH
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'property_manager',
  is_active BOOLEAN NOT NULL DEFAULT true,
  language_preference language_preference NOT NULL DEFAULT 'en',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_property_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES users(id),
  UNIQUE(user_id, property_id)
);

-- ============================================
-- PROPERTIES & UNITS
-- ============================================

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  total_units INTEGER DEFAULT 0,
  property_type TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  floor INTEGER,
  unit_type unit_type,
  size_sqm NUMERIC(10, 2),
  rent_amount NUMERIC(10, 2) NOT NULL,
  status unit_status NOT NULL DEFAULT 'vacant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, unit_number)
);

-- ============================================
-- TENANTS & LEASES
-- ============================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  nationality TEXT,
  national_id TEXT,
  passport_number TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  emergency_contact TEXT,
  language_preference language_preference NOT NULL DEFAULT 'en',
  status tenant_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  monthly_rent NUMERIC(10, 2) NOT NULL,
  security_deposit NUMERIC(10, 2),
  payment_due_day INTEGER NOT NULL DEFAULT 1 CHECK (payment_due_day BETWEEN 1 AND 28),
  lease_document_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

-- ============================================
-- PAYMENTS & CHEQUES
-- ============================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  payment_date DATE NOT NULL,
  method payment_method NOT NULL DEFAULT 'cash',
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE cheques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cheque_number TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  cheque_date DATE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status cheque_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- MAINTENANCE
-- ============================================

CREATE TABLE maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  category maintenance_category NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  urgency maintenance_urgency NOT NULL DEFAULT 'medium',
  status maintenance_status NOT NULL DEFAULT 'open',
  assigned_to_name TEXT,
  assigned_to_phone TEXT,
  estimated_cost NUMERIC(10, 2),
  actual_cost NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE maintenance_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- DOCUMENTS
-- ============================================

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  document_type document_type NOT NULL DEFAULT 'custom',
  file_url TEXT NOT NULL,
  file_name TEXT,
  expiry_date DATE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES users(id)
);

-- ============================================
-- REMINDERS & TEMPLATES
-- ============================================

CREATE TABLE reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reminder_type reminder_type NOT NULL,
  channel reminder_channel NOT NULL,
  template_name TEXT,
  message_content TEXT,
  status reminder_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  reminder_type reminder_type NOT NULL,
  channel reminder_channel NOT NULL,
  language language_preference NOT NULL DEFAULT 'en',
  subject TEXT,
  body_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_units_property ON units(property_id);
CREATE INDEX idx_units_status ON units(status);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_leases_tenant ON leases(tenant_id);
CREATE INDEX idx_leases_unit ON leases(unit_id);
CREATE INDEX idx_leases_active ON leases(is_active) WHERE is_active = true;
CREATE INDEX idx_payments_lease ON payments(lease_id);
CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_date ON payments(payment_date);
CREATE INDEX idx_cheques_tenant ON cheques(tenant_id);
CREATE INDEX idx_cheques_status ON cheques(status);
CREATE INDEX idx_cheques_date ON cheques(cheque_date);
CREATE INDEX idx_maintenance_unit ON maintenance_requests(unit_id);
CREATE INDEX idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX idx_documents_expiry ON documents(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_reminder_logs_tenant ON reminder_logs(tenant_id);
CREATE INDEX idx_user_property_user ON user_property_assignments(user_id);
CREATE INDEX idx_user_property_property ON user_property_assignments(property_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_property_assignments ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: check if user has access to a property
CREATE OR REPLACE FUNCTION has_property_access(prop_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM user_property_assignments
    WHERE user_id = auth.uid() AND property_id = prop_id
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Users: read own profile or all if super_admin
CREATE POLICY "users_select" ON users FOR SELECT USING (
  id = auth.uid() OR is_super_admin()
);
CREATE POLICY "users_update" ON users FOR UPDATE USING (
  id = auth.uid() OR is_super_admin()
);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (is_super_admin());

-- Properties: super_admin sees all, PM sees assigned only
CREATE POLICY "properties_select" ON properties FOR SELECT USING (
  is_super_admin() OR has_property_access(id)
);
CREATE POLICY "properties_insert" ON properties FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY "properties_update" ON properties FOR UPDATE USING (is_super_admin());

-- Units: access via property
CREATE POLICY "units_select" ON units FOR SELECT USING (
  has_property_access(property_id)
);
CREATE POLICY "units_insert" ON units FOR INSERT WITH CHECK (
  has_property_access(property_id)
);
CREATE POLICY "units_update" ON units FOR UPDATE USING (
  has_property_access(property_id)
);

-- Tenants: accessible to all authenticated staff
CREATE POLICY "tenants_select" ON tenants FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "tenants_insert" ON tenants FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "tenants_update" ON tenants FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Leases: accessible via unit's property
CREATE POLICY "leases_select" ON leases FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM units WHERE units.id = leases.unit_id AND has_property_access(units.property_id)
  )
);
CREATE POLICY "leases_insert" ON leases FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "leases_update" ON leases FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Payments: accessible to all authenticated staff
CREATE POLICY "payments_select" ON payments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "payments_insert" ON payments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Cheques: accessible to all authenticated staff
CREATE POLICY "cheques_select" ON cheques FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cheques_insert" ON cheques FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "cheques_update" ON cheques FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Maintenance: accessible via unit's property
CREATE POLICY "maintenance_select" ON maintenance_requests FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM units WHERE units.id = maintenance_requests.unit_id AND has_property_access(units.property_id)
  )
);
CREATE POLICY "maintenance_insert" ON maintenance_requests FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "maintenance_update" ON maintenance_requests FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "maintenance_notes_select" ON maintenance_notes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "maintenance_notes_insert" ON maintenance_notes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "maintenance_attachments_select" ON maintenance_attachments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "maintenance_attachments_insert" ON maintenance_attachments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Documents: scoped by entity
CREATE POLICY "documents_select" ON documents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "documents_insert" ON documents FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Reminder logs: accessible to all authenticated staff
CREATE POLICY "reminder_logs_select" ON reminder_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "reminder_logs_insert" ON reminder_logs FOR INSERT WITH CHECK (true); -- Service role for cron

-- Notification templates: super_admin manages, all can read
CREATE POLICY "templates_select" ON notification_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "templates_insert" ON notification_templates FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY "templates_update" ON notification_templates FOR UPDATE USING (is_super_admin());

-- User property assignments
CREATE POLICY "upa_select" ON user_property_assignments FOR SELECT USING (
  user_id = auth.uid() OR is_super_admin()
);
CREATE POLICY "upa_insert" ON user_property_assignments FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY "upa_delete" ON user_property_assignments FOR DELETE USING (is_super_admin());

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER leases_updated_at BEFORE UPDATE ON leases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER cheques_updated_at BEFORE UPDATE ON cheques FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER maintenance_requests_updated_at BEFORE UPDATE ON maintenance_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER notification_templates_updated_at BEFORE UPDATE ON notification_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- AUTO-CREATE USER PROFILE ON SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- SEED: Default notification templates
-- ============================================

INSERT INTO notification_templates (name, reminder_type, channel, language, subject, body_template) VALUES
-- English WhatsApp templates
('Rent Upcoming EN', 'rent_upcoming', 'whatsapp', 'en', NULL, 'Dear {{tenant_name}}, this is a reminder that your rent of {{amount}} OMR for unit {{unit_number}} at {{property_name}} is due on {{due_date}}. Please ensure timely payment.'),
('Rent Overdue EN', 'rent_overdue', 'whatsapp', 'en', NULL, 'Dear {{tenant_name}}, your rent of {{amount}} OMR for unit {{unit_number}} at {{property_name}} is overdue since {{due_date}}. Please settle the amount immediately.'),
('Cheque Due EN', 'cheque_due', 'whatsapp', 'en', NULL, 'Dear {{tenant_name}}, cheque #{{cheque_number}} for {{amount}} OMR is due on {{due_date}}. Please ensure sufficient funds are available.'),
('Lease Expiry EN', 'lease_expiry', 'whatsapp', 'en', NULL, 'Dear {{tenant_name}}, your lease for unit {{unit_number}} at {{property_name}} expires on {{due_date}}. Please contact us to discuss renewal.'),
-- Arabic WhatsApp templates
('Rent Upcoming AR', 'rent_upcoming', 'whatsapp', 'ar', NULL, 'عزيزي/عزيزتي {{tenant_name}}، هذا تذكير بأن إيجار الوحدة {{unit_number}} في {{property_name}} بمبلغ {{amount}} ر.ع. يستحق في {{due_date}}. يرجى التأكد من الدفع في الموعد المحدد.'),
('Rent Overdue AR', 'rent_overdue', 'whatsapp', 'ar', NULL, 'عزيزي/عزيزتي {{tenant_name}}، إيجار الوحدة {{unit_number}} في {{property_name}} بمبلغ {{amount}} ر.ع. متأخر منذ {{due_date}}. يرجى تسوية المبلغ فوراً.'),
('Cheque Due AR', 'cheque_due', 'whatsapp', 'ar', NULL, 'عزيزي/عزيزتي {{tenant_name}}، الشيك رقم {{cheque_number}} بمبلغ {{amount}} ر.ع. يستحق في {{due_date}}. يرجى التأكد من توفر الرصيد الكافي.'),
('Lease Expiry AR', 'lease_expiry', 'whatsapp', 'ar', NULL, 'عزيزي/عزيزتي {{tenant_name}}، عقد إيجار الوحدة {{unit_number}} في {{property_name}} ينتهي في {{due_date}}. يرجى التواصل معنا لمناقشة التجديد.'),
-- English Email templates
('Rent Upcoming Email EN', 'rent_upcoming', 'email', 'en', 'Rent Payment Reminder - MPIRE', 'Dear {{tenant_name}},\n\nThis is a reminder that your rent of {{amount}} OMR for unit {{unit_number}} at {{property_name}} is due on {{due_date}}.\n\nPlease ensure timely payment.\n\nBest regards,\nMPIRE Property Management'),
('Rent Overdue Email EN', 'rent_overdue', 'email', 'en', 'Overdue Rent Notice - MPIRE', 'Dear {{tenant_name}},\n\nYour rent of {{amount}} OMR for unit {{unit_number}} at {{property_name}} is overdue since {{due_date}}.\n\nPlease settle the amount at your earliest convenience.\n\nBest regards,\nMPIRE Property Management'),
('Cheque Due Email EN', 'cheque_due', 'email', 'en', 'Cheque Due Reminder - MPIRE', 'Dear {{tenant_name}},\n\nCheque #{{cheque_number}} for {{amount}} OMR is due on {{due_date}}.\n\nPlease ensure sufficient funds are available.\n\nBest regards,\nMPIRE Property Management'),
('Lease Expiry Email EN', 'lease_expiry', 'email', 'en', 'Lease Expiry Notice - MPIRE', 'Dear {{tenant_name}},\n\nYour lease for unit {{unit_number}} at {{property_name}} expires on {{due_date}}.\n\nPlease contact us to discuss renewal options.\n\nBest regards,\nMPIRE Property Management'),
-- Arabic Email templates
('Rent Upcoming Email AR', 'rent_upcoming', 'email', 'ar', 'تذكير بدفع الإيجار - MPIRE', 'عزيزي/عزيزتي {{tenant_name}}،\n\nهذا تذكير بأن إيجار الوحدة {{unit_number}} في {{property_name}} بمبلغ {{amount}} ر.ع. يستحق في {{due_date}}.\n\nيرجى التأكد من الدفع في الموعد المحدد.\n\nمع أطيب التحيات،\nإدارة عقارات MPIRE'),
('Rent Overdue Email AR', 'rent_overdue', 'email', 'ar', 'إشعار تأخر الإيجار - MPIRE', 'عزيزي/عزيزتي {{tenant_name}}،\n\nإيجار الوحدة {{unit_number}} في {{property_name}} بمبلغ {{amount}} ر.ع. متأخر منذ {{due_date}}.\n\nيرجى تسوية المبلغ في أقرب وقت ممكن.\n\nمع أطيب التحيات،\nإدارة عقارات MPIRE'),
('Cheque Due Email AR', 'cheque_due', 'email', 'ar', 'تذكير باستحقاق الشيك - MPIRE', 'عزيزي/عزيزتي {{tenant_name}}،\n\nالشيك رقم {{cheque_number}} بمبلغ {{amount}} ر.ع. يستحق في {{due_date}}.\n\nيرجى التأكد من توفر الرصيد الكافي.\n\nمع أطيب التحيات،\nإدارة عقارات MPIRE'),
('Lease Expiry Email AR', 'lease_expiry', 'email', 'ar', 'إشعار انتهاء عقد الإيجار - MPIRE', 'عزيزي/عزيزتي {{tenant_name}}،\n\nعقد إيجار الوحدة {{unit_number}} في {{property_name}} ينتهي في {{due_date}}.\n\nيرجى التواصل معنا لمناقشة تجديد العقد.\n\nمع أطيب التحيات،\nإدارة عقارات MPIRE');
