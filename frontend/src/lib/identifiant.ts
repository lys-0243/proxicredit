/** Clé d'idempotence unique pour une opération financière (évite les doubles encaissements).
 * `crypto.randomUUID` n'existe qu'en HTTPS ou sur localhost : repli sur `getRandomValues`, disponible
 * partout (accès à un serveur du réseau local en HTTP, par exemple). */
export function cleIdempotence(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const octets = crypto.getRandomValues(new Uint8Array(16));
  octets[6] = (octets[6] & 0x0f) | 0x40;
  octets[8] = (octets[8] & 0x3f) | 0x80;
  const hex = Array.from(octets, (o) => o.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
