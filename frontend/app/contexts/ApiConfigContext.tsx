import { createContext } from "react";

export interface ApiConfig {
  beta: boolean;
}
export const ApiConfigContext = createContext<ApiConfig>({ beta: false });
