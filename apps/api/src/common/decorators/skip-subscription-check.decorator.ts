import { SetMetadata } from "@nestjs/common";

export const SKIP_SUBSCRIPTION_CHECK_KEY = "skipSubscriptionCheck";
/** Route requires a logged-in user but must stay reachable before the subscription is active (e.g. starting Stripe Checkout). */
export const SkipSubscriptionCheck = () => SetMetadata(SKIP_SUBSCRIPTION_CHECK_KEY, true);
