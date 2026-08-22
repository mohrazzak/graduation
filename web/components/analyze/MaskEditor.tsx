"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { imageDataHasSelection, interpolateStroke, type Point } from "@/lib/mask-editor";

export interface MaskEditorHandle {
  exportMask: () => Promise<Blob | null>;
  hasSelection: () => boolean;
}

export const MaskEditor = forwardRef<
  MaskEditorHandle,
  { sourceSrc: string; maskSrc: string; onSelectionChange: (selected: boolean) => void }
>(function MaskEditor({ sourceSrc, maskSrc, onSelectionChange }, ref) {
  const t = useTranslations();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialRef = useRef<ImageData | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const pointerRef = useRef<Point | null>(null);
  const [mode, setMode] = useState<"brush" | "erase">("brush");
  const [size, setSize] = useState(32);
  const [canUndo, setCanUndo] = useState(false);

  const publishSelection = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (canvas && context) {
      onSelectionChange(imageDataHasSelection(context.getImageData(0, 0, canvas.width, canvas.height)));
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.fillStyle = "black";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const initial = context.getImageData(0, 0, canvas.width, canvas.height);
      initialRef.current = initial;
      historyRef.current = [];
      setCanUndo(false);
      publishSelection();
    };
    image.src = maskSrc;
  }, [maskSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    hasSelection: () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { willReadFrequently: true });
      return Boolean(canvas && context && imageDataHasSelection(context.getImageData(0, 0, canvas.width, canvas.height)));
    },
    exportMask: () =>
      new Promise((resolve) => {
        const canvas = canvasRef.current;
        if (!canvas) return resolve(null);
        canvas.toBlob(resolve, "image/png");
      }),
  }));

  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const snapshot = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    historyRef.current = [...historyRef.current.slice(-19), context.getImageData(0, 0, canvas.width, canvas.height)];
    setCanUndo(true);
  };

  const draw = (from: Point, to: Point) => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const scale = canvasRef.current!.width / canvasRef.current!.getBoundingClientRect().width;
    const radius = (size * scale) / 2;
    context.fillStyle = mode === "brush" ? "white" : "black";
    for (const point of interpolateStroke(from, to, radius)) {
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
    }
  };

  const undo = () => {
    const previous = historyRef.current.pop();
    const context = canvasRef.current?.getContext("2d");
    if (previous && context) context.putImageData(previous, 0, 0);
    setCanUndo(historyRef.current.length > 0);
    publishSelection();
  };

  const replace = (imageData: ImageData | null) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    snapshot();
    if (imageData) context.putImageData(imageData, 0, 0);
    else {
      context.fillStyle = "black";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    publishSelection();
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded border border-line bg-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sourceSrc} alt="" className="block w-full" />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair opacity-45 touch-none mix-blend-screen"
          aria-label={t("repair.mask.canvasLabel")}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            snapshot();
            const point = pointFor(event);
            pointerRef.current = point;
            draw(point, point);
          }}
          onPointerMove={(event) => {
            if (!pointerRef.current) return;
            const next = pointFor(event);
            draw(pointerRef.current, next);
            pointerRef.current = next;
          }}
          onPointerUp={() => { pointerRef.current = null; publishSelection(); }}
          onPointerCancel={() => { pointerRef.current = null; publishSelection(); }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={mode === "brush" ? "primary" : "ghost"} onClick={() => setMode("brush")}>{t("repair.mask.brush")}</Button>
        <Button variant={mode === "erase" ? "primary" : "ghost"} onClick={() => setMode("erase")}>{t("repair.mask.erase")}</Button>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t("repair.mask.size")}
          <input type="range" min="8" max="96" value={size} onChange={(event) => setSize(Number(event.target.value))} />
        </label>
        <Button variant="ghost" disabled={!canUndo} onClick={undo}>{t("repair.mask.undo")}</Button>
        <Button variant="ghost" onClick={() => replace(initialRef.current)}>{t("repair.mask.reset")}</Button>
        <Button variant="ghost" onClick={() => replace(null)}>{t("repair.mask.clear")}</Button>
      </div>
    </div>
  );
});
