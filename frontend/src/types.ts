/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GesturePoint {
  x: number;
  y: number;
  time: number;
  speed: number;
  angle: number;
}

export interface GestureParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  life: number;
  maxLife: number;
  sparkleSpeed: number;
  decay: number;
}

export interface ContactRipple {
  id: number;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
  birthTime: number;
  duration: number;
}

export interface GestureState {
  isActive: boolean;
  isFaceContact: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  directionAngle: number;
  directionAxis: 'horizontal' | 'vertical' | null;
  dragDistance: number;
  speed: number;
  flipType: 'layer' | 'cube' | null;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramWebAppInitData {
  query_id?: string;
  user?: TelegramUser;
  receiver?: unknown;
  chat?: unknown;
  start_param?: string;
  auth_date?: number;
  hash?: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
        isExpanded?: boolean;
        viewportHeight?: number;
        viewportStableHeight?: number;
        headerColor?: string;
        backgroundColor?: string;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        enableClosingConfirmation?: () => void;
        openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
        openTelegramLink?: (url: string) => void;
        platform?: string;
        version?: string;
        initData?: string;
        initDataUnsafe?: TelegramWebAppInitData;
        BackButton?: {
          isVisible: boolean;
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

