import { SetMetadata } from "@nestjs/common";
import type { ApiKeyScope } from "@cantero/shared";

export const REQUIRE_SCOPE_KEY = "requireScope";
/** Restricts a /v1/* route to API keys whose scopes include this one (an empty scopes array on
 * the key means unrestricted, so this only ever narrows — never widens — what a key can reach). */
export const RequireScope = (scope: ApiKeyScope) => SetMetadata(REQUIRE_SCOPE_KEY, scope);
