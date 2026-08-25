import { LeadForm } from "@/components/lead-form";

export default async function LeadFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <LeadForm token={token} />;
}
