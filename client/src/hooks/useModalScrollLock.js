import { useEffect } from 'react';

export default function useModalScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    document.body.classList.add('modal-open');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);
}