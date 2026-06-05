import { motion } from 'motion/react';

interface VoiceVisualizerProps {
  volume: number;
  isModelSpeaking: boolean;
  isConnected: boolean;
  isThinking?: boolean;
}

export function VoiceVisualizer({ volume, isModelSpeaking, isConnected, isThinking }: VoiceVisualizerProps) {
  const bars = Array.from({ length: 20 });
  
  return (
    <div id="voice-vibe-visualizer" className="flex items-center justify-center gap-1.5 h-12 w-full select-none">
      {bars.map((_, i) => (
        <motion.div
          key={i}
          className={`w-1.5 rounded-full ${
            isModelSpeaking 
              ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)]' 
              : isThinking
                ? 'bg-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.45)]'
                : isConnected 
                  ? 'bg-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                  : 'bg-white/20'
          }`}
          animate={{
            height: isConnected 
              ? (isModelSpeaking ? [12, 48, 16, 36, 12] : isThinking ? [20, 20, 20] : [8, 8 + volume * 150, 8]) 
              : 4,
            opacity: isConnected ? (isThinking ? [0.4, 1, 0.4] : 1) : 0.3
          }}
          transition={{
            duration: isModelSpeaking ? 0.4 + Math.random() * 0.4 : isThinking ? 1.2 : 0.1,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * (isThinking ? 0.08 : 0.04)
          }}
        />
      ))}
    </div>
  );
}
