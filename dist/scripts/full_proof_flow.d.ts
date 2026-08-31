/**
 * full_proof_flow.ts
 *
 * Complete flow:
 * 1. Fetch proof from Proof Builder
 * 2. Verify proof on-chain via BlockProver precompile (using SDK)
 * 3. Store verified ownership in our ASC
 */
import "dotenv/config";
