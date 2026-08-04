import { OrdersDashboard } from "../../_components/orders-dashboard";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ pedidoId: string }>;
}) {
  const { pedidoId } = await params;
  return <OrdersDashboard view="pedido" entityId={pedidoId} />;
}
