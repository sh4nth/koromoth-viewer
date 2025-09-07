import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);

  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (token) {
      // API Gateway Cognito Authorizer expects the raw token, not "Bearer <token>"
      headers.set("Authorization", token);
    }
  } catch (error) {
    // User is not signed in, proceed with the request without the token.
    console.log("User is not authenticated. Making a guest request.");
  }

  const url = `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

  return fetch(url, { ...options, headers });
}
