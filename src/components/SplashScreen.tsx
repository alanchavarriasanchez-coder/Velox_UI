import { useState, useEffect } from 'react';

const dnaFrames = [
  "   A ═══ T   \n  /       \\  \n G ═══════ C \n  \\       /  \n   T ═══ A   ",
  "   \\     /   \n    A ═ T    \n      X      \n    G ═ C    \n   /     \\   ",
  "   T ═══ A   \n  /       \\  \n C ═══════ G \n  \\       /  \n   A ═══ T   ",
  "   /     \\   \n    T ═ A    \n      X      \n    C ═ G    \n   /     \\   "
];

export default function SplashScreen() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % dnaFrames.length);
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-neutral-950 text-neutral-400">
      <pre className="font-mono text-emerald-500 text-sm tracking-widest leading-tight h-20 flex items-center justify-center transition-all duration-75 select-none">
        {dnaFrames[frame]}
      </pre>
      <h1 className="mt-8 text-xl font-bold tracking-[0.4em] text-white">
        VELOX UI
      </h1>
      <p className="mt-3 text-xs text-neutral-500 animate-pulse tracking-wide">
        Inicializando motor de inferencia local...
      </p>
    </div>
  );
}
