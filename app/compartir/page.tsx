import { Suspense } from "react";
import { OrdersDashboard } from "../_components/orders-dashboard";
import { LoadingPage } from "../_components/orders/resource-states";

export default function SharePage() {
  return <Suspense fallback={<LoadingPage />}><OrdersDashboard view="compartir" /></Suspense>;
}
