// Types for EXPO_PUBLIC_* env vars (inlined by babel-preset-expo at build time).
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_STADIA_API_KEY?: string;
  }
}

declare const process: { env: NodeJS.ProcessEnv };
