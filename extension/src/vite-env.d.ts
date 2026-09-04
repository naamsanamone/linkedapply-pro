/* ============================================================
   LinkedApply Pro — Vite Environment Type Declarations
   ============================================================ */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  // No env vars needed — BYOK mode
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
