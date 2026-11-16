import { PHOTO } from './calibration.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// One camera state shared by the flight animation, zoom control and direct manipulation.
export class CameraControl {
  mode = 'auto';
  zoom = 1;
  center = { x: 0, y: 0 };
  pose = { x: 0, y: 0, zoom: 1, mode: 'auto' };
  view = { width: PHOTO.width, height: PHOTO.height };

  sample(automatic, view) {
    this.view = view;
    if (this.mode === 'auto') {
      this.pose = { ...automatic, zoom: clamp(automatic.zoom, 1, 5), mode: 'auto' };
    } else {
      const halfWidth = Math.min(PHOTO.width / 2, view.width / this.zoom / 2);
      const halfHeight = Math.min(PHOTO.height / 2, view.height / this.zoom / 2);
      this.center.x = clamp(this.center.x, -PHOTO.width / 2 + halfWidth, PHOTO.width / 2 - halfWidth);
      this.center.y = clamp(this.center.y, -PHOTO.height / 2 + halfHeight, PHOTO.height / 2 - halfHeight);
      this.pose = { ...this.center, zoom: this.zoom, mode: 'manual' };
    }
    return this.pose;
  }

  setZoom(value) {
    if (!Number.isFinite(value)) return;
    if (this.mode === 'auto') this.center = { x: this.pose.x, y: this.pose.y };
    this.mode = 'manual';
    this.zoom = clamp(value, 1, 5);
  }

  // Deltas are fractions of the viewport, so mouse/touch feel the same at any size.
  pan(dx, dy) {
    if (this.pose.zoom <= 1 || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    if (this.mode === 'auto') this.setZoom(this.pose.zoom);
    this.center.x -= dx * this.view.width / this.zoom;
    this.center.y += dy * this.view.height / this.zoom;
    return true;
  }

  useAuto() { this.mode = 'auto'; }
}
