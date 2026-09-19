import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import './PhotoCropModal.css';

const VIEWPORT_SIZE = 320;
const OUTPUT_SIZE = 1400;
const MAX_ZOOM = 3;

export default function PhotoCropModal({ file, onCancel, onCrop }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
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

  const baseScale = img ? Math.max(VIEWPORT_SIZE / img.naturalWidth, VIEWPORT_SIZE / img.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const dispW = img ? img.naturalWidth * scale : 0;
  const dispH = img ? img.naturalHeight * scale : 0;
  const maxPanX = Math.max(0, (dispW - VIEWPORT_SIZE) / 2);
  const maxPanY = Math.max(0, (dispH - VIEWPORT_SIZE) / 2);
  const clampedPan = {
    x: Math.min(maxPanX, Math.max(-maxPanX, pan.x)),
    y: Math.min(maxPanY, Math.max(-maxPanY, pan.y)),
  };
  const imgLeft = VIEWPORT_SIZE / 2 - dispW / 2 + clampedPan.x;
  const imgTop = VIEWPORT_SIZE / 2 - dispH / 2 + clampedPan.y;

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
    const outputScale = OUTPUT_SIZE / VIEWPORT_SIZE;
    ctx.drawImage(img, imgLeft * outputScale, imgTop * outputScale, dispW * outputScale, dispH * outputScale);
    canvas.toBlob((blob) => blob && onCrop(blob), 'image/jpeg', 0.92);
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="photo-crop-card" role="dialog" aria-modal="true" aria-label="Crop photo">
        <h2 className="photo-crop-title">Crop to square</h2>
        <p className="photo-crop-subtitle">Drag to reposition, use the slider to zoom.</p>

        <div
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
