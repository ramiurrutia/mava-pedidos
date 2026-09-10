import type { OrderStatus } from "../../../lib/orders";

export type DashboardView = "resumen" | "pedidos" | "carpetas" | "nuevo" | "subir" | "pedido" | "carpeta" | "importar-pdf";
export type WorkspaceView = Extract<DashboardView, "resumen" | "pedidos" | "carpetas">;
export type DataSource = "loading" | "supabase" | "error";

export const statuses: OrderStatus[] = ["Pendiente", "En producción", "Terminado", "Entregado"];

export const statusStyles: Record<OrderStatus, string> = {
  Pendiente: "text-[#9a5b32] bg-[#fbede2]",
  "En producción": "text-[#356753] bg-[#e4eee8]",
  Terminado: "text-[#65597d] bg-[#eeeaf5]",
  Entregado: "text-[#63706a] bg-[#edf0ee]",
};

export const ui = {
  appShell: "min-h-screen bg-[#f7f7f5] text-[#202825]",
  sidebar: "sticky top-0 z-20 flex h-[68px] items-center border-b border-[#e7e8e5] bg-white/95 px-[clamp(18px,4vw,48px)] backdrop-blur-xl",
  brand: "flex shrink-0 items-center gap-2.5 text-inherit no-underline",
  brandMark: "grid size-8 place-items-center rounded-lg bg-[#235c4c] text-sm font-bold text-white",
  brandCopy: "leading-none [&_strong]:block [&_strong]:text-sm [&_strong]:font-bold [&_strong]:tracking-[.04em] [&_span]:mt-1 [&_span]:block [&_span]:text-[9px] [&_span]:font-medium [&_span]:uppercase [&_span]:tracking-[.12em] [&_span]:text-[#89928e]",
  nav: "fixed inset-x-0 bottom-0 z-30 flex h-[calc(64px+env(safe-area-inset-bottom))] items-start justify-center gap-2 border-t border-[#e3e5e2] bg-white/95 px-4 pt-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl",
  navItem: "flex h-12 min-w-[112px] items-center justify-center gap-2 rounded-lg px-4 text-xs font-medium text-[#6f7874] no-underline transition-colors hover:bg-[#f3f5f2] hover:text-[#235c4c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235c4c] [&_svg]:size-4 max-[480px]:min-w-0 max-[480px]:flex-1 max-[480px]:flex-col max-[480px]:gap-1 max-[480px]:px-2 max-[480px]:text-[10px]",
  navActive: "bg-[#edf3ef] font-semibold text-[#235c4c]",
  sidebarFoot: "ml-auto flex items-center gap-2",
  main: "mx-auto w-full max-w-[1120px] px-[clamp(18px,4vw,48px)] pb-[calc(92px+env(safe-area-inset-bottom))] pt-9 motion-safe:animate-[page-enter_220ms_ease-out_both] max-[600px]:pt-6",
  topbar: "mb-8 flex items-start justify-between gap-6",
  connectionStatus: "mt-2 flex items-center gap-2 text-xs text-[#69746f] [&_i]:size-1.5 [&_i]:rounded-full",
  eyebrow: "mb-1.5 text-[11px] font-semibold uppercase tracking-[.12em] text-[#7d8782]",
  h1: "text-[clamp(26px,3vw,34px)] font-semibold tracking-[-.035em]",
  h2: "text-xl font-semibold tracking-[-.025em]",
  primaryButton: "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#235c4c] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#1b4d40] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235c4c] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4",
  secondaryButton: "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#dfe3df] bg-white px-3.5 text-[13px] font-semibold text-[#34413c] transition-colors hover:bg-[#f5f6f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235c4c] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4",
  textButton: "inline-flex min-h-10 cursor-pointer items-center justify-center gap-1 bg-transparent px-1 text-xs font-medium text-[#66716c] [&_svg]:w-[14px]",
  overview: "mb-8",
  sectionHeading: "mb-4 flex items-end justify-between gap-5 max-[680px]:flex-col max-[680px]:items-stretch",
  ordersHeading: "",
  metricGrid: "grid grid-cols-4 overflow-hidden rounded-xl border border-[#e4e6e3] bg-white max-[680px]:grid-cols-2",
  metricCard: "flex min-h-[82px] cursor-pointer flex-col justify-center border-r border-[#e7e9e6] px-5 text-left transition-colors last:border-r-0 hover:bg-[#fafbf9] max-[680px]:border-b max-[680px]:odd:border-r max-[680px]:even:border-r-0 max-[680px]:nth-[n+3]:border-b-0 [&_strong]:mt-1.5 [&_strong]:text-2xl [&_strong]:font-semibold [&_strong]:leading-none",
  metricSelected: "bg-[#edf3ef] text-[#235c4c] hover:bg-[#edf3ef]",
  metricLabel: "text-[11px] font-medium text-[#717b76]",
  searchBox: "flex h-10 w-[min(340px,48%)] items-center gap-2.5 rounded-lg border border-[#dfe3df] bg-white px-3 focus-within:border-[#94aa9f] focus-within:ring-2 focus-within:ring-[#e8efeb] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[#8a938f] max-[680px]:w-full",
  searchInput: "min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#202825] outline-none placeholder:text-[#929b96]",
  orderList: "overflow-hidden rounded-xl border border-[#e4e6e3] bg-white",
  tableGrid: "grid grid-cols-[minmax(180px,2fr)_minmax(130px,1fr)_76px_88px_44px] items-center gap-x-3",
  listHead: "min-h-10 border-b border-[#e7e9e6] bg-[#fafbf9] px-4 text-[9px] font-semibold uppercase tracking-[.08em] text-[#929a96] max-[760px]:hidden",
  orderRow: "min-h-[70px] w-full cursor-pointer border-b border-[#eceeeb] bg-white px-4 text-left transition-colors last:border-b-0 hover:bg-[#fafbf9] focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#235c4c] max-[760px]:grid-cols-[1fr_auto] max-[760px]:grid-rows-2 max-[760px]:gap-y-2 max-[760px]:p-3.5",
  orderIdentity: "flex min-w-0 items-center gap-3 max-[760px]:[grid-area:1/1] [&_strong]:block [&_strong]:truncate [&_strong]:text-[13px] [&_strong]:font-semibold [&_small]:mt-1 [&_small]:block [&_small]:truncate [&_small]:text-[11px] [&_small]:text-[#737e78]",
  orderCover: "grid size-10 shrink-0 place-items-center rounded-lg text-white/80 [&_svg]:size-[17px]",
  folderCover: "bg-[#dfe9e2] !text-[#173d34]",
  statusPill: "inline-flex min-h-7 w-max items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-semibold [&_i]:size-1.5 [&_i]:rounded-full [&_i]:bg-current",
  statusCell: "max-[760px]:[grid-area:2/1]",
  imageCount: "flex items-center gap-1.5 text-[11px] text-[#68726d] [&_svg]:size-3.5 max-[760px]:[grid-area:2/2] max-[760px]:justify-self-end",
  dateCell: "text-[11px] capitalize text-[#747e79] max-[760px]:hidden",
  rowArrow: "text-[#a4aca8] [&_svg]:size-3.5 max-[760px]:[grid-area:1/2]",
  emptyState: "flex min-h-[190px] flex-col items-center justify-center gap-2 px-5 text-center text-[11px] text-[#78827d] [&_svg]:mb-1 [&_svg]:size-5 [&_strong]:text-xs [&_strong]:font-semibold [&_strong]:text-[#202825]",
  pageHead: "mb-6 flex items-start justify-between gap-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-[-.025em]",
  field: "mb-4 grid gap-1.5 [&>span]:text-[11px] [&>span]:font-semibold [&>span]:text-[#68726d] [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-[#dfe3df] [&_input]:bg-white [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-[13px] [&_input]:outline-none [&_input:focus]:border-[#8fa79c] [&_input:focus]:ring-2 [&_input:focus]:ring-[#e8efeb] [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-[#dfe3df] [&_textarea]:bg-white [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:text-[13px] [&_textarea]:outline-none [&_textarea:focus]:border-[#8fa79c] [&_textarea:focus]:ring-2 [&_textarea:focus]:ring-[#e8efeb] [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-[#dfe3df] [&_select]:bg-white [&_select]:px-3 [&_select]:py-2.5 [&_select]:text-[13px] [&_select]:outline-none [&_select:focus]:border-[#8fa79c] [&_select:focus]:ring-2 [&_select:focus]:ring-[#e8efeb]",
  uploadZone: "flex min-h-[145px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#bdc8c2] bg-[#fafbf9] px-5 text-center [&>svg]:size-6 [&>svg]:text-[#235c4c] [&>strong]:text-[13px] [&>span]:text-[11px] [&>span]:leading-relaxed [&>span]:text-[#78827d] [&_button]:mt-1",
  fileSummary: "mt-2.5 flex max-h-20 flex-wrap gap-1.5 overflow-auto [&_span]:flex [&_span]:max-w-full [&_span]:items-center [&_span]:gap-1.5 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:rounded-md [&_span]:bg-[#eef2ef] [&_span]:px-2 [&_span]:py-1.5 [&_span]:text-[9px] [&_svg]:size-3 [&_svg]:shrink-0",
  assignmentStep: "grid gap-[10px]",
  assignmentCard: "grid min-h-14 w-full cursor-pointer grid-cols-[18px_1fr] items-start gap-3 rounded-lg border border-[#dfe3df] bg-white p-3.5 text-left transition-colors hover:bg-[#fafbf9] disabled:cursor-not-allowed disabled:opacity-50 [&_strong]:block [&_strong]:text-[13px] [&_strong]:font-semibold [&_small]:mt-1 [&_small]:block [&_small]:text-[11px] [&_small]:leading-relaxed [&_small]:text-[#75807b]",
  assignmentSelected: "border-[#7f9d90] bg-[#f1f6f2]",
  assignmentRadio: "size-[17px] rounded-full border-[1.5px] border-[#aab4af] shadow-[inset_0_0_0_4px_transparent]",
  assignmentRadioSelected: "border-[#173d34] bg-[#173d34] shadow-[inset_0_0_0_4px_#f1f6f2]",
  assignmentSelect: "mb-0 mt-1 rounded-lg bg-[#f7f8f6] p-3",
  safetyNote: "mt-4 flex items-start gap-2.5 rounded-lg bg-[#eef5f0] p-3 text-[#335a4b] [&>span]:grid [&>span]:size-[18px] [&>span]:shrink-0 [&>span]:place-items-center [&>span]:rounded-full [&>span]:bg-[#d7e7dc] [&>span]:text-[9px] [&_p]:m-0 [&_p]:text-[11px] [&_p]:leading-relaxed [&_strong]:block [&_strong]:text-[11px] [&_strong]:font-semibold [&_strong]:text-[#25483b]",
  formActions: "mt-5 flex justify-end gap-2 max-[480px]:grid max-[480px]:grid-cols-2",
  orderContent: "grid gap-5",
  folderSummary: "mb-5 grid grid-cols-3 divide-x divide-[#e4e7e3] rounded-lg border border-[#e4e7e3] bg-[#fafbf9] py-3 [&_span]:px-2 [&_span]:text-center [&_span]:text-[11px] [&_span]:text-[#75807b] [&_strong]:mb-1 [&_strong]:block [&_strong]:text-lg [&_strong]:font-semibold [&_strong]:leading-none [&_strong]:text-[#202825]",
  folderOrderList: "divide-y divide-[#e7e9e6] overflow-hidden rounded-lg border border-[#e4e7e3]",
  folderOrderCard: "grid w-full cursor-pointer grid-cols-[40px_minmax(90px,1fr)_auto_16px] items-center gap-2.5 bg-white p-3 text-left transition-colors hover:bg-[#fafbf9] [&>svg]:size-3.5 [&>svg]:text-[#9aa39f] max-[480px]:grid-cols-[40px_minmax(0,1fr)_16px] max-[480px]:[&>span:nth-child(3)]:col-start-2 max-[480px]:[&>span:nth-child(3)]:row-start-2",
  folderOrderCopy: "min-w-0 [&_strong]:block [&_strong]:truncate [&_strong]:text-[13px] [&_strong]:font-semibold [&_small]:mt-1 [&_small]:block [&_small]:truncate [&_small]:text-[11px] [&_small]:text-[#6f7a74]",
  detailBlock: "grid gap-2 [&>span]:text-[11px] [&>span]:font-semibold [&>span]:text-[#69736e] [&_p]:m-0 [&_p]:text-[13px] [&_p]:leading-relaxed [&_p]:text-[#56615c]",
  detailTitle: "flex justify-between [&>span]:text-[11px] [&>span]:font-semibold [&>span]:text-[#69736e] [&_small]:text-[11px] [&_small]:text-[#75807b]",
  imageGrid: "grid grid-cols-2 gap-[9px]",
  imageTile: "flex aspect-[1.35] min-w-0 flex-col items-center justify-center gap-2 rounded-lg bg-[#eef1ee] text-[#78837e] [&_svg]:size-5 [&_small]:max-w-[85%] [&_small]:truncate [&_small]:text-[11px] [&_time]:text-[10px] [&_time]:text-[#65706b]",
  imagePreview: "relative justify-end overflow-hidden bg-cover bg-center text-white after:absolute after:inset-x-0 after:bottom-0 after:top-[45%] after:bg-gradient-to-b after:from-transparent after:to-[rgb(14_24_21/75%)] [&_small]:relative [&_small]:z-[1] [&_small]:text-white [&_small]:[text-shadow:0_1px_2px_rgb(0_0_0/30%)] [&_time]:relative [&_time]:z-[1] [&_time]:text-white [&_time]:[text-shadow:0_1px_2px_rgb(0_0_0/30%)]",
  detailEmpty: "col-span-full p-7 text-center text-[11px] text-[#75807b]",
  pagePanel: "mx-auto w-full max-w-[760px]",
  pageCard: "rounded-xl border border-[#e4e6e3] bg-white p-6 max-[520px]:p-4",
  backButton: "mb-4 inline-flex cursor-pointer items-center gap-2 rounded-lg px-1 py-2 text-xs font-semibold text-[#66716c] transition-colors hover:text-[#235c4c] focus-visible:outline-2 focus-visible:outline-[#235c4c] [&_svg]:size-4",
} as const;

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" })
    .format(new Date(value))
    .replace(".", "");
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}
