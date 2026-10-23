// Экранная клавиатура телефона. Браузер сам не сдвигает закреплённые снизу элементы
// (на iPhone и Android клавиатура просто их закрывает), поэтому считаем её высоту
// по видимой области экрана (visualViewport) и отдаём в CSS:
//   --kb      — сколько пикселей снизу занято клавиатурой;
//   .kb-open  — на <html>, пока клавиатура открыта (нижнее меню прячется, поле чата встаёт над ней).
import { useEffect } from 'react';

/** Меньше этого — не клавиатура, а, например, панель адреса браузера. */
const KEYBOARD_MIN = 80;

export function useKeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;

    const update = () => {
      const raw = vv ? Math.round(window.innerHeight - vv.height - vv.offsetTop) : 0;
      const kb = raw >= KEYBOARD_MIN ? raw : 0;
      root.style.setProperty('--kb', `${kb}px`);
      root.classList.toggle('kb-open', kb > 0);
    };

    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    update();
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, []);
}
