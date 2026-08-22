export interface Point { x: number; y: number }

/** Fill gaps between pointer events so fast strokes remain continuous. */
export function interpolateStroke(from: Point, to: Point, radius: number): Point[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5)));
  return Array.from({ length: steps + 1 }, (_, index) => ({
    x: from.x + ((to.x - from.x) * index) / steps,
    y: from.y + ((to.y - from.y) * index) / steps,
  }));
}

export function imageDataHasSelection(data: ImageData): boolean {
  for (let index = 0; index < data.data.length; index += 4) {
    if ((data.data[index] ?? 0) >= 128) return true;
  }
  return false;
}
