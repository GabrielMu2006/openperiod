const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateInviteCode(random = Math.random, length = 6) {
  return Array.from({ length }, () => {
    const index = Math.floor(random() * INVITE_ALPHABET.length);
    return INVITE_ALPHABET[Math.min(index, INVITE_ALPHABET.length - 1)];
  }).join("");
}

export function normalizeInviteCode(code: string) {
  return code.trim().toUpperCase();
}
