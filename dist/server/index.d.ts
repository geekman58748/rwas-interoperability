/**
 * server/index.ts
 *
 * Backend API for the RWA Ownership Proof demo.
 * Handles SDK interactions that can't run in the browser:
 * - Proof generation via Attestcoin SDK
 * - Proof verification via BlockProver precompile
 * - Contract state queries
 */
import "dotenv/config";
