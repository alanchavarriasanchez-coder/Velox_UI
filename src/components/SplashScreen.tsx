import { useState, useEffect } from 'react';

// === ESPACIO PARA COPIAR Y PEGAR ===
const n: string[] = [];

// >>> PEGA AQUÍ ABAJO TUS LÍNEAS DESDE n[0] HASTA n[58] <<<


// ====================================

export default function SplashScreen() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (n.length === 0) return;
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % n.length);
    }, 48); // Velocidad nativa de 48ms
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-neutral-950 text-emerald-500 selection:bg-transparent">
      <div className="w-full flex items-center justify-center overflow-hidden max-h-[70vh]">
        <pre className="font-mono text-[10px] leading-none tracking-tight whitespace-pre text-center text-emerald-400 select-none scale-75 md:scale-100">
          {n[frame] || 'INICIALIZANDO MATRIZ...'}
        </pre>
      </div>
      <h1 className="mt-6 text-xl font-bold tracking-[0.5em] text-white font-mono animate-pulse">
        VELOX UI
      </h1>
      <p className="mt-2 text-[10px] text-neutral-600 font-mono tracking-wide uppercase">
        Inference Engine Initialization
      </p>
    </div>
  );
}
