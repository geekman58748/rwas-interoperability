/**
 * submit_proof_sdk.ts
 *
 * Full flow using the @gluwa/usc-sdk:
 * 1. Fetch proof from Proof Builder service
 * 2. Verify proof on-chain via BlockProver precompile (using SDK)
 * 3. Submit ownership verification to our ASC contract
 */
import "dotenv/config";
