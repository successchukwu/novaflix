// client/src/components/features/AdWarningBanner.tsx
// 10-second warning banner before mid-roll ad
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Icon from '../ui/Icon';

interface AdWarningBannerProps {
  secondsRemaining: number;
  onWarningEnd: () => void;
}

export function AdWarningBanner({ secondsRemaining, onWarningEnd }: AdWarningBannerProps) {
  const [seconds, setSeconds] = useState(secondsRemaining);

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const timer = setInterval(() => {
      setSeconds(s => s - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsRemaining]);

  useEffect(() => {
    if (seconds <= 0) {
      onWarningEnd();
    }
  }, [seconds]);

  if (seconds <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center z-50"
    >
      <div className="text-center">
        <motion.p
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-xl font-bold text-white mb-2"
        >
          Your commercial break starts in
        </motion.p>
        <motion.p
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-5xl font-bold text-accent animate-pulse font-mono"
        >
          {seconds}...
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-white/60 mt-4"
        >
          60-second ad break • 2 × 30-second ads
        </motion.p>
      </div>
    </motion.div>
  );
}