import { WorkerDetail } from "@/components/worker-detail";

export default async function WorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkerDetail workerId={id} />;
}
