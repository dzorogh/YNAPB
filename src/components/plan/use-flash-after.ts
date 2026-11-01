import { useEffect, useRef, useState } from "react";

const FLASH_DURATION_MS = 1400;

/** Returns `true` for a short moment after `isActive` goes from true to false. */
export const useFlashAfter = (isActive: boolean): boolean => {
  const wasActive = useRef(isActive);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    const finished = wasActive.current && !isActive;
    wasActive.current = isActive;
    if (!finished) {
      return;
    }
    setIsFlashing(true);
    const timeoutId = window.setTimeout(
      () => setIsFlashing(false),
      FLASH_DURATION_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [isActive]);

  return isFlashing;
};
