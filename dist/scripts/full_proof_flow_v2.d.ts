/**
 * full_proof_flow_v2.ts
 *
 * Complete v2 flow:
 * 1. Mint asset on Sepolia (or use existing)
 * 2. Fetch proof via SDK
 * 3. Verify proof via BlockProver precompile
 * 4. Store verified ownership + mint VerifiedShare receipt
 * 5. Show before/after state change
 * 6. Demo receipt validity check
 */
import "dotenv/config";
