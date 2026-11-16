import ChatInterface from '@/components/ChatInterface';

export const dynamic = 'force-dynamic';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChatInterface key={id} conversationId={id} />;
}
