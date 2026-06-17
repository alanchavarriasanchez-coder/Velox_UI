import { useState, useEffect } from 'react';

const dnaFrames = [
  "      - - -      \n    /       \\    \n   |         |   \n    \\       /    \n      - - -      ",
  "     \\     /     \n      \\   /      \n       | |       \n      /   \\      \n     /     \\     ",
  "       \\ /       \n        X        \n       / \\       \n      /   \\      \n     /     \\     ",
  "      /   \\      \n     /     \\     \n    |       |    \n     \\     /     \n      \\   /      ",
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
      <pre className="font-mono text-emerald-500 text-sm tracking-widest leading-tight transition-all duration-75">
        {dnaFrames[frame]}
      </pre>
      <h1 className="mt-8 text-2xl font-bold tracking-[0.3em] text-white">
        VELOX UI
      </h1>
      <p className="mt-4 text-sm animate-pulse">
        Inicializando motor de inferencia local...
      </p>
    </div>
  );
}
