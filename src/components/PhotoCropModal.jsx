import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import './PhotoCropModal.css';

const DEFAULT_VIEWPORT_SIZE = 320;
const OUTPUT_SIZE = 1400;
const MAX_ZOOM = 3;

export default function PhotoCropModal({ file, onCancel, onCrop }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState(DEFAULT_VIEWPORT_SIZE);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onCancel]);

  // The viewport's on-screen size can shrink below DEFAULT_VIEWPORT_SIZE on
  // narrow screens (it's `max-width: 100%`), so the crop math has to use
  // its actual rendered size, not the CSS default, or the exported crop
  // won't match what was previewed.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width > 0) setContainerSize(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const baseScale = img ? Math.max(containerSize / img.naturalWidth, containerSize / img.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const dispW = img ? img.naturalWidth * scale : 0;
  const dispH = img ? img.naturalHeight * scale : 0;
  const maxPanX = Math.max(0, (dispW - containerSize) / 2);
  const maxPanY = Math.max(0, (dispH - containerSize) / 2);
  const clampedPan = {
    x: Math.min(maxPanX, Math.max(-maxPanX, pan.x)),
    y: Math.min(maxPanY, Math.max(-maxPanY, pan.y)),
  };
  const imgLeft = containerSize / 2 - dispW / 2 + clampedPan.x;
  const imgTop = containerSize / 2 - dispH / 2 + clampedPan.y;

  function handlePointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPan: clampedPan };
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return;
    const { startX, startY, startPan } = dragRef.current;
    setPan({ x: startPan.x + (e.clientX - startX), y: startPan.y + (e.clientY - startY) });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleConfirm() {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    const outputScale = OUTPUT_SIZE / containerSize;
    ctx.drawImage(img, imgLeft * outputScale, imgTop * outputScale, dispW * outputScale, dispH * outputScale);
    canvas.toBlob((blob) => blob && onCrop(blob), 'image/jpeg', 0.92);
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="photo-crop-card" role="dialog" aria-modal="true" aria-label="Crop photo">
        <h2 className="photo-crop-title">Crop to square</h2>
        <p className="photo-crop-subtitle">Drag to reposition, use the slider to zoom.</p>

        <div
          ref={viewportRef}
          className="photo-crop-viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {img && (
            <img
              src={img.src}
              alt=""
              className="photo-crop-image"
              draggable={false}
              style={{ width: dispW, height: dispH, left: imgLeft, top: imgTop }}
            />
          )}
        </div>

        <input
          type="range"
          className="photo-crop-zoom"
          min="1"
          max={MAX_ZOOM}
          step="0.01"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Zoom"
        />

        <div className="add-meal-footer">
          <Button type="button" variant="primary" onClick={handleConfirm} disabled={!img}>
            Use photo
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
