export interface CheckerPayload {
  /** base64 PBKDF2 salt */
  s: string;
  /** base64 AES-GCM iv */
  i: string;
  /** base64 ciphertext with the 16-byte auth tag appended */
  c: string;
  /** PBKDF2 iterations */
  n: number;
}

/** Throws if the password is wrong or the payload is corrupt. */
export function decryptChecker(payload: CheckerPayload, password: string): string;
