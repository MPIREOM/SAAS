'use client';

import { useState, useEffect } from 'react';

interface SystemStats {
  status: string;
  timestamp: string;
  stats: {
    tenants: number;
    properties: number;
    units: number;
  };
  remote_access: {
    available: boolean;
    endpoints: string[];
  };
}

export default function RemoteControlDashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchStats = async () => {
    setActionLoading(true);
    try {
      const response = await fetch('/api/remote-control');
      const data = await response.json();
      setStats(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
      setActionLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const runHealthCheck = async () => {
    setActionLoading(true);
    try {
      const response = await fetch('/api/remote-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'health_check' })
      });
      const result = await response.json();
      alert(`Health Check: ${result.status} at ${result.timestamp}`);
    } catch (error) {
      alert('Health check failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface-elevated rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-24 bg-surface-elevated rounded"></div>
            <div className="h-24 bg-surface-elevated rounded"></div>
            <div className="h-24 bg-surface-elevated rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 relative">
      {actionLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-text-secondary">Loading...</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">
            Remote Control Dashboard
          </h1>
          <p className="text-text-secondary mt-1">
            Monitor and control your SAAS application remotely
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${stats?.status === 'online' ? 'bg-success' : 'bg-destructive'}`}></div>
          <span className="text-sm text-text-secondary">
            {stats?.status === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-secondary">Total Tenants</p>
              <p className="text-2xl font-bold text-text-primary">
                {stats?.stats.tenants || 0}
              </p>
            </div>
            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
              <span className="text-accent text-lg">👥</span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-secondary">Properties</p>
              <p className="text-2xl font-bold text-text-primary">
                {stats?.stats.properties || 0}
              </p>
            </div>
            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
              <span className="text-accent text-lg">🏢</span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-secondary">Units</p>
              <p className="text-2xl font-bold text-text-primary">
                {stats?.stats.units || 0}
              </p>
            </div>
            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
              <span className="text-accent text-lg">🏠</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-text-primary mb-4">
          Remote Control Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={runHealthCheck}
            disabled={actionLoading}
            className="p-4 bg-accent hover:bg-accent-hover text-background rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-center">
              <span className="text-2xl mb-2 block">🏥</span>
              <span className="font-medium">Health Check</span>
            </div>
          </button>

          <button
            onClick={fetchStats}
            disabled={actionLoading}
            className="p-4 bg-surface-elevated hover:bg-surface border border-border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-center">
              <span className="text-2xl mb-2 block">🔄</span>
              <span className="font-medium">Refresh Stats</span>
            </div>
          </button>

          <button
            onClick={() => window.open('/qr-code', '_blank')}
            disabled={actionLoading}
            className="p-4 bg-surface-elevated hover:bg-surface border border-border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-center">
              <span className="text-2xl mb-2 block">📱</span>
              <span className="font-medium">Generate QR</span>
            </div>
          </button>
        </div>
      </div>

      {/* API Endpoints */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-text-primary mb-4">
          Available API Endpoints
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {stats?.remote_access.endpoints.map((endpoint) => (
            <div
              key={endpoint}
              className="p-3 bg-surface-elevated rounded border font-mono text-sm"
            >
              {endpoint}
            </div>
          ))}
        </div>
      </div>

      {/* Status Information */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-text-primary mb-4">
          System Information
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Last Update:</span>
            <span className="font-mono">
              {lastUpdate?.toLocaleString() || 'Never'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Server Time:</span>
            <span className="font-mono">
              {stats?.timestamp ? new Date(stats.timestamp).toLocaleString() : 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Remote Access:</span>
            <span className={`font-medium ${stats?.remote_access.available ? 'text-success' : 'text-destructive'}`}>
              {stats?.remote_access.available ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}