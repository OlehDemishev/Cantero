import { ContractDetail } from "@/components/contract-detail";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContractDetail contractId={id} />;
}
