// Aviso breve sobre el menú de abajo.
export default function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="fixed left-1/2 bottom-24 -translate-x-1/2 z-50 max-w-[90vw] rounded-xl bg-ink text-bg px-4 py-3 text-sm font-semibold text-center shadow-lg"
    >
      {message}
    </div>
  );
}
