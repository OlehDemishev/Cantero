import { AcceptInvite } from "@/components/accept-invite";

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInvite token={token} />;
}
