import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import './SketchCanvas.css';

const PAPER = '#faf9f6';
const INK = '#1f1e1c';

const SketchCanvas = forwardRef(function SketchCanvas({ onChange }, ref) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const hasContentRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  function getPoint(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e) {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  }

  function handlePointerMove(e) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const point = getPoint(e);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    if (!hasContentRef.current) {
      hasContentRef.current = true;
      onChange?.(true);
    }
  }

  function stopDrawing() {
    drawingRef.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, rect.width, rect.height);
    hasContentRef.current = false;
    onChange?.(false);
  }

  useImperativeHandle(ref, () => ({
    clear,
    getBlob() {
      return new Promise((resolve) => canvasRef.current.toBlob(resolve, 'image/png'));
    },
  }));

  return (
    <div className="sketch-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="sketch-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        onPointerCancel={stopDrawing}
      />
      <button type="button" className="sketch-canvas-clear" onClick={clear}>
        Clear
      </button>
    </div>
  );
});

export default SketchCanvas;
