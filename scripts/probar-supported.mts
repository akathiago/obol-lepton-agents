// scripts/probar-supported.mts
// Asks Circle's Gateway facilitator what payment kinds it supports, so we can
// build requirements that exactly match what /v1/x402/verify expects.
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";

const facilitator = new BatchFacilitatorClient();
const supported = await facilitator.getSupported();
console.log(JSON.stringify(supported, null, 2));
