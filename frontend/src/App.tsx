/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { TonConnectUIProvider, THEME } from '@tonconnect/ui-react';
import { GestureIndicator } from './components/GestureIndicator';
import { CubeProgressIndicator } from './components/CubeProgressIndicator';
import { BackgroundMusic } from './components/BackgroundMusic';
import { TelegramGameControls } from './components/TelegramGameControls';
import { AdminPanel } from './components/AdminPanel';
import {
  getHapticIndex,
  setHapticFromIndex,
  triggerLayerTurnVibration,
} from './utils/haptics';
import { isSoundEnabled, setSoundEnabled, playTurn } from './utils/sound';
import { getMusicVolume, setMusicVolume } from './utils/music';

/**
 * Повна українська локалізація інтерфейсу гри THE CUBE
 */
export const UKRAINIAN_UI_TEXTS = {
  // Назва проєкту зберігається відповідно до вимоги
  appName: 'THE CUBE',
  subtitle: '3D Головоломка Кубик Рубіка',
  badge: 'Українська версія',
  startPrompt: 'Подвійний тап для початку',
  timer: '0:00',
  complete: 'Завершено!',
  bestTime: 'Найкращий час!',

  buttons: {
    stats: 'Лідери',
    prefs: 'Налаштування',
    back: 'Назад',
    theme: 'Кольори теми',
    reset: 'Скинути тему',
    help: 'Довідка',
    close: 'Закрити',
  },

  menus: {
    prefsTitle: 'Налаштування',
    statsTitle: 'Статистика',
    themeTitle: 'Редактор кольорів теми',
    size: {
      title: 'Розмір кубика',
      options: ['2x2', '3x3', '4x4', '5x5'],
    },
    flip: {
      title: 'Тип повороту',
      options: ['Швидкий', 'Плавний', 'Пружний'],
    },
    scramble: {
      title: 'Довжина перемішування',
      options: ['20 ходів', '25 ходів', '30 ходів'],
    },
    fov: {
      title: 'Кут огляду',
      options: ['Ортографічний', 'Перспективний'],
    },
    theme: {
      title: 'Колірна схема',
      options: ['Класичний Куб', 'Ерно Рубік', 'Пил', 'Дощ'],
    },
    haptic: {
      title: 'Тактильна вібрація',
      options: ['Вимк', "М'яка", 'Оптимальна', 'Чітка'],
    },
    colors: {
      hue: 'Відтінок',
      saturation: 'Насиченість',
      lightness: 'Яскравість',
    },
  },

  stats: {
    cubeSize: 'Кубик:',
    totalSolves: "Всього розв'язань:",
    bestTime: 'Найкращий час:',
    worstTime: 'Найгірший час:',
    average5: 'Середнє з 5:',
    average12: 'Середнє з 12:',
    average25: 'Середнє з 25:',
  },

  guide: {
    title: 'Керування та правила',
    controls: [
      {
        icon: 'rotate',
        label: 'Обертання кубика',
        desc: 'Затисніть ліву кнопку миші на фоні або проведіть пальцем по екрану для огляду кубика з будь-якого боку.',
      },
      {
        icon: 'slice',
        label: 'Поворот граней',
        desc: 'Натисніть на відповідний шар або грань кубика та потягніть у бажаному напрямку обертання.',
      },
      {
        icon: 'start',
        label: 'Початок гри',
        desc: 'Зробіть подвійний клік (або подвійний тап) по кубику, щоб автоматично перемішати його та запустити таймер.',
      },
      {
        icon: 'settings',
        label: 'Налаштування та теми',
        desc: 'Кнопки внизу екрана дозволяють обрати розмір кубика (2х2, 3х3, 4х4, 5х5), змінити швидкість повороту та налаштувати власні кольори.',
      },
    ],
  },
};

export default function App() {
  // Синхронізація підказок, налаштування вібрації та підтримка Telegram Mini App
  useEffect(() => {
    // 1. Інтеграція з Telegram Mini App (готуємо WebApp та розгортаємо на повний екран)
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      try {
        window.Telegram.WebApp.ready?.();
        window.Telegram.WebApp.expand?.();
      } catch {
        // ignore
      }
    }

    // 2. Встановлюємо українські назви для кнопок в DOM
    const statsBtn = document.querySelector<HTMLButtonElement>('.btn--stats');
    const prefsBtn = document.querySelector<HTMLButtonElement>('.btn--prefs');
    const backBtn = document.querySelector<HTMLButtonElement>('.btn--back');
    const themeBtn = document.querySelector<HTMLButtonElement>('.btn--theme');
    const resetBtn = document.querySelector<HTMLButtonElement>('.btn--reset');

    if (statsBtn) {
      statsBtn.title = UKRAINIAN_UI_TEXTS.buttons.stats;
      statsBtn.setAttribute('aria-label', UKRAINIAN_UI_TEXTS.buttons.stats);
    }
    if (prefsBtn) {
      prefsBtn.title = UKRAINIAN_UI_TEXTS.buttons.prefs;
      prefsBtn.setAttribute('aria-label', UKRAINIAN_UI_TEXTS.buttons.prefs);
    }
    if (backBtn) {
      backBtn.title = UKRAINIAN_UI_TEXTS.buttons.back;
      backBtn.setAttribute('aria-label', UKRAINIAN_UI_TEXTS.buttons.back);
    }
    if (themeBtn) {
      themeBtn.title = UKRAINIAN_UI_TEXTS.buttons.theme;
      themeBtn.setAttribute('aria-label', UKRAINIAN_UI_TEXTS.buttons.theme);
    }
    if (resetBtn) {
      resetBtn.title = UKRAINIAN_UI_TEXTS.buttons.reset;
      resetBtn.setAttribute('aria-label', UKRAINIAN_UI_TEXTS.buttons.reset);
    }

    // 3. Інтеграція повзунка вібрації в нативне меню налаштувань кубика (ui__prefs)
    let hapticTimer: NodeJS.Timeout | null = null;
    const setupHapticRange = () => {
      const gameInstance = (window as any).game;
      const prefs = gameInstance?.preferences;
      if (!prefs || !prefs.ranges || !prefs.ranges.size) return false;
      if (prefs.ranges.haptic) return true; // вже ініціалізовано

      const RangeClass = prefs.ranges.size.constructor;
      const initialIdx = getHapticIndex();

      const hapticRange = new RangeClass('haptic', {
        value: initialIdx,
        range: [0, 3],
        step: 1,
        onUpdate: (val: number) => {
          const index = Math.round(val);
          setHapticFromIndex(index);
          // Миттєвий тактильний відгук для перевірки обраної сили вібрації в меню
          if (index > 0) {
            triggerLayerTurnVibration(undefined, true);
          }
        },
        onComplete: () => {
          try {
            gameInstance?.storage?.savePreferences?.();
          } catch {
            // ignore
          }
        },
      });

      prefs.ranges.haptic = hapticRange;

      const soundRange = new RangeClass('sound', {
        value: isSoundEnabled() ? 1 : 0,
        range: [0, 1],
        step: 1,
        onUpdate: (val: number) => {
          setSoundEnabled(Math.round(val) === 1);
          if (Math.round(val) === 1) playTurn();
        },
        onComplete: () => {},
      });
      prefs.ranges.sound = soundRange;
      document.querySelectorAll<HTMLDivElement>('.range[name="sound"] .range__list div').forEach((item, index) => {
        item.style.cursor = 'pointer';
        const select = (e: Event) => {
          e.stopPropagation();
          soundRange.setValue(index);
          soundRange.onUpdate(index);
        };
        item.addEventListener('click', select);
        item.addEventListener('touchend', select);
      });

      // Окремий повзунок гучності фонової музики (незалежний від звуку поворотів)
      const musicRange = new RangeClass('music', {
        value: Math.round(getMusicVolume() * 4),
        range: [0, 4],
        step: 1,
        onUpdate: (val: number) => {
          setMusicVolume(Math.round(val) / 4);
        },
        onComplete: () => {
          try {
            gameInstance?.storage?.savePreferences?.();
          } catch {
            // ignore
          }
        },
      });
      prefs.ranges.music = musicRange;
      document.querySelectorAll<HTMLDivElement>('.range[name="music"] .range__list div').forEach((item, index) => {
        item.style.cursor = 'pointer';
        const select = (e: Event) => {
          e.stopPropagation();
          musicRange.setValue(index);
          musicRange.onUpdate(index);
          musicRange.onComplete(index);
        };
        item.addEventListener('click', select);
        item.addEventListener('touchend', select);
      });

      // Підтримка швидкого кліку/тапу по назвах варіантів (Вимк, М'яка, Оптимальна, Чітка)
      const listItems = document.querySelectorAll<HTMLDivElement>('.range[name="haptic"] .range__list div');
      listItems.forEach((item, index) => {
        item.style.cursor = 'pointer';
        const handleSelect = (e: Event) => {
          e.stopPropagation();
          hapticRange.setValue(index);
          hapticRange.onUpdate(index);
          hapticRange.onComplete(index);
        };
        item.addEventListener('click', handleSelect);
        item.addEventListener('touchend', handleSelect);
      });

      // Синхронізація кольору ручки повзунка вібрації з поточною темою
      const themes = gameInstance?.themes;
      if (themes && themes.colors && themes.colors[themes.theme]) {
        const color = '#' + themes.colors[themes.theme].R.toString(16).padStart(6, '0');
        document.querySelectorAll<HTMLElement>('.range[name="haptic"] .range__handle div, .range[name="sound"] .range__handle div').forEach((h) => {
          h.style.background = color;
        });
      }

      return true;
    };

    if (!setupHapticRange()) {
      hapticTimer = setInterval(() => {
        if (setupHapticRange() && hapticTimer) {
          clearInterval(hapticTimer);
          hapticTimer = null;
        }
      }, 150);
    }

    // 4. Старт гри — лише подвійним тапом. Обробляється у cube.js (фон + фраза), тут одинарний тап не запускає гру.
    const noteEl = document.querySelector<HTMLDivElement>('.text--note');
    if (noteEl) {
      noteEl.style.cursor = 'pointer';
      noteEl.style.pointerEvents = 'all';
    }

    return () => {
      if (hapticTimer) clearInterval(hapticTimer);
    };
  }, []);

  if (typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/admin') {
    return <AdminPanel />;
  }

  // Маніфест TON Connect для підключення Tonkeeper
  const manifestUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/tonconnect-manifest.json`
      : '/tonconnect-manifest.json';

  return (
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
      uiPreferences={{
        theme: THEME.DARK,
        borderRadius: 'm',
        colorsSet: {
          [THEME.DARK]: {
            accent: '#0098ea',
            telegramButton: '#0098ea',
          },
        },
      }}
    >
      <TelegramGameControls />
      <GestureIndicator />
      <CubeProgressIndicator />
      <BackgroundMusic />
    </TonConnectUIProvider>
  );
}
