import { CAMERA } from '@wrh/shared';

const yaw = (CAMERA.yawDeg * Math.PI) / 180;

/** Screen right/up expressed in sim axes (sim y = -three z), so W always moves up the screen whatever the camera yaw. */
export const SCREEN_RIGHT = { x: Math.cos(yaw), y: Math.sin(yaw) } as const;
export const SCREEN_UP = { x: -Math.sin(yaw), y: Math.cos(yaw) } as const;

/** Keys (dx: right=+1, dy: up=+1) to a unit-limited sim move vector. */
export function keysToMove(dx: number, dy: number): { x: number; y: number } {
  let mx = dx * SCREEN_RIGHT.x + dy * SCREEN_UP.x;
  let my = dx * SCREEN_RIGHT.y + dy * SCREEN_UP.y;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  return { x: mx, y: my };
}

/** Aim angle (radians, any range) to the 16-bit wire value and back. */
export function encodeAim(angle: number): number {
  const turns = (((angle / (Math.PI * 2)) % 1) + 1) % 1;
  return Math.round(turns * 65536) & 0xffff;
}

export function decodeAim(aim: number): number {
  return (aim * Math.PI * 2) / 65536;
}

/** Sim (x, y) -> three (x, 0, -y). */
export function simToThree(x: number, y: number): [number, number, number] {
  return [x, 0, -y];
}

/** Horizontal aim direction in three space for a sim aim angle. */
export function aimDirThree(angle: number): { x: number; z: number } {
  return { x: Math.cos(angle), z: -Math.sin(angle) };
}

/** Model root yaw so the +Z-facing chibi looks along the aim. */
export function yawForAim(angle: number): number {
  return angle + Math.PI / 2;
}
