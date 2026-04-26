// Maps card number prefixes to card art images
// Longer prefixes must come first to avoid false matches
const CARD_IMAGE_MAP = [
  { prefix: "55235044", url: "https://media.base44.com/images/public/69ea23999e413c4f2e55b85a/6107fa3ff_cbaultimateawardsmastercard.png", label: "CBA Ultimate Awards Mastercard" },
  { prefix: "55235024", url: "https://media.base44.com/images/public/69ea23999e413c4f2e55b85a/9779cb726_cbasmartawardsmastercard.png", label: "CBA Smart Awards Mastercard" },
  { prefix: "521729",   url: "https://media.base44.com/images/public/69ea23999e413c4f2e55b85a/0bc327c65_cbadebitmastercard.png", label: "CBA Debit Mastercard" },
  { prefix: "516361",   url: "https://media.base44.com/images/public/69ea23999e413c4f2e55b85a/ef49b4b1e_westpacdebitmastercard.png", label: "Westpac Debit Mastercard" },
];

/**
 * Given a card number string (may contain spaces/dashes), returns the matching card image or null.
 */
export function getCardImage(cardNumber) {
  if (!cardNumber) return null;
  const digits = String(cardNumber).replace(/\D/g, "");
  for (const { prefix, url, label } of CARD_IMAGE_MAP) {
    if (digits.startsWith(prefix)) return { url, label };
  }
  return null;
}