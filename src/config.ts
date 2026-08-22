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

export function loadServiceConfig(
  prefix: string,
  defaults: ServiceConfig
): ServiceConfig {
  return {
    ip: localStorage.getItem(`${prefix}_ip`) ?? defaults.ip,
    port: localStorage.getItem(`${prefix}_port`) ?? defaults.port,
  };
}

export function saveServiceConfig(
  prefix: string,
  config: ServiceConfig
): void {
  localStorage.setItem(`${prefix}_ip`, config.ip);
  localStorage.setItem(`${prefix}_port`, config.port);
}

export function buildServiceUrl(config: ServiceConfig, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `http://${config.ip}:${config.port}${normalizedPath}`;
}
