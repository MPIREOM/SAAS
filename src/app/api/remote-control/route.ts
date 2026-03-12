import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Get system status
  const { count: tenantsCount } = await supabase
    .from('tenants')
    .select('*', { count: 'exact', head: true });

  const { count: propertiesCount } = await supabase
    .from('properties')
    .select('*', { count: 'exact', head: true });

  const { count: unitsCount } = await supabase
    .from('units')
    .select('*', { count: 'exact', head: true });

  return NextResponse.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    stats: {
      tenants: tenantsCount ?? 0,
      properties: propertiesCount ?? 0,
      units: unitsCount ?? 0,
    },
    remote_access: {
      available: true,
      endpoints: [
        '/api/tenants',
        '/api/properties',
        '/api/units',
        '/api/scan-id',
        '/api/qr-code'
      ]
    }
  });
}

export async function POST(request: NextRequest) {
  const { action, parameters } = await request.json();
  const supabase = await createClient();

  switch (action) {
    case 'get_stats': {
      const { count: tenantCount } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true });
      return NextResponse.json({ tenant_count: tenantCount ?? 0 });
    }

    case 'health_check':
      return NextResponse.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
      });

    default:
      return NextResponse.json(
        { error: 'Unknown action' },
        { status: 400 }
      );
  }
}