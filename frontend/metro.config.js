// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// Стабильный кэш на диске (ускоряет повторные сборки)
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];

// Исключаем ненужные папки из наблюдения (значительно ускоряет)
config.resolver.blockList = [
  /node_modules\/.*\/(android|ios|windows|macos|__tests__|__mocks__|__fixtures__|\.git)/,
  /\.git\/.*/,
  /android\/.*/,
  /ios\/.*/,
];

// Оптимизация для web сборки
config.resolver.sourceExts = ['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs'];
config.resolver.assetExts = config.resolver.assetExts.filter(ext => ext !== 'svg');

// Уменьшаем воркеры (экономия памяти, стабильнее)
config.maxWorkers = 4;

// Отключаем лишние проверки в dev
config.transformer.minifierConfig = {
  keep_classnames: true,
  keep_fnames: true,
  mangle: false,
};

module.exports = config;
