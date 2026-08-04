import { OrdersDashboard } from "../../_components/orders-dashboard";

export default async function FolderDetailPage({
  params,
}: {
  params: Promise<{ carpetaId: string }>;
}) {
  const { carpetaId } = await params;
  return <OrdersDashboard view="carpeta" entityId={carpetaId} />;
}
