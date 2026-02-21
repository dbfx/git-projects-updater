/// <reference types="vite/client" />

import { AppApi } from "../shared/types";

declare global {
  interface Window {
    api: AppApi;
  }
}

export {};
