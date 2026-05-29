export default function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <p className="text-gray-600">
        AI-powered investment research pipeline. Select a step from the sidebar to get started.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {['Ingest', 'Template', 'Dossier', 'Score', 'Audit'].map((step, i) => (
          <div key={step} className="rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold">Step {i + 1}: {step}</h3>
            <p className="text-sm text-gray-500 mt-1">Pending</p>
          </div>
        ))}
      </div>
    </div>
  );
}
