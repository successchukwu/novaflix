// client/src/components/features/AdUpsellBanner.tsx
// Premium upsell banner shown during ad breaks for free users
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon';

interface AdUpsellBannerProps {
  visible: boolean;
  onDismiss: () => void;
  onUpgrade: () => void;
}

export function AdUpsellBanner({ visible, onDismiss, onUpgrade }: AdUpsellBannerProps) {
  if (!visible) return null;

  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 animate-slide-up"
      onClick={onDismiss}
    >
      <div className="bg-black/80 backdrop-blur-sm border border-accent/30 rounded-xl px-4 py-2 flex items-center gap-3 px-4 py-2">
        <Icon name="diamond" className="text-accent" />
        <span className="text-white font-medium">Tired of ads? Go Premium for ad-free viewing</span>
        <button 
          onClick={(e) => { e.stopPropagation(); navigate('/pricing'); }}
          className="ml-4 px-3 py-1 bg-accent text-black text-sm font-bold rounded-lg hover:bg-accent/90 transition-colors"
        >
          Upgrade
        </button>
        <button onClick={onDismiss} className="ml-auto text-gray-400 hover:text-white">
          <Icon name="close" size="sm" />
        </button>
      </div>
    </motion.div>
  );
}