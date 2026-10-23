import { apiFetch } from "@/lib/api-client";

/**
 * The link a client got by email (estimate, change order or contract). The token in it is the
 * client's credential, so the API leaves it out of list/get responses and hands it out only from
 * the manage-only `…/client-link` endpoint, fetched when someone actually asks to copy it.
 */
export async function fetchClientLink(apiPath: string, publicPath: "estimate" | "change-order" | "contract"): Promise<string> {
  const { token } = await apiFetch<{ token: string }>(apiPath);
  return `${window.location.origin}/${publicPath}/${token}`;
}
