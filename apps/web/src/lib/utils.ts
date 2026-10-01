import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Chaves de um mapa de rótulos tipado (opções de `<select>` sem carregar o schema). */
export const keysOf = <K extends string>(record: Record<K, unknown>) => Object.keys(record) as K[];
