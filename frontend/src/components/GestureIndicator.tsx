/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import type { ContactRipple, GesturePoint, GestureState } from '../types';
import {
  triggerLayerTurnVibration,
  triggerLayerSnapVibration,
  triggerSolvedVibration,
} from '../utils/haptics';
import { playTurn } from '../utils/sound';
import { startMusic } from '../utils/music';

interface ExtendedGameControls {
  edges?: any;
  helper?: any;
  draggable?: any;
  getIntersect?: (pos: any, object: any, checkAll: boolean) => any;
  flipType?: 'layer' | 'cube';
  state?: number;
  rotateLayer?: (angle: any, isScramble: boolean, cb: any) => void;
  __vibrationHooked?: boolean;
}

declare global {
  interface Window {
    game?: {
      controls?: ExtendedGameControls;
      world?: {
        camera?: any;
        scene?: any;
      };
    };
  }
}

/**
 * Делікатний, ергономічний індикатор жестів для комфортної гри.
 * Розроблений для максимальної зручності гравця:
 * - Без різких звуків та без зайвих спалахів
 * - М'який, тонкий напівпрозорий шлейф (без засліплюючого неону)
 * - Акуратний мінімалістичний дотиковий відгук, який не перекриває кольори кубика
 * - 60 FPS плавна робота без навантаження на систему
 */
export const GestureIndicator: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Стан активного жесту
  const gestureStateRef = useRef<GestureState>({
    isActive: false,
    isFaceContact: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    directionAngle: 0,
    directionAxis: null,
    dragDistance: 0,
    speed: 0,
    flipType: null,
  });

  const trailPointsRef = useRef<GesturePoint[]>([]);
  const ripplesRef = useRef<ContactRipple[]>([]);
  const nextRippleIdRef = useRef<number>(1);
  const animFrameIdRef = useRef<number | null>(null);

  // Перевірка чи торкання відбулося на грані кубика
  const checkIsFaceContact = (x: number, y: number): boolean => {
    const game = window.game;
    if (!game || !game.controls || !game.world || !game.world.camera) {
      return false;
    }

    try {
      const controls = game.controls;
      if (controls.flipType === 'layer') return true;
      if (controls.flipType === 'cube') return false;

      const three = (window as any).THREE;
      if (!three) return false;

      const testPos = new three.Vector2(
        (x / window.innerWidth) * 2 - 1,
        -(y / window.innerHeight) * 2 + 1
      );

      if (controls.helper && typeof controls.getIntersect === 'function') {
        const hit = controls.getIntersect(testPos, controls.helper, false);
        if (hit) return true;
      }
      if (controls.edges && typeof controls.getIntersect === 'function') {
        const hit = controls.getIntersect(testPos, controls.edges, false);
        if (hit) return true;
      }
    } catch {
      // fallback
    }

    return false;
  };

  // Створення легкого, ненав'язливого кільця дотику
  const spawnContactRipple = (x: number, y: number, isFace: boolean) => {
    const now = performance.now();
    ripplesRef.current.push({
      id: nextRippleIdRef.current++,
      x,
      y,
      radius: 8,
      maxRadius: isFace ? 24 : 18,
      alpha: isFace ? 0.35 : 0.22,
      color: isFace ? '#38bdf8' : '#94a3b8',
      birthTime: now,
      duration: 220,
    });
  };

  // Обробка початку жесту
  const handleGestureStart = (x: number, y: number) => {
    const isFace = checkIsFaceContact(x, y);
    const now = performance.now();

    gestureStateRef.current = {
      isActive: true,
      isFaceContact: isFace,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      directionAngle: 0,
      directionAxis: null,
      dragDistance: 0,
      speed: 0,
      flipType: isFace ? 'layer' : 'cube',
    };

    trailPointsRef.current = [
      {
        x,
        y,
        time: now,
        speed: 0,
        angle: 0,
      },
    ];

    spawnContactRipple(x, y, isFace);
  };

  // Обробка переміщення жесту
  const handleGestureMove = (x: number, y: number) => {
    const state = gestureStateRef.current;
    if (!state.isActive) return;

    const now = performance.now();
    const dx = x - state.currentX;
    const dy = y - state.currentY;
    const distStep = Math.sqrt(dx * dx + dy * dy);

    if (distStep < 1) return;

    const totalDx = x - state.startX;
    const totalDy = y - state.startY;
    const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
    const angle = Math.atan2(dy, dx);

    const prevPoint = trailPointsRef.current[trailPointsRef.current.length - 1];
    const dt = prevPoint ? Math.max(1, now - prevPoint.time) : 16;
    const currentSpeed = (distStep / dt) * 16;

    let axis: 'horizontal' | 'vertical' | null = null;
    if (totalDist > 8) {
      axis = Math.abs(totalDx) > Math.abs(totalDy) ? 'horizontal' : 'vertical';
    }

    const isFace = state.isFaceContact || checkIsFaceContact(x, y);

    gestureStateRef.current = {
      ...state,
      currentX: x,
      currentY: y,
      directionAngle: angle,
      directionAxis: axis,
      dragDistance: totalDist,
      speed: currentSpeed,
      isFaceContact: isFace,
    };

    trailPointsRef.current.push({
      x,
      y,
      time: now,
      speed: currentSpeed,
      angle,
    });

    // Обмежуємо довжину історії для чистоти та швидкодії
    if (trailPointsRef.current.length > 18) {
      trailPointsRef.current.shift();
    }
  };

  // Завершення жесту
  const handleGestureEnd = () => {
    gestureStateRef.current.isActive = false;
  };

  // Підключення глобальних слухачів та перехоплення з draggable
  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const touch = 'touches' in e ? e.touches[0] : (e as MouseEvent);
      if (touch) {
        handleGestureStart(touch.clientX, touch.clientY);
      }
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      const touch = 'touches' in e ? e.touches[0] : (e as MouseEvent);
      if (touch) {
        handleGestureMove(touch.clientX, touch.clientY);
      }
    };

    const onPointerUp = () => {
      handleGestureEnd();
    };

    window.addEventListener('mousedown', onPointerDown, { passive: true });
    window.addEventListener('mousemove', onPointerMove, { passive: true });
    window.addEventListener('mouseup', onPointerUp, { passive: true });

    window.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp, { passive: true });
    window.addEventListener('touchcancel', onPointerUp, { passive: true });

    // Інтеграція з внутрішнім draggable рушієм гри (якщо доступний)
    let hookInterval: NodeJS.Timeout | null = null;
    const setupDraggableHook = () => {
      const controls = window.game?.controls;
      if (controls && controls.draggable) {
        const draggable = controls.draggable;
        if (!draggable.__comfortableHooked) {
          draggable.__comfortableHooked = true;
          const origDragStart = draggable.onDragStart;
          const origDragMove = draggable.onDragMove;
          const origDragEnd = draggable.onDragEnd;

          draggable.onDragStart = (pos: any) => {
            origDragStart?.call(draggable, pos);
            if (pos && pos.current) {
              handleGestureStart(pos.current.x, pos.current.y);
            }
          };

          draggable.onDragMove = (pos: any) => {
            origDragMove?.call(draggable, pos);
            if (pos && pos.current) {
              handleGestureMove(pos.current.x, pos.current.y);
            }
          };

          draggable.onDragEnd = (pos: any) => {
            // Викликаємо вібрацію синхронно в момент touchend для гарантованого проходження політики браузера
            if (controls.state === 2 && controls.flipType === 'layer') {
              triggerLayerTurnVibration();
            }
            origDragEnd?.call(draggable, pos);
            handleGestureEnd();
          };
        }

        // Підключаємо ледь відчутний тактильний відгук (Vibration API) при повороті граней
        if (typeof controls.rotateLayer === 'function' && !controls.__vibrationHooked) {
          controls.__vibrationHooked = true;
          const origRotateLayer = controls.rotateLayer;
          controls.rotateLayer = function (angle: any, isScramble: boolean, cb: any) {
            if (!isScramble) {
              triggerLayerTurnVibration();
              playTurn();
              startMusic();
            }
            const wrappedCb = function (this: any, ...args: any[]) {
              if (!isScramble) {
                triggerLayerSnapVibration();
              }
              if (typeof cb === 'function') {
                return cb.apply(this, args);
              }
            };
            return origRotateLayer.call(this, angle, isScramble, wrappedCb);
          };

          // Додатково страхуємо метод у прототипі
          if (controls.constructor?.prototype?.rotateLayer && !controls.constructor.prototype.__vibrationHooked) {
            controls.constructor.prototype.__vibrationHooked = true;
            const protoRotate = controls.constructor.prototype.rotateLayer;
            controls.constructor.prototype.rotateLayer = function (angle: any, isScramble: boolean, cb: any) {
              if (!isScramble) {
                triggerLayerTurnVibration();
              }
              return protoRotate.call(this, angle, isScramble, cb);
            };
          }
        }

        // Делікатна вібрація при успішному розв'язанні кубика
        const confetti = (window.game as any)?.confetti;
        if (confetti && typeof confetti.start === 'function' && !confetti.__vibrationHooked) {
          confetti.__vibrationHooked = true;
          const origConfetti = confetti.start;
          confetti.start = function (this: any, ...args: any[]) {
            triggerSolvedVibration();
            return origConfetti.apply(this, args);
          };
        }

        return true;
      }
      return false;
    };

    if (!setupDraggableHook()) {
      hookInterval = setInterval(() => {
        if (setupDraggableHook() && hookInterval) {
          clearInterval(hookInterval);
          hookInterval = null;
        }
      }, 250);
    }

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);

      window.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
      window.removeEventListener('touchcancel', onPointerUp);

      if (hookInterval) clearInterval(hookInterval);
    };
  }, []);

  // Рендер 2D Canvas: м'який, комфортний для очей мінімалістичний шлейф
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Малювання делікатної, тонкої стрілки напрямку
    const drawDirectionCue = (
      x: number,
      y: number,
      angle: number,
      distance: number,
      isFace: boolean
    ) => {
      if (distance < 14) return;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      const cueSize = 10;
      ctx.beginPath();
      ctx.moveTo(cueSize * 0.7, 0);
      ctx.lineTo(-cueSize * 0.5, -cueSize * 0.45);
      ctx.lineTo(-cueSize * 0.2, 0);
      ctx.lineTo(-cueSize * 0.5, cueSize * 0.45);
      ctx.closePath();

      ctx.fillStyle = isFace ? 'rgba(56, 189, 248, 0.45)' : 'rgba(148, 163, 184, 0.35)';
      ctx.fill();

      ctx.restore();
    };

    // Малювання тонкого, плавного напівпрозорого сліду
    const drawSmoothTrail = (points: GesturePoint[], isFace: boolean) => {
      if (points.length < 2) return;

      const now = performance.now();
      const maxAge = 180; // Швидке делікатне розчинення за 180мс

      const activePoints = points.filter((p) => now - p.time < maxAge);
      if (activePoints.length < 2) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = 1; i < activePoints.length; i++) {
        const p0 = activePoints[i - 1];
        const p1 = activePoints[i];
        const ageRatio = (now - p1.time) / maxAge;
        const alpha = Math.max(0, 1 - ageRatio) * (isFace ? 0.35 : 0.22);
        const width = Math.max(1, 3.5 * (1 - ageRatio * 0.6));

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);

        ctx.lineWidth = width;
        ctx.strokeStyle = isFace
          ? `rgba(56, 189, 248, ${alpha})`
          : `rgba(148, 163, 184, ${alpha})`;
        ctx.stroke();
      }

      ctx.restore();
    };

    const render = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      ctx.clearRect(0, 0, width, height);

      const now = performance.now();
      const state = gestureStateRef.current;

      // 1. М'яке тактильне кільце на початку дотику
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const ripple = ripplesRef.current[i];
        const elapsed = now - ripple.birthTime;
        const progress = Math.min(1, elapsed / ripple.duration);

        if (progress >= 1) {
          ripplesRef.current.splice(i, 1);
          continue;
        }

        const easeOut = Math.sin((progress * Math.PI) / 2);
        const currentRadius = ripple.radius + (ripple.maxRadius - ripple.radius) * easeOut;
        const currentAlpha = ripple.alpha * (1 - progress);

        ctx.save();
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, currentRadius, 0, Math.PI * 2);
        ctx.strokeStyle = ripple.color === '#38bdf8'
          ? `rgba(56, 189, 248, ${currentAlpha})`
          : `rgba(148, 163, 184, ${currentAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // 2. Тонкий делікатний шлейф руху
      if (trailPointsRef.current.length > 1) {
        drawSmoothTrail(trailPointsRef.current, state.isFaceContact);
      }

      // 3. Лаконічний орієнтир напрямку жесту
      if (state.isActive && state.dragDistance > 14) {
        drawDirectionCue(
          state.currentX,
          state.currentY,
          state.directionAngle,
          state.dragDistance,
          state.isFaceContact
        );
      }

      if (!state.isActive && trailPointsRef.current.length > 0) {
        const maxAge = 180;
        trailPointsRef.current = trailPointsRef.current.filter((p) => now - p.time < maxAge);
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      id="gesture-indicator-canvas"
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-30"
      aria-hidden="true"
    />
  );
};
