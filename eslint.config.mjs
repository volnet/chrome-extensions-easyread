const browserGlobals = {
  AbortSignal: "readonly",
  Blob: "readonly",
  btoa: "readonly",
  ClipboardItem: "readonly",
  FileReader: "readonly",
  Node: "readonly",
  Highlight: "readonly",
  HTMLInputElement: "readonly",
  HTMLTextAreaElement: "readonly",
  HTMLSelectElement: "readonly",
  HTMLVideoElement: "readonly",
  CSS: "readonly",
  CustomEvent: "readonly",
  Element: "readonly",
  MutationObserver: "readonly",
  DOMParser: "readonly",
  NodeFilter: "readonly",
  Range: "readonly",
  URL: "readonly",
  chrome: "readonly",
  clearTimeout: "readonly",
  clearInterval: "readonly",
  console: "readonly",
  document: "readonly",
  history: "readonly",
  location: "readonly",
  navigator: "readonly",
  performance: "readonly",
  fetch: "readonly",
  crypto: "readonly",
  createImageBitmap: "readonly",
  setTimeout: "readonly",
  setInterval: "readonly",
  window: "readonly",
  JSZip: "readonly"
};

const nodeGlobals = {
  AbortSignal: "readonly",
  Buffer: "readonly",
  console: "readonly",
  fetch: "readonly",
  module: "readonly",
  process: "readonly",
  require: "readonly"
};

export default [
  {
    ignores: ["dist/**", "node_modules/**", "output/**", "src/scripts/jszip.min.js"]
  },
  {
    files: ["src/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: "warn"
    }
  },
  {
    files: ["scripts/**/*.mjs", "test/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: "warn"
    }
  }
];
