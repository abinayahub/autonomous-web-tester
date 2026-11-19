// Prints a random 32-byte key as 64 hex characters (for JWT_SECRET / CREDENTIAL_MASTER_KEY).
import { randomBytes } from 'node:crypto';
console.log(randomBytes(32).toString('hex'));
