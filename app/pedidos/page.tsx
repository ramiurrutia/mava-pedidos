import { OrdersDashboard } from "../_components/orders-dashboard";
import { redirect } from "next/navigation";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string | string[] }>;
}) {
  const requestedStatus = (await searchParams).estado;
  if (requestedStatus === "Archivado") redirect("/pedidos/archivados");
  return <OrdersDashboard initialStatus="Pendiente" view="pedidos" />;
}
