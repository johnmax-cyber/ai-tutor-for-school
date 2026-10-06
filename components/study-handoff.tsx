"use client";

import Link from "next/link";

export interface StudyHandoffProps {
  handoffText: string;
}

export default function StudyHandoff({ handoffText }: StudyHandoffProps) {
  return (
    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
      <h2 className="text-xl font-bold mb-4">Study Session Summary</h2>
      <div className="whitespace-pre-line text-sm text-gray-700">
        {handoffText}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">
            Generated at: {new Date().toLocaleString()}
          </span>
          <Link
            href="/study/new"
            className="inline-block px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Start New Session
          </Link>
        </div>
      </div>
    </div>
  );
}