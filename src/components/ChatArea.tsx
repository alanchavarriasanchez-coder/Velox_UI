// Verificación: Pasos 1-6 implementados (streaming, delta, estado progresivo, parseo de <think> en tiempo real)
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Square, Sparkles, User, Brain, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { Message } from '../App';

interface ChatAreaProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onFirstUserMessage?: (userMessage: string) => void;
  onDeleteCurrentSession?: () => void;
  backendIp: string;  // <-- Nueva prop para IP dinámica
}

// Función auxiliar para extraer el contenido de pensamiento y el texto final
function parseMessageContent(content: string): { thinkingText: string; finalText: string } {
  const thinkOpen = '<think>';
  const thinkClose = '</think>';

  const openIdx = content.indexOf(thinkOpen);
  const closeIdx = content.indexOf(thinkClose);

  // Caso 1: El modelo omitió <think> pero SÍ cerró con </think>
  if (openIdx === -1 && closeIdx !== -1) {
    return {
      thinkingText: content.slice(0, closeIdx).trim(),
      finalText: content.slice(closeIdx + thinkClose.length).trim()
    };
  }

  // Caso 2: No hay ni apertura ni cierre (texto normal)
  if (openIdx === -1) {
    return { thinkingText: '', finalText: content };
  }

  // Caso 3: Streaming activo (abrió <think> pero aún no hay </think>)
  if (closeIdx === -1 || closeIdx < openIdx) {
    return {
      thinkingText: content.slice(openIdx + thinkOpen.length).trim(),
      finalText: content.slice(0, openIdx).trim()
    };
  }

  // Caso 4: Comportamiento ideal (tiene ambos tags)
  return {
    thinkingText: content.slice(openIdx + thinkOpen.length, closeIdx).trim(),
    finalText: (content.slice(0, openIdx) + content.slice(closeIdx + thinkClose.length)).trim()
  };
}

const ChatArea: React.FC<ChatAreaProps> = ({ messages, setMessages, onFirstUserMessage, onDeleteCurrentSession, backendIp }) => {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  // REVISIÓN: Estado para medir la velocidad de la IA
  const [tps, setTps] = useState<number | null>(null);
  const [availableModels, setAvailableModels] = useState<{ id: string; size_mb: number }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-grow the textarea up to a max height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // Fetch available models from the backend on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch(`http://${backendIp}:8000/v1/models`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        let json: any;
        if (res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let done = false;
          while (!done) {
            const { done: chunkDone, value } = await reader.read();
            done = chunkDone;
            buffer += decoder.decode(value, { stream: !done });
          }
          // Procesar líneas data: {...}
          const lines = buffer.split('\n');
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              dataLine = data; // tomar la última línea data
            }
          }
          const jsonStr = dataLine || buffer;
          json = JSON.parse(jsonStr);
        } else {
          // fallback si el cuerpo no es legible como stream
          json = await res.json();
        }
        const models: { id: string; size_mb: number }[] = json.data ?? [];
        const active: string = json.active_model ?? '';
        setAvailableModels(models);
        if (active) {
          setSelectedModel(active);
        } else if (models.length > 0) {
          setSelectedModel(models[0].id);
        }
      } catch (err) {
        console.error('Error fetching models:', err);
      }
    };
    fetchModels();
  }, [backendIp]); // <-- Depende de backendIp para re-fetch si cambia la IP

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating || isGeneratingRef.current) return;

    // Renombrar el chat si es el primer mensaje del usuario
    if (onFirstUserMessage) {
      onFirstUserMessage(trimmed);
    }

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    const userMsg: Message = {
      id: userMsgId,
      role: 'user',
      content: trimmed,
    } as Message;

    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      streaming: true,
    } as Message;

    // Insertar ambos mensajes de inmediato antes de la llamada a la API
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsGenerating(true);
    isGeneratingRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`http://${backendIp}:8000/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, userMsg],
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // CORRECCIÓN: Verificar que response.body no sea null antes de llamar a getReader()
      if (!response.body) throw new Error('No readable stream');
      const reader = response.body.getReader();

      const decoder = new TextDecoder();
      let buffer = '';

      // REVISIÓN: Variables locales de control para la velocidad
      let tokenCount = 0;
      let startTime = 0;
      setTps(null); // Reiniciar el contador al empezar

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              // End of stream
              break;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                // REVISIÓN: Inicializar el temporizador en el primer token real
                if (tokenCount === 0) {
                  startTime = performance.now();
                }
                tokenCount++;

                // Calcular la velocidad en tiempo real
                const elapsedTime = (performance.now() - startTime) / 1000; // convertir a segundos
                if (elapsedTime > 0) {
                  setTps(parseFloat((tokenCount / elapsedTime).toFixed(1)));
                }

                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, content: last.content + delta };
                  }
                  return updated;
                });
              }
            } catch (e) {
              // ignore parse errors
            }
          }
        }
      }
      // Al salir del bucle, marcar streaming como false
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMsgId) {
          return { ...msg, streaming: false };
        }
        return msg;
      }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // User stopped generation, do nothing
      } else {
        console.error('Error fetching chat completion:', error);
        // Remove the placeholder assistant message if it exists
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && updated[updated.length - 1].content === '') {
            updated.pop();
          }
          return updated;
        });
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error al conectar con el servidor.' }]);
      }
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
      abortControllerRef.current = null;
      // Opcional: si quieres que el indicador desaparezca al terminar, descomenta la siguiente línea:
      // setTps(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating && input.trim()) handleSend();
    }
  };

  const canSend = input.trim().length > 0 && !isGenerating;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-neutral-950">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-800/60 bg-neutral-950/80 px-4 backdrop-blur">
        {/* Model selector */}
        <div className="relative">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="cursor-pointer appearance-none rounded-lg border border-neutral-800 bg-neutral-900 py-1.5 pl-3 pr-9 text-sm text-neutral-100 outline-none transition-colors hover:border-neutral-700 focus:border-neutral-600"
            aria-label="Seleccionar modelo"
          >
            {availableModels.length === 0 && (
              <option value="" className="bg-neutral-900">Cargando modelos…</option>
            )}
            {availableModels.map((m) => (
              <option key={m.id} value={m.id} className="bg-neutral-900">
                {m.id} · {m.size_mb} MB
              </option>
            ))}
          </select>
          <ChevronRight className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-neutral-500" />
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2.5">
          {/* Hardware status */}
          <div className="flex items-center gap-2 rounded-lg border border-neutral-800/60 bg-neutral-900/40 px-3 py-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full animate-ping bg-emerald-400/60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono text-xs text-neutral-400">
              Dispositivo: <span className="text-neutral-200">GPU Intel Arc</span>
            </span>
            {/* REVISIÓN: Muestra los tokens/s dinámicamente si se está generando texto */}
            {tps !== null && (
              <span className="ml-2 border-l border-neutral-800 pl-2 font-mono text-xs text-emerald-400 animate-pulse">
                {tps} tok/s
              </span>
            )}
          </div>

          {/* Delete current session button */}
          {onDeleteCurrentSession && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('¿Estás seguro de que deseas eliminar esta conversación de tu disco local?')) {
                  onDeleteCurrentSession();
                }
              }}
              className="flex size-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-400 transition-colors hover:border-red-900/50 hover:bg-red-950/20 hover:text-red-400"
              title="Eliminar conversación"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </header>

      {/* Zona de mensajes */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-emerald-400">
              <Sparkles className="size-5" />
            </div>
            <h2 className="text-balance text-lg font-medium text-neutral-200">
              ¿En qué estás trabajando?
            </h2>
            <p className="mt-1.5 max-w-sm text-pretty text-sm text-neutral-500">
              Inicia una conversación con tu modelo local. Todo se ejecuta en tu
              hardware, sin salir de tu máquina.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl divide-y divide-neutral-800/40">
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const { thinkingText, finalText } = isUser
                ? { thinkingText: '', finalText: msg.content }
                : parseMessageContent(msg.content);

              return (
                <div key={idx} className="flex gap-4 px-4 py-5">
                  {/* Avatar */}
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-md border ${
                      isUser
                        ? 'border-neutral-700 bg-neutral-800 text-neutral-300'
                        : 'border-neutral-700/60 bg-neutral-900 text-emerald-400'
                    }`}
                  >
                    {isUser ? <User className="size-3.5" /> : <Sparkles className="size-3.5" />}
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="mb-1.5 font-mono text-xs text-neutral-500">
                      {isUser ? 'Tú' : 'VeloxUI'}
                    </div>

                    {thinkingText && (
                      <div className="mb-2 overflow-hidden rounded-md border-l-2 border-neutral-700 bg-neutral-900/40">
                        <button
                          type="button"
                          onClick={() => {}}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-800/40 ${
                            msg.role === 'assistant' && idx === messages.length - 1 && isGenerating ? 'open' : ''
                          }`}
                          aria-expanded={msg.role === 'assistant' && idx === messages.length - 1 && isGenerating ? true : false}
                        >
                          {msg.role === 'assistant' && idx === messages.length - 1 && isGenerating ? (
                            <Loader2 className="size-3.5 shrink-0 animate-spin text-neutral-400" />
                          ) : (
                            <Brain className="size-3.5 shrink-0 text-neutral-500" />
                          )}
                          <span
                            className={`font-mono text-xs ${
                              msg.role === 'assistant' && idx === messages.length - 1 && isGenerating
                                ? 'animate-pulse text-neutral-400'
                                : 'text-neutral-500'
                            }`}
                          >
                            {msg.role === 'assistant' && idx === messages.length - 1 && isGenerating
                              ? 'Razonando…'
                              : 'Cadena de pensamiento'}
                          </span>
                          <ChevronRight
                            className={`ml-auto size-3.5 text-neutral-600 transition-transform ${
                              msg.role === 'assistant' && idx === messages.length - 1 && isGenerating ? 'rotate-90' : ''
                            }`}
                          />
                        </button>

                        {(msg.role === 'assistant' && idx === messages.length - 1 && isGenerating) || !isGenerating ? (
                          <div className="border-t border-neutral-800/60 px-3 py-2.5">
                            <p className="whitespace-pre-wrap text-xs italic leading-relaxed text-neutral-500">
                              {thinkingText}
                              {msg.role === 'assistant' && idx === messages.length - 1 && isGenerating && (
                                <span className="ml-0.5 inline-block animate-pulse">▍</span>
                              )}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}

                    <div className="text-sm leading-relaxed text-neutral-200">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          ul: ({ children }) => (
                            <ul className="list-disc pl-5 my-2">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal pl-5 my-2">{children}</ol>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              className="text-emerald-400 hover:underline"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {children}
                            </a>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-neutral-100">
                              {children}
                            </strong>
                          ),
                          // REVISIÓN V10: Desenvolvemos el <pre> por defecto para evitar doble estructura bloque
                          pre: ({ children }) => children,
                          
                          // REVISIÓN V10: Adaptación del componente code sin la propiedad 'inline'
                          // CORRECCIÓN: se eliminó ...props del destructuring ya que no se usaba
                          code: ({ className, children }) => {
                            const match = /language-(\w+)/.exec(className || '');
                            const contentString = String(children);
                            
                            // Si no tiene clase de lenguaje Y no contiene saltos de línea, es un formato inline (dentro de un <p>)
                            const isInline = !match && !contentString.includes('\n');

                            if (isInline) {
                              return (
                                <code className="bg-neutral-800 px-1 rounded font-mono text-emerald-300 text-xs">
                                  {children}
                                </code>
                              );
                            }

                            // De lo contrario, es un bloque de código estructural seguro fuera de <p>
                            const language = match ? match[1] : '';

                            return (
                              <div className="my-2 rounded-lg bg-neutral-950 border border-neutral-800 overflow-hidden w-full">
                                {language && (
                                  <div className="px-3 py-1 bg-neutral-900 text-neutral-400 text-xs font-mono border-b border-neutral-800">
                                    {language}
                                  </div>
                                )}
                                <pre className="p-4 overflow-x-auto text-emerald-400 font-mono text-sm">
                                  <code>{children}</code>
                                </pre>
                              </div>
                            );
                          },
                        }}
                      >
                        {finalText}
                      </ReactMarkdown>
                      {idx === messages.length - 1 && isGenerating && finalText && (
                        <span className="ml-0.5 inline-block animate-pulse">▍</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Indicador de carga mientras se genera la respuesta */}
        {isGenerating && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="flex gap-4 px-4 py-5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-neutral-700/60 bg-neutral-900 text-emerald-400">
              <Sparkles className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="mb-1.5 font-mono text-xs text-neutral-500">VeloxUI</div>
              <div className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="inline-block size-2 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="inline-block size-2 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Caja de entrada inferior */}
      <div className="shrink-0 px-4 pb-5 pt-2">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-xl border border-neutral-800 bg-neutral-900/80 p-2 shadow-lg shadow-black/20 transition-colors focus-within:border-neutral-700">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
              placeholder={isGenerating ? 'Generando respuesta…' : 'Envía un mensaje a VeloxUI…'}
              className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600 disabled:opacity-60"
            />

            {isGenerating ? (
              <button
                type="button"
                onClick={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                  }
                  setIsGenerating(false);
                }}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-200 transition-colors hover:bg-neutral-700"
                aria-label="Detener generación"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
                aria-label="Enviar mensaje"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
          <p className="mt-2 text-center font-mono text-[11px] text-neutral-700">
            VeloxUI ejecuta modelos localmente vía Intel OpenVINO
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
