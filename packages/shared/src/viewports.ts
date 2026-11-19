import type { DeviceClass } from './enums.js';

export interface ViewportProfile {
  id: string;
  label: string;
  deviceClass: DeviceClass;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

/** Default desktop / tablet / mobile matrix for UI testing. Projects can override it. */
export const DEFAULT_VIEWPORTS: readonly ViewportProfile[] = [
  { id: 'desktop-1920', label: 'Desktop 1920', deviceClass: 'DESKTOP', width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { id: 'desktop-1280', label: 'Desktop 1280', deviceClass: 'DESKTOP', width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { id: 'tablet-768', label: 'Tablet 768', deviceClass: 'TABLET', width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { id: 'mobile-375', label: 'Mobile 375', deviceClass: 'MOBILE', width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];
