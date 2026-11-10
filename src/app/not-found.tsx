import BackButton from "@/components/BackButton";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-6 space-y-3">
        <BackButton href="/" label="Home" />
        <h1 className="text-lg font-semibold text-gray-900">Page not found</h1>
        <p className="text-sm text-gray-600">
          That group or page doesn&apos;t exist. Check the link, or join the group by its name from
          the home page.
        </p>
      </div>
    </main>
  );
}
