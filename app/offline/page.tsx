import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f7f5] px-6 py-12 text-[#202825]">
      <section className="w-full max-w-sm rounded-2xl border border-[#e1e5e1] bg-white p-7 text-center shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[#235c4c] text-xl font-bold text-white">M</span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-.035em]">Sin conexión</h1>
        <p className="mt-2 text-sm leading-6 text-[#68726d]">
          Necesitás conexión a internet para consultar y actualizar los pedidos de forma segura.
        </p>
        <Link className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg bg-[#235c4c] px-5 text-xs font-semibold text-white no-underline" href="/">
          Reintentar
        </Link>
      </section>
    </main>
  );
}
