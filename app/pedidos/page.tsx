import { OrdersDashboard } from "../_components/orders-dashboard";
import type { OrderStatus } from "../../lib/orders";

const validStatuses: OrderStatus[] = ["Pendiente", "En producción", "Terminado", "Entregado"];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string | string[] }>;
}) {
  const requestedStatus = (await searchParams).estado;
  const status = typeof requestedStatus === "string" && validStatuses.includes(requestedStatus as OrderStatus)
    ? requestedStatus as OrderStatus
    : undefined;

  return <OrdersDashboard initialStatus={status} view="pedidos" />;
}
