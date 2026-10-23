import { EstimateDetail } from "@/components/estimate-detail";

export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EstimateDetail estimateId={id} />;
}
