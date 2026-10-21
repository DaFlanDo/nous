/**
 * Offline-first система для Nous
 * 
 * Архитектура:
 * - database.ts    - низкоуровневая работа с IndexedDB
 * - syncService.ts - очередь операций и синхронизация
 * - notesRepository.ts - репозиторий заметок
 * - checklistsRepository.ts - репозиторий чеклистов
 * - hooks.ts       - React хуки для компонентов
 * - types.ts       - TypeScript типы
 */

export * from './types';
export * from './database';
export * from './syncService';
export * from './notesRepository';
export * from './checklistsRepository';
export * from './hooks';
