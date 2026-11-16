import ChatInterface from '@/components/ChatInterface';

export const dynamic = 'force-dynamic';

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  return <ChatInterface key={project ?? 'fresh'} projectId={project ?? null} />;
}
