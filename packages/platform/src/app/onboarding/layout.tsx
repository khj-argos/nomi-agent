export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4 md:p-8">
      {children}
    </div>
  );
}
