// Teléfonos en formato internacional: "+56912345678".

// Acepta "9 1234 5678", "912345678", "+56 9 1234 5678" o un número
// extranjero con "+". Devuelve null si no parece un celular válido.
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (/^9\d{8}$/.test(digits)) return "+56" + digits;
  if (/^569\d{8}$/.test(digits)) return "+" + digits;
  if (input.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return "+" + digits;
  return null;
}

// Enlace que abre WhatsApp con el mensaje ya escrito.
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
