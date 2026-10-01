-- 049_visit_booking_contact_phone.sql
--
-- Tenants no longer prove their unit with the last 4 digits of the lease
-- phone (046); instead they type the phone number they want to be reached
-- on, which is required but not checked against the unit. It is stored on
-- the booking and used for the WhatsApp confirmation and reminder, and
-- shown to staff and the contractor. NULL for bookings made before this
-- change and for staff bookings, which fall back to the lease phone.
--
-- visit_verification_failures (046) is no longer written to; it is kept
-- so historical rows aren't lost.

ALTER TABLE visit_bookings ADD COLUMN IF NOT EXISTS contact_phone TEXT;
