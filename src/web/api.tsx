import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { client } from "./client.ts";

/** The typed API client. Components get it from context so tests can stub it at this boundary. */
export type Api = typeof client;

const ApiContext = createContext<Api>(client);

export const ApiProvider = ApiContext.Provider;
export const useApi = () => useContext(ApiContext);
