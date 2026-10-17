"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

// Finger / mouse signature on a canvas. The pad is always white with dark
// ink in both themes: it's the paper the signature is printed from, and the
// PNG goes straight onto the (white) PDF.

const INK = "#1A1A1F";

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  /** PNG data URL cropped to the drawn strokes, or null when empty. */
  toDataUrl: () => string | null;
}

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { label: string; onChange?: (hasInk: boolean) => void; className?: string }
>(function SignaturePad({ label, onChange, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const bounds = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    bounds.current = null;
  }, []);

  useEffect(() => {
    setup();
    // Resizing wipes the canvas, so the tenant re-signs after rotating.
    const onResize = () => {
      setup();
      onChange?.(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup, onChange]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const grow = (p: { x: number; y: number }) => {
    const b = bounds.current;
    bounds.current = b
      ? { minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }
      : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    last.current = p;
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    grow(p);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last.current = p;
    grow(p);
  };

  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    onChange?.(bounds.current !== null);
  };

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      bounds.current = null;
      onChange?.(false);
    },
    isEmpty: () => bounds.current === null,
    toDataUrl: () => {
      const canvas = canvasRef.current;
      const b = bounds.current;
      if (!canvas || !b) return null;
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      const pad = 6;
      const sx = Math.max(0, Math.floor((b.minX - pad) * ratio));
      const sy = Math.max(0, Math.floor((b.minY - pad) * ratio));
      const sw = Math.min(canvas.width - sx, Math.ceil((b.maxX - b.minX + pad * 2) * ratio));
      const sh = Math.min(canvas.height - sy, Math.ceil((b.maxY - b.minY + pad * 2) * ratio));
      const out = document.createElement("canvas");
      out.width = Math.max(sw, 1);
      out.height = Math.max(sh, 1);
      out.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      return out.toDataURL("image/png");
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`block w-full h-44 rounded-xl border border-border/60 bg-white touch-none cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${className ?? ""}`}
    />
  );
});
