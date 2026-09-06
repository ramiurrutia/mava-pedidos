export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando aplicación" className="min-h-dvh overflow-hidden bg-[#f7f7f5] text-[#202825]">
      <header className="flex h-[68px] items-center border-b border-[#e7e8e5] bg-white px-[clamp(18px,4vw,48px)]">
        <span className="loading-skeleton size-8 rounded-lg" />
        <span className="ml-2.5 grid gap-1.5">
          <span className="loading-skeleton h-2.5 w-14 rounded-full" />
          <span className="loading-skeleton h-2 w-10 rounded-full" />
        </span>
        <span className="loading-skeleton ml-auto h-10 w-28 rounded-lg" />
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-[clamp(18px,4vw,48px)] pb-24 pt-6">
        <div className="mb-5 grid gap-2">
          <span className="loading-skeleton h-2.5 w-20 rounded-full" />
          <span className="loading-skeleton h-8 w-40 rounded-lg" />
          <span className="loading-skeleton h-2.5 w-28 rounded-full" />
        </div>
        <div className="mb-5 grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }, (_, index) => <span className="loading-skeleton h-16 rounded-xl" key={index} />)}
        </div>
        <div className="grid gap-2 rounded-xl border border-[#e4e6e3] bg-white p-4">
          <span className="loading-skeleton h-3 w-40 rounded-full" />
          <span className="loading-skeleton mt-2 h-14 rounded-lg" />
          <span className="loading-skeleton h-14 rounded-lg" />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex h-[calc(64px+env(safe-area-inset-bottom))] items-start justify-center gap-2 border-t border-[#e3e5e2] bg-white/95 px-4 pt-2 pb-[env(safe-area-inset-bottom)]">
        {Array.from({ length: 3 }, (_, index) => <span className="loading-skeleton h-12 min-w-[112px] rounded-lg max-[480px]:min-w-0 max-[480px]:flex-1" key={index} />)}
      </nav>
      <span className="sr-only">Cargando datos de Supabase.</span>
    </div>
  );
}
