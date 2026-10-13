export default function Error() {
  return (
    <div className="min-h-screen bg-error/80 border-on-error/80 flex items-center justify-center">
      <div className="bg-surface-container-low rounded-xl p-8 max-w-md text-center border border-error/20">
        <span className="material-symbols-outlined text-[48px] text-error-crimson mb-4">
          error
        </span>
        <h2 className="text-xl font-bold text-error-crimson mb-2">
          Something went wrong
        </h2>
        <p className="text-on-surface-variant mb-6">
          An unexpected error occurred. Please try again.
        </p>
        <button
          className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-opacity"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    </div>
  );
}