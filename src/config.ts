export interface ServiceConfig {
  ip: string;
  port: string;
}

export const DEFAULT_BACKEND_CONFIG: ServiceConfig = {
  ip: 'localhost',
  port: '8000',
};

export const DEFAULT_SEARCH_CONFIG: ServiceConfig = {
  ip: '192.168.1.16',
  port: '8080',
};

// 0.0.0.0 (y equivalentes) es una dirección en la que un SERVIDOR escucha,
// nunca una dirección a la que un CLIENTE debe conectarse. Tratarlas como
// inválidas evita que la app quede rota si se guardan por accidente.
const NON_CONNECTABLE_ADDRESSES = new Set([
  '0.0.0.0',
  '0:0:0:0:0:0:0:0',
  '::',
]);

const VALID_PORT_PATTERN = /^\d{1,5}$/;

// Solo acepta hosts desnudos (IP u hostname). Rechaza esquemas, rutas y
// puertos incrustados (ej: "http://192.168.1.5", "http//192.168.1.5",
// "192.168.1.5:8000"), que rompen la URL construida en buildServiceUrl.
const INVALID_ADDRESS_CHARS = /[:\/\\@?]/;

export function isConnectableAddress(ip: string): boolean {
  const value = ip.trim();
  if (!value) return false;
  if (INVALID_ADDRESS_CHARS.test(value)) return false;
  return !NON_CONNECTABLE_ADDRESSES.has(value.toLowerCase());
}

export function isConnectablePort(port: string): boolean {
  const value = port.trim();
  if (!value) return false;
  return VALID_PORT_PATTERN.test(value);
}

// Devuelve true si el valor guardado era inválido y fue reemplazado por el
// valor por defecto. Permite a la UI avisar al usuario.
function sanitizeConfig(
  config: ServiceConfig,
  defaults: ServiceConfig
): { config: ServiceConfig; healed: boolean } {
  const ip = config.ip.trim();
  const port = config.port.trim();
  let healed = false;

  const finalIp = isConnectableAddress(ip) ? ip : defaults.ip;
  const finalPort = isConnectablePort(port) ? port : defaults.port;

  if (finalIp !== ip || finalPort !== port) healed = true;

  return { config: { ip: finalIp, port: finalPort }, healed };
}

export function loadServiceConfig(
  prefix: string,
  defaults: ServiceConfig
): ServiceConfig {
  const saved: ServiceConfig = {
    ip: localStorage.getItem(`${prefix}_ip`) ?? defaults.ip,
    port: localStorage.getItem(`${prefix}_port`) ?? defaults.port,
  };

  const { config, healed } = sanitizeConfig(saved, defaults);
  if (healed) {
    // Corrige también el valor persistido para que no siga roto.
    persistServiceConfig(prefix, config);
  }
  return config;
}

export function saveServiceConfig(
  prefix: string,
  config: ServiceConfig,
  defaults: ServiceConfig
): { healed: boolean } {
  // Fallback: usar el valor ya guardado (que ya está saneado) o el default,
  // en lugar de persistir una dirección inválida como 0.0.0.0.
  const current: ServiceConfig = {
    ip: localStorage.getItem(`${prefix}_ip`) ?? defaults.ip,
    port: localStorage.getItem(`${prefix}_port`) ?? defaults.port,
  };

  const { config: clean, healed } = sanitizeConfig(config, current);
  persistServiceConfig(prefix, clean);
  return { healed };
}

function persistServiceConfig(prefix: string, config: ServiceConfig): void {
  localStorage.setItem(`${prefix}_ip`, config.ip);
  localStorage.setItem(`${prefix}_port`, config.port);
}

export function buildServiceUrl(config: ServiceConfig, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `http://${config.ip}:${config.port}${normalizedPath}`;
}

const SYSTEM_PROMPT_KEY = 'veloxui_system_prompt';

// Si el usuario no define un prompt personalizado, no se envía nada y el
// servidor usa el de config/config.json.
export function loadSystemPrompt(): string {
  return localStorage.getItem(SYSTEM_PROMPT_KEY) ?? '';
}

export function saveSystemPrompt(prompt: string): void {
  const trimmed = prompt.trim();
  if (trimmed) {
    localStorage.setItem(SYSTEM_PROMPT_KEY, trimmed);
  } else {
    localStorage.removeItem(SYSTEM_PROMPT_KEY);
  }
}

// Genera un UUID v4. crypto.randomUUID solo existe en contextos seguros
// (https, localhost); desde una IP de LAN por HTTP (ej: http://192.168.1.5:1420)
// es undefined, así que se usa un fallback para que la app no explote.
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
