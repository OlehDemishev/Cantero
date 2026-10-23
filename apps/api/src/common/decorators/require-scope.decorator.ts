import { SetMetadata } from "@nestjs/common";
import type { ApiKeyScope } from "@cantero/shared";

export const REQUIRE_SCOPE_KEY = "requireScope";
/** Restricts an API-key route (handler or whole controller) to keys whose scopes include this one.
 * An empty scopes array on the key means every read dataset — but not the scopes listed in
 * EXPLICIT_API_KEY_SCOPES (SCIM), which the key must name. */
export const RequireScope = (scope: ApiKeyScope) => SetMetadata(REQUIRE_SCOPE_KEY, scope);
