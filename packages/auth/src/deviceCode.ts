import { randomBytes, randomUUID } from "node:crypto";

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

/** Long, unguessable code the extension polls with. */
export function generateDeviceCode(): string {
  return randomUUID();
}

/** Short, human-typeable code shown to the user to enter in the browser (e.g. "WXYZ-1234"). */
export function generateUserCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
