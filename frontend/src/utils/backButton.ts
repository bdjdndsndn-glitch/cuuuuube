/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';

/** Кнопка «Назад» Telegram закриває відкриту панель */
export function useTelegramBackButton(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    const bb = window.Telegram?.WebApp?.BackButton;
    if (!isOpen || !bb) return;
    const handler = () => onClose();
    try {
      bb.onClick(handler);
      bb.show();
    } catch {
      return;
    }
    return () => {
      try {
        bb.offClick(handler);
        bb.hide();
      } catch {
        // ignore
      }
    };
  }, [isOpen, onClose]);
}
