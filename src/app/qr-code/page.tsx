'use client';

import { useState } from 'react';

export default function QRCodeGenerator() {
  const [text, setText] = useState('https://claude.ai');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generateQR = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/qr-code?text=${encodeURIComponent(text)}`);
      const data = await response.json();
      setQrCode(data.qrCode);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }
    setLoading(false);
  };

  const commonOptions = [
    { label: 'Claude.ai Website', value: 'https://claude.ai' },
    { label: 'Anthropic Console', value: 'https://console.anthropic.com' },
    { label: 'Your SAAS App', value: 'http://localhost:3000' },
    { label: 'Supabase Dashboard', value: 'https://supabase.com/dashboard' },
    { label: 'GitHub Repository', value: 'https://github.com' },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          QR Code Generator
        </h1>
        <p className="text-text-secondary">
          Generate QR codes for remote access and sharing
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Content for QR Code
          </label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent"
            placeholder="Enter URL or text"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Quick Options
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {commonOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setText(option.value)}
                className="p-2 text-left text-sm bg-surface-elevated hover:bg-surface border border-border rounded-md transition-colors"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={generateQR}
          disabled={loading}
          className="w-full h-10 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate QR Code'}
        </button>
      </div>

      {qrCode && (
        <div className="text-center space-y-4">
          <div className="bg-white p-4 rounded-lg inline-block">
            <img src={qrCode} alt="QR Code" className="max-w-full h-auto" />
          </div>
          <div>
            <p className="text-sm text-text-secondary mb-2">QR Code contains:</p>
            <p className="text-xs font-mono bg-surface-elevated p-2 rounded border break-all">
              {text}
            </p>
          </div>
          <button
            onClick={() => {
              const link = document.createElement('a');
              link.download = 'qrcode.png';
              link.href = qrCode;
              link.click();
            }}
            className="px-4 py-2 bg-surface-elevated hover:bg-surface border border-border rounded-md text-sm transition-colors"
          >
            Download QR Code
          </button>
        </div>
      )}

      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="font-medium text-text-primary mb-2">Remote Control Options</h3>
        <ul className="text-sm text-text-secondary space-y-1">
          <li>• <strong>VS Code Live Share:</strong> Real-time collaborative coding</li>
          <li>• <strong>ngrok:</strong> Share your local development server</li>
          <li>• <strong>Supabase Dashboard:</strong> Remote database management</li>
          <li>• <strong>Anthropic Console:</strong> Monitor Claude API usage</li>
          <li>• <strong>GitHub:</strong> Version control and collaboration</li>
        </ul>
      </div>
    </div>
  );
}