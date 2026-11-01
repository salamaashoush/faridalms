import type { SignInInput } from "@faridalms/domain/identity-schema";

import { createApiClient } from "@faridalms/api-client";

import type { RoleKey } from "./sign-in";

import { ACCOUNTS, PASSWORD } from "./sign-in";

/** The gate's API, which native clients call directly. */
export const API_ORIGIN = `http://127.0.0.1:${process.env.E2E_API_PORT ?? "3201"}`;

export type Api = ReturnType<typeof createApiClient>;

export function apiClient(
  options: { token?: string; school?: string; locale?: string } = {},
): Api {
  return createApiClient({
    url: `${API_ORIGIN}/rpc`,
    school: options.school ?? "northwind",
    ...(options.token ? { token: options.token } : {}),
    ...(options.locale ? { locale: options.locale } : {}),
  });
}

/** Signs in with a password, as a native app does, and calls as that person. */
export async function signedInApi(
  email: string,
  password = PASSWORD,
  school = "northwind",
  context?: SignInInput["context"],
): Promise<{ api: Api; token: string }> {
  const { token } = await apiClient({ school }).identity.signIn({
    loginName: email,
    password,
    ...(context ? { context } : {}),
  });
  return { api: apiClient({ token, school }), token };
}

export const apiAs = (role: RoleKey) =>
  signedInApi(ACCOUNTS[role].email).then((session) => session.api);
